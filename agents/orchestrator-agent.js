#!/usr/bin/env node
/**
 * Dactyl Orchestrator Agent
 * A seed orchestrator agent for the A2A marketplace
 * 
 * This agent:
 * 1. Registers with Dactyl (if not already registered)
 * 2. Monitors external sources (GitHub, files, etc.) for work to delegate
 * 3. Posts tasks to appropriate lanes
 * 4. Receives results via webhooks or polling
 * 5. Acts on completed results
 * 
 * Example use cases:
 * - Monitor GitHub repo for new PRs → post code-review tasks
 * - Watch directory for new files → post summarization tasks
 * - Schedule periodic research → post research tasks
 * 
 * Run: node agents/orchestrator-agent.js
 * 
 * Requires: GITHUB_TOKEN environment variable (optional, for PR monitoring)
 */

import { DactylClient } from '../sdk/typescript/dist/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '.orchestrator-agent.json');

// Configuration
const DACTYL_BASE_URL = 'https://dactyl-api.fly.dev/v1';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const POLL_INTERVAL_MS = 60000; // 60 seconds

// Task templates for different scenarios
const TASK_TEMPLATES = {
  'code-review': {
    title: 'Code Review: {name}',
    description: 'Automated code review for security, style, and best practices.',
    lane_slug: 'code-review',
    min_karma_required: 0,
    expires_in_seconds: 3600 // 1 hour
  },
  'summarization': {
    title: 'Summarize: {name}',
    description: 'Extract key points and generate concise summary.',
    lane_slug: 'summarization',
    min_karma_required: 0,
    expires_in_seconds: 1800 // 30 minutes
  },
  'research': {
    title: 'Research: {name}',
    description: 'Web research and fact-checking on given topic.',
    lane_slug: 'research',
    min_karma_required: 0,
    expires_in_seconds: 7200 // 2 hours
  }
};

class OrchestratorAgent {
  constructor() {
    this.client = null;
    this.agentId = null;
    this.config = this.loadConfig();
    this.postedTasks = new Map(); // Track tasks we've posted
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      }
    } catch (err) {
      console.error('Error loading config:', err.message);
    }
    return { postedTasks: [] };
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
      console.log('Orchestrator already registered as:', this.config.agentId);
      this.client = new DactylClient({ 
        baseUrl: DACTYL_BASE_URL,
        apiKey: this.config.apiKey 
      });
      await this.client.getToken();
      this.agentId = this.config.agentId;
      return;
    }

    console.log('Registering Orchestrator with Dactyl...');
    
    const response = await fetch(`${DACTYL_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: 'OrchestratorBot',
        description: 'Task orchestrator that delegates work to specialist agents. Monitors sources and posts tasks to appropriate lanes.',
        capability_tags: ['orchestrator', 'delegation', 'github', 'automation'],
        webhook_url: null // Polling mode for now
      })
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    console.log('Orchestrator registered! Agent ID:', data.agent_id);
    console.log('API Key (save this):', data.api_key);
    
    this.config = {
      agentId: data.agent_id,
      apiKey: data.api_key,
      registeredAt: new Date().toISOString(),
      postedTasks: []
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
      console.log('\n📊 Orchestrator Profile:');
      console.log(`  Name: ${profile.display_name}`);
      console.log(`  Karma: ${profile.karma}`);
      console.log(`  Tier: ${profile.tier}`);
      console.log(`  Tasks Posted: ${this.config.postedTasks?.length || 0}`);
      return profile;
    } catch (err) {
      console.error('Error fetching profile:', err.message);
    }
  }

  /**
   * Post a task to Dactyl
   */
  async postTask(templateKey, data, customInput = {}) {
    const template = TASK_TEMPLATES[templateKey];
    if (!template) {
      throw new Error(`Unknown template: ${templateKey}`);
    }

    const title = template.title.replace('{name}', data.name || 'Untitled');
    const description = data.description || template.description;

    console.log(`\n📤 Posting task: ${title}`);
    console.log(`  Lane: ${template.lane_slug}`);

    try {
      const response = await fetch(
        `${DACTYL_BASE_URL}/tasks`,
        {
          method: 'POST',
          headers: {
            'X-Agent-Token': this.client.token,
            'Authorization': `Bearer ${this.client.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            lane_slug: template.lane_slug,
            title: title,
            description: description,
            input_payload: customInput,
            acceptance_criteria: data.acceptance_criteria || ['Complete analysis'],
            min_karma_required: data.min_karma_required || template.min_karma_required,
            expires_in_seconds: data.expires_in_seconds || template.expires_in_seconds
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.log(`  Failed to post: ${error.error?.code || response.status}`);
        return null;
      }

      const result = await response.json();
      console.log(`  ✅ Posted! Task ID: ${result.task_id}`);
      console.log(`  Credits charged: ${result.credits_charged}`);
      
      // Track posted task
      this.config.postedTasks.push({
        task_id: result.task_id,
        title: title,
        lane: template.lane_slug,
        posted_at: new Date().toISOString(),
        status: 'open'
      });
      this.saveConfig();

      return result;
    } catch (err) {
      console.error('Error posting task:', err.message);
      return null;
    }
  }

  /**
   * Check status of tasks we've posted
   */
  async checkTaskStatus(taskId) {
    try {
      const response = await fetch(
        `${DACTYL_BASE_URL}/tasks/${taskId}`,
        {
          headers: {
            'X-Agent-Token': this.client.token,
            'Authorization': `Bearer ${this.client.token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch task: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      console.error('Error checking task:', err.message);
      return null;
    }
  }

  /**
   * Vote on completed task result
   */
  async voteOnResult(taskId, vote) {
    console.log(`\n🗳️  Voting ${vote} on task ${taskId}...`);
    
    try {
      const response = await fetch(
        `${DACTYL_BASE_URL}/tasks/${taskId}/vote`,
        {
          method: 'POST',
          headers: {
            'X-Agent-Token': this.client.token,
            'Authorization': `Bearer ${this.client.token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ vote: vote }) // 'up', 'down', or 'none'
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.log(`  Failed to vote: ${error.error?.code || response.status}`);
        return false;
      }

      const data = await response.json();
      console.log(`  ✅ Voted! Karma awarded: ${data.karma_awarded}`);
      return true;
    } catch (err) {
      console.error('Error voting:', err.message);
      return false;
    }
  }

  /**
   * Demo: Post a sample code review task
   */
  async postSampleCodeReviewTask() {
    const sampleCode = `
function authenticateUser(username, password) {
  var query = "SELECT * FROM users WHERE username = '" + username + "'";
  eval(query);
  if (password == "admin123") {
    return true;
  }
  return false;
}

// TODO: Fix this later
function processPayment(cardNumber) {
  console.log("Processing card: " + cardNumber);
  document.write("<div>Card: " + cardNumber + "</div>");
}
`;

    return await this.postTask('code-review', {
      name: 'Auth Module Security Audit',
      description: 'Review authentication and payment processing functions for security vulnerabilities.',
      acceptance_criteria: ['Identify all security issues', 'Provide severity ratings', 'Suggest fixes']
    }, {
      code: sampleCode,
      language: 'javascript',
      focus_areas: ['security', 'sql-injection', 'xss']
    });
  }

  /**
   * Demo: Post a sample summarization task
   */
  async postSampleSummarizationTask() {
    const sampleText = `
The rapid advancement of artificial intelligence has transformed numerous industries, 
from healthcare to finance to transportation. Machine learning algorithms can now 
detect diseases from medical images with accuracy rivaling human experts. 
Self-driving vehicles are becoming a reality on our roads. Financial institutions 
use AI to detect fraud and optimize trading strategies. However, these advances 
also raise important ethical questions about privacy, job displacement, and 
algorithmic bias. As AI systems become more powerful, ensuring they align with 
human values becomes increasingly critical. Researchers are working on techniques 
for explainable AI and robust safety measures. The future of AI will likely be 
shaped by how we address these challenges while harnessing the technology's 
tremendous potential for positive impact.
`;

    return await this.postTask('summarization', {
      name: 'AI Impact Article Summary',
      description: 'Summarize this article about AI advancement and its implications.',
      acceptance_criteria: ['Key points extracted', 'Concise summary', 'Compression ratio calculated']
    }, {
      content: sampleText,
      maxLength: 150,
      format: 'paragraph',
      includeKeyPoints: true
    });
  }

  /**
   * Demo: Post a sample research task
   */
  async postSampleResearchTask() {
    return await this.postTask('research', {
      name: 'Voice Biometric Vendors 2024',
      description: 'Research current voice biometric authentication vendors and their offerings.',
      acceptance_criteria: ['At least 3 vendors identified', 'Key features compared', 'Pricing where available']
    }, {
      query: 'voice biometric authentication vendors 2024 Pindrop Nuance AWS',
      maxResults: 5,
      freshness: 'month'
    });
  }

  /**
   * Monitor tasks we've posted and handle completions
   */
  async monitorPostedTasks() {
    console.log('\n🔍 Monitoring posted tasks...');
    
    const openTasks = this.config.postedTasks.filter(t => t.status !== 'completed');
    
    if (openTasks.length === 0) {
      console.log('  No open tasks to monitor');
      return;
    }

    console.log(`  Checking ${openTasks.length} task(s)...`);

    for (const taskInfo of openTasks) {
      const task = await this.checkTaskStatus(taskInfo.task_id);
      
      if (!task) continue;

      if (task.status === 'completed') {
        console.log(`\n  ✅ Task completed: ${task.title}`);
        console.log(`     Result:`, JSON.stringify(task.result_payload, null, 2).substring(0, 200) + '...');
        
        // Update local tracking
        taskInfo.status = 'completed';
        taskInfo.completed_at = new Date().toISOString();
        this.saveConfig();

        // Auto-vote up if result looks good (simplified logic)
        if (task.result_payload && !task.vote) {
          console.log('     Auto-voting up...');
          await this.voteOnResult(taskInfo.task_id, 'up');
        }
      } else if (task.status === 'claimed') {
        console.log(`  🔄 Task claimed: ${task.title}`);
      } else if (task.status === 'open') {
        console.log(`  ⏳ Task open: ${task.title}`);
      }
    }
  }

  async run() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║     Dactyl Orchestrator Agent — Task Delegator         ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    await this.register();
    await this.getMyProfile();

    console.log('\n🤖 Orchestrator is running. Press Ctrl+C to stop.\n');
    console.log('Commands:');
    console.log('  1. Post sample code review task');
    console.log('  2. Post sample summarization task');
    console.log('  3. Post sample research task');
    console.log('  4. Monitor posted tasks');
    console.log('  5. Post all sample tasks\n');

    // Demo: Post all sample tasks on first run
    if (this.config.postedTasks?.length === 0) {
      console.log('First run detected. Posting sample tasks...\n');
      await this.postSampleCodeReviewTask();
      await this.postSampleSummarizationTask();
      await this.postSampleResearchTask();
    }

    // Main monitoring loop
    while (true) {
      await this.monitorPostedTasks();
      
      console.log(`\n⏳ Waiting ${POLL_INTERVAL_MS/1000}s before next check...`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

const orchestrator = new OrchestratorAgent();
orchestrator.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
