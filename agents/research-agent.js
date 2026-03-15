#!/usr/bin/env node
/**
 * Dactyl Research Agent
 * A seed specialist agent for the A2A marketplace
 * 
 * This agent:
 * 1. Registers with Dactyl (if not already registered)
 * 2. Polls the "research" lane for open tasks
 * 3. Claims tasks and performs web research using Brave Search
 * 4. Submits results and earns karma
 * 
 * Run: node agents/research-agent.js
 * 
 * Requires: BRAVE_API_KEY environment variable
 */

import { DactylClient } from '../sdk/typescript/dist/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '.research-agent.json');

// Configuration
const DACTYL_BASE_URL = 'https://dactyl-api.fly.dev/v1';
const LANE_SLUG = 'research';
const POLL_INTERVAL_MS = 30000; // 30 seconds
const BRAVE_API_KEY = process.env.BRAVE_API_KEY;

class ResearchAgent {
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
        display_name: 'ResearchBot',
        description: 'Web research specialist. Performs real-time searches, fact-checking, and information synthesis from multiple sources.',
        capability_tags: ['research', 'web-search', 'fact-checking', 'information-synthesis'],
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

  async searchWeb(query, options = {}) {
    if (!BRAVE_API_KEY) {
      console.log('  ⚠️ BRAVE_API_KEY not set, using mock results');
      return this.mockSearch(query);
    }

    const { count = 5, freshness = null } = options;
    
    try {
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      url.searchParams.append('q', query);
      url.searchParams.append('count', count.toString());
      if (freshness) url.searchParams.append('freshness', freshness);

      const response = await fetch(url.toString(), {
        headers: {
          'Accept': 'application/json',
          'X-Subscription-Token': BRAVE_API_KEY
        }
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.status}`);
      }

      const data = await response.json();
      
      return {
        query,
        results: (data.web?.results || []).map(r => ({
          title: r.title,
          url: r.url,
          description: r.description,
          source: new URL(r.url).hostname
        })),
        totalResults: data.web?.total_results || 0,
        searchTime: new Date().toISOString()
      };
    } catch (err) {
      console.error('Search error:', err.message);
      return this.mockSearch(query);
    }
  }

  mockSearch(query) {
    // Fallback when API key not available
    return {
      query,
      results: [
        {
          title: `Results for "${query}"`,
          url: 'https://example.com',
          description: 'Mock search result - set BRAVE_API_KEY for real search',
          source: 'example.com'
        }
      ],
      totalResults: 1,
      searchTime: new Date().toISOString(),
      note: 'MOCK_MODE - Set BRAVE_API_KEY for real web search'
    };
  }

  synthesizeFindings(searchResults, query) {
    const { results } = searchResults;
    
    // Extract key facts from descriptions
    const keyFindings = results
      .slice(0, 3)
      .map(r => r.description)
      .filter(d => d && d.length > 20);

    // Identify sources
    const sources = [...new Set(results.map(r => r.source))];

    // Generate confidence score based on result quality
    const confidence = Math.min(
      100,
      Math.round((results.length / 5) * 100)
    );

    // Create synthesis
    const synthesis = {
      query,
      summary: `Found ${results.length} relevant results across ${sources.length} sources.`,
      keyFindings,
      sources: results.map(r => ({
        title: r.title,
        url: r.url,
        source: r.source
      })),
      confidence,
      topDomains: sources.slice(0, 5),
      searchTime: searchResults.searchTime
    };

    return synthesis;
  }

  async submitResult(taskId, result) {
    console.log(`\n📤 Submitting research result...`);
    
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
    console.log(`  Description: ${task.description?.substring(0, 100)}...`);
    
    const input = task.input_payload || {};
    const query = input.query || input.topic || input.question || task.title;
    
    if (!query) {
      console.log('  ⚠️ No research query provided');
      return;
    }

    console.log(`  Researching: "${query}"`);
    
    // Perform search
    const searchResults = await this.searchWeb(query, {
      count: input.maxResults || 5,
      freshness: input.freshness || null
    });

    console.log(`  Found ${searchResults.results.length} results`);

    // Synthesize findings
    const synthesis = this.synthesizeFindings(searchResults, query);

    console.log(`  Confidence: ${synthesis.confidence}%`);
    console.log(`  Sources: ${synthesis.sources.length}`);
    
    await this.submitResult(task.task_id, synthesis);
  }

  async run() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║       Dactyl Research Agent - Seed Specialist          ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    if (!BRAVE_API_KEY) {
      console.log('⚠️  Note: BRAVE_API_KEY not set. Using mock search mode.');
      console.log('   Set export BRAVE_API_KEY=your_key for real web search.\n');
    }

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

const agent = new ResearchAgent();
agent.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
