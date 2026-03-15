#!/usr/bin/env node
/**
 * Dactyl Summarization Agent
 * A seed specialist agent for the A2A marketplace
 * 
 * This agent:
 * 1. Registers with Dactyl (if not already registered)
 * 2. Polls the "summarization" lane for open tasks
 * 3. Claims tasks and generates summaries using extractive techniques
 * 4. Submits results and earns karma
 * 
 * Run: node agents/summarization-agent.js
 */

import { DactylClient } from '../sdk/typescript/dist/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '.summarization-agent.json');

// Configuration
const DACTYL_BASE_URL = 'https://dactyl-api.fly.dev/v1';
const LANE_SLUG = 'summarization';
const POLL_INTERVAL_MS = 30000; // 30 seconds

// Common stop words to filter out
const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare',
  'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by',
  'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above',
  'below', 'between', 'under', 'and', 'but', 'or', 'yet', 'so', 'if',
  'because', 'although', 'though', 'while', 'where', 'when', 'that',
  'which', 'who', 'whom', 'whose', 'what', 'this', 'these', 'those',
  'i', 'you', 'he', 'she', 'it', 'we', 'they', 'me', 'him', 'her',
  'us', 'them', 'my', 'your', 'his', 'her', 'its', 'our', 'their'
]);

class SummarizationAgent {
  constructor() {
    this.client = null;
    this.agentId = null;
    this.config = this.loadConfig();
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      }
    } catch (err) {
      console.error('Error loading config:', err.message);
    }
    return {};
  }

  saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error('Error saving config:', err.message);
    }
  }

  async register() {
    if (this.config.apiKey && this.config.agentId) {
      console.log('Already registered as:', this.config.agentId);
      this.client = new DactylClient({ 
        baseUrl: DACTYL_BASE_URL,
        apiKey: this.config.apiKey 
      });
      await this.client.getToken();
      this.agentId = this.config.agentId;
      return;
    }

    console.log('Registering with Dactyl...');
    
    const response = await fetch(`${DACTYL_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: 'SummarizationBot',
        description: 'Text summarization specialist. Extracts key points and generates concise summaries from documents, articles, and long-form content.',
        capability_tags: ['summarization', 'text-analysis', 'nlp', 'content-processing'],
        webhook_url: null
      })
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    console.log('Registered! Agent ID:', data.agent_id);
    console.log('API Key (save this):', data.api_key);
    
    this.config = {
      agentId: data.agent_id,
      apiKey: data.api_key,
      registeredAt: new Date().toISOString()
    };
    this.saveConfig();
    
    this.client = new DactylClient({ 
      baseUrl: DACTYL_BASE_URL,
      apiKey: data.api_key 
    });
    await this.client.getToken();
    this.agentId = data.agent_id;
  }

  async getMyProfile() {
    try {
      const profile = await this.client.getAgentProfile();
      console.log('\n📊 My Profile:');
      console.log(`  Name: ${profile.display_name}`);
      console.log(`  Karma: ${profile.karma}`);
      console.log(`  Tier: ${profile.tier}`);
      console.log(`  Tasks Completed: ${profile.tasks_completed}`);
      return profile;
    } catch (err) {
      console.error('Error fetching profile:', err.message);
    }
  }

  async pollForTasks() {
    console.log(`\n🔍 Polling for tasks in "${LANE_SLUG}" lane...`);
    
    try {
      const response = await fetch(
        `${DACTYL_BASE_URL}/lanes/${LANE_SLUG}/tasks?status=open&limit=5`,
        {
          headers: {
            'X-Agent-Token': this.client.token,
            'Authorization': `Bearer ${this.client.token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.status}`);
      }

      const data = await response.json();
      const tasks = data.tasks || [];
      
      if (tasks.length === 0) {
        console.log('  No open tasks found');
        return null;
      }

      console.log(`  Found ${tasks.length} open task(s)`);
      return tasks[0];
    } catch (err) {
      console.error('Error polling:', err.message);
      return null;
    }
  }

  async claimTask(taskId) {
    console.log(`\n🎯 Claiming task ${taskId}...`);
    
    try {
      const response = await fetch(
        `${DACTYL_BASE_URL}/tasks/${taskId}/claim`,
        {
          method: 'POST',
          headers: {
            'X-Agent-Token': this.client.token,
            'Authorization': `Bearer ${this.client.token}`
          }
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.log(`  Could not claim: ${error.error?.code || response.status}`);
        return false;
      }

      const data = await response.json();
      console.log(`  ✅ Claimed! Status: ${data.status}`);
      return true;
    } catch (err) {
      console.error('Error claiming:', err.message);
      return false;
    }
  }

  tokenize(text) {
    return text.toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter(word => word.length > 2 && !STOP_WORDS.has(word));
  }

  scoreSentences(text, maxSentences = 5) {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const words = this.tokenize(text);
    
    // Calculate word frequency
    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Score each sentence
    const sentenceScores = sentences.map((sentence, index) => {
      const sentenceWords = this.tokenize(sentence);
      let score = 0;
      
      // Frequency score
      sentenceWords.forEach(word => {
        score += wordFreq[word] || 0;
      });
      
      // Position bonus (earlier sentences often more important)
      if (index < 2) score *= 1.5;
      
      // Length normalization
      score = score / (sentenceWords.length + 1);
      
      return { sentence: sentence.trim(), score, index };
    });

    // Sort by score and return top sentences
    return sentenceScores
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSentences)
      .sort((a, b) => a.index - b.index); // Restore original order
  }

  extractKeyPoints(text, numPoints = 3) {
    const words = this.tokenize(text);
    const wordFreq = {};
    words.forEach(word => {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    });

    // Get top keywords
    const topWords = Object.entries(wordFreq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);

    // Find sentences containing top words
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    const keyPoints = [];

    for (const sentence of sentences) {
      if (keyPoints.length >= numPoints) break;
      
      const hasKeyword = topWords.some(word => 
        sentence.toLowerCase().includes(word)
      );
      
      if (hasKeyword && sentence.length > 40) {
        keyPoints.push(sentence.trim());
      }
    }

    return keyPoints;
  }

  summarize(text, options = {}) {
    const { 
      maxLength = 200, 
      format = 'paragraph',
      includeKeyPoints = true 
    } = options;

    const stats = {
      originalLength: text.length,
      originalWords: text.split(/\s+/).length,
      compressionRatio: 0
    };

    // Generate extractive summary
    const topSentences = this.scoreSentences(text, 5);
    const summaryText = topSentences
      .map(s => s.sentence)
      .join(' ')
      .substring(0, maxLength);

    // Extract key points
    const keyPoints = includeKeyPoints 
      ? this.extractKeyPoints(text, 3)
      : [];

    stats.summaryLength = summaryText.length;
    stats.summaryWords = summaryText.split(/\s+/).length;
    stats.compressionRatio = (stats.summaryLength / stats.originalLength).toFixed(2);

    return {
      summary: summaryText,
      keyPoints,
      stats,
      format,
      topSentences: topSentences.map(s => s.sentence)
    };
  }

  async submitResult(taskId, result) {
    console.log(`\n📤 Submitting summary result...`);
    
    try {
      const response = await fetch(
        `${DACTYL_BASE_URL}/tasks/${taskId}/result`,
        {
          method: 'POST',
          headers: {
            'X-Agent-Token': this.client.token,
            'Authorization': `Bearer ${this.client.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            result_payload: result
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.log(`  Failed to submit: ${error.error?.code || response.status}`);
        return false;
      }

      const data = await response.json();
      console.log(`  ✅ Submitted! Status: ${data.status}`);
      console.log(`  Karma pending: ${data.karma_pending}`);
      return true;
    } catch (err) {
      console.error('Error submitting:', err.message);
      return false;
    }
  }

  async processTask(task) {
    console.log(`\n📋 Processing task: ${task.title}`);
    
    const input = task.input_payload || {};
    const content = input.content || input.text || input.document || '';
    
    if (!content) {
      console.log('  ⚠️ No content to summarize');
      return;
    }

    console.log(`  Content length: ${content.length} chars`);
    console.log('  Generating summary...');
    
    const summary = this.summarize(content, {
      maxLength: input.maxLength || 200,
      format: input.format || 'paragraph',
      includeKeyPoints: input.includeKeyPoints !== false
    });

    console.log(`  Summary: ${summary.summary.substring(0, 100)}...`);
    console.log(`  Compression: ${(summary.stats.compressionRatio * 100).toFixed(0)}%`);
    
    await this.submitResult(task.task_id, summary);
  }

  async run() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║     Dactyl Summarization Agent - Seed Specialist       ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    await this.register();
    await this.getMyProfile();

    console.log('\n🤖 Agent is running. Press Ctrl+C to stop.\n');

    while (true) {
      const task = await this.pollForTasks();
      
      if (task) {
        const claimed = await this.claimTask(task.task_id);
        if (claimed) {
          await this.processTask(task);
          await this.getMyProfile();
        }
      }

      console.log(`\n⏳ Waiting ${POLL_INTERVAL_MS/1000}s before next poll...`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

const agent = new SummarizationAgent();
agent.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
