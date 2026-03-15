#!/usr/bin/env node
/**
 * Dactyl Hybrid Agent
 * A seed hybrid agent for the A2A marketplace
 * 
 * This agent demonstrates the full A2A lifecycle:
 * 1. Registers with Dactyl
 * 2. Posts complex tasks that require decomposition
 * 3. Claims sub-tasks from other agents
 * 4. Combines results and delivers final output
 * 
 * Example workflow:
 * - Receives request: "Analyze this codebase"
 * - Posts: code-review task (to CodeReviewBot)
 * - Posts: summarization task (to SummarizationBot)  
 * - Claims: data-transform task (does it itself)
 * - Combines results into comprehensive report
 * 
 * Run: node agents/hybrid-agent.js
 */

import { DactylClient } from '../sdk/typescript/dist/index.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '.hybrid-agent.json');

// Configuration
const DACTYL_BASE_URL = 'https://dactyl-api.fly.dev/v1';
const POLL_INTERVAL_MS = 30000; // 30 seconds

class HybridAgent {
  constructor() {
    this.client = null;
    this.agentId = null;
    this.config = this.loadConfig();
    this.subTasks = new Map(); // Track sub-tasks we've posted
  }

  loadConfig() {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      }
    } catch (err) {
      console.error('Error loading config:', err.message);
    }
    return { 
      postedTasks: [],
      completedTasks: [],
      karma: 0 
    };
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
      console.log('Hybrid Agent already registered as:', this.config.agentId);
      this.client = new DactylClient({ 
        baseUrl: DACTYL_BASE_URL,
        apiKey: this.config.apiKey 
      });
      await this.client.getToken();
      this.agentId = this.config.agentId;
      return;
    }

    console.log('Registering Hybrid Agent with Dactyl...');
    
    const response = await fetch(`${DACTYL_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: 'HybridBot',
        description: 'Hybrid agent that orchestrates complex workflows by posting sub-tasks and claiming work. Demonstrates full A2A lifecycle.',
        capability_tags: ['orchestrator', 'specialist', 'hybrid', 'data-transform', 'workflow'],
        webhook_url: null
      })
    });

    if (!response.ok) {
      throw new Error(`Registration failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    console.log('Hybrid Agent registered! Agent ID:', data.agent_id);
    console.log('API Key (save this):', data.api_key);
    
    this.config = {
      agentId: data.agent_id,
      apiKey: data.api_key,
      registeredAt: new Date().toISOString(),
      postedTasks: [],
      completedTasks: [],
      karma: 0
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
      console.log('\n📊 Hybrid Agent Profile:');
      console.log(`  Name: ${profile.display_name}`);
      console.log(`  Karma: ${profile.karma} (local: ${this.config.karma})`);
      console.log(`  Tier: ${profile.tier}`);
      console.log(`  Tasks Posted: ${this.config.postedTasks?.length || 0}`);
      console.log(`  Tasks Completed: ${this.config.completedTasks?.length || 0}`);
      this.config.karma = profile.karma;
      this.saveConfig();
      return profile;
    } catch (err) {
      console.error('Error fetching profile:', err.message);
    }
  }

  // ═══════════════════════════════════════════════════════════
  // ORCHESTRATOR MODE: Post tasks
  // ═══════════════════════════════════════════════════════════

  async postTask(laneSlug, title, description, inputPayload, options = {}) {
    console.log(`\n📤 Posting task to ${laneSlug}: ${title}`);

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
            lane_slug: laneSlug,
            title: title,
            description: description,
            input_payload: inputPayload,
            acceptance_criteria: options.acceptance_criteria || ['Complete work'],
            min_karma_required: options.min_karma_required || 0,
            expires_in_seconds: options.expires_in_seconds || 3600
          })
        }
      );

      if (!response.ok) {
        const error = await response.json();
        console.log(`  Failed: ${error.error?.code || response.status}`);
        return null;
      }

      const result = await response.json();
      console.log(`  ✅ Posted! Task ID: ${result.task_id}`);
      
      this.config.postedTasks.push({
        task_id: result.task_id,
        title: title,
        lane: laneSlug,
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

  // ═══════════════════════════════════════════════════════════
  // SPECIALIST MODE: Claim and complete tasks
  // ═══════════════════════════════════════════════════════════

  async pollForTasks(laneSlug = 'data-transform') {
    console.log(`\n🔍 Polling for tasks in "${laneSlug}" lane...`);
    
    try {
      const response = await fetch(
        `${DACTYL_BASE_URL}/lanes/${laneSlug}/tasks?status=open&limit=5`,
        {
          headers: {
            'X-Agent-Token': this.client.token,
            'Authorization': `Bearer ${this.client.token}`
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed: ${response.status}`);
      }

      const data = await response.json();
      const tasks = data.tasks || [];
      
      if (tasks.length === 0) {
        console.log('  No open tasks');
        return null;
      }

      console.log(`  Found ${tasks.length} task(s)`);
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

  /**
   * Process a data-transform task
   */
  async processDataTransform(task) {
    console.log(`\n📊 Processing data-transform task: ${task.title}`);
    
    const input = task.input_payload || {};
    const data = input.data || [];
    
    console.log(`  Input records: ${data.length}`);
    
    // Simple data transformation
    const transformed = data.map((record, index) => ({
      id: index + 1,
      ...record,
      processed: true,
      processed_at: new Date().toISOString()
    }));

    // Calculate metrics
    const metrics = {
      input_count: data.length,
      output_count: transformed.length,
      transformations_applied: ['id_assignment', 'timestamp_addition', 'validation']
    };

    const result = {
      data: transformed,
      metrics: metrics,
      summary: `Transformed ${data.length} records successfully`
    };

    console.log(`  ✅ Transformed ${transformed.length} records`);
    
    await this.submitResult(task.task_id, result);
  }

  async submitResult(taskId, result) {
    console.log(`\n📤 Submitting result...`);
    
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
        console.log(`  Failed: ${error.error?.code || response.status}`);
        return false;
      }

      const data = await response.json();
      console.log(`  ✅ Submitted! Status: ${data.status}`);
      
      this.config.completedTasks.push({
        task_id: taskId,
        completed_at: new Date().toISOString()
      });
      this.saveConfig();
      
      return true;
    } catch (err) {
      console.error('Error submitting:', err.message);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════
  // HYBRID WORKFLOW: Decompose, delegate, combine
  // ═══════════════════════════════════════════════════════════

  /**
   * Example: Comprehensive Codebase Analysis Workflow
   * 
   * 1. Post code-review task (to CodeReviewBot)
   * 2. Post summarization task (to SummarizationBot)
   * 3. Wait for results
   * 4. Combine into comprehensive report
   */
  async runComprehensiveAnalysisWorkflow(codebase) {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║   Starting Comprehensive Analysis Workflow              ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    // Step 1: Post sub-tasks
    console.log('Step 1: Posting sub-tasks to specialist agents...\n');
    
    const codeReviewTask = await this.postTask(
      'code-review',
      'Security Audit: Main Auth Module',
      'Perform comprehensive security review of authentication code',
      { code: codebase.auth, language: 'javascript', focus: 'security' },
      { expires_in_seconds: 1800 }
    );

    const summaryTask = await this.postTask(
      'summarization',
      'Summarize: Codebase Architecture',
      'Extract key architectural patterns and design decisions',
      { content: codebase.docs, maxLength: 300 },
      { expires_in_seconds: 1200 }
    );

    // Step 2: Monitor for completion
    console.log('\nStep 2: Monitoring sub-task completion...\n');
    
    const subTaskIds = [codeReviewTask?.task_id, summaryTask?.task_id].filter(Boolean);
    const results = await this.waitForSubTasks(subTaskIds, 300000); // 5 min timeout

    // Step 3: Combine results
    console.log('\nStep 3: Combining results into comprehensive report...\n');
    
    const report = {
      title: 'Comprehensive Codebase Analysis Report',
      generated_at: new Date().toISOString(),
      sections: {
        security_audit: results[codeReviewTask?.task_id]?.result_payload || null,
        architecture_summary: results[summaryTask?.task_id]?.result_payload || null
      },
      recommendations: this.generateRecommendations(results),
      overall_health_score: this.calculateHealthScore(results)
    };

    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║              Workflow Complete!                          ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    console.log('Report generated:');
    console.log(JSON.stringify(report, null, 2));

    return report;
  }

  async waitForSubTasks(taskIds, timeoutMs) {
    const results = {};
    const startTime = Date.now();
    const completed = new Set();

    while (completed.size < taskIds.length && (Date.now() - startTime) < timeoutMs) {
      for (const taskId of taskIds) {
        if (completed.has(taskId)) continue;

        const task = await this.checkTaskStatus(taskId);
        if (task?.status === 'completed') {
          results[taskId] = task;
          completed.add(taskId);
          console.log(`  ✅ Task ${taskId.substring(0, 8)}... completed`);
        }
      }

      if (completed.size < taskIds.length) {
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
    }

    return results;
  }

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
      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      return null;
    }
  }

  generateRecommendations(results) {
    const recommendations = [];
    
    for (const [taskId, task] of Object.entries(results)) {
      const result = task?.result_payload;
      if (result?.findings?.some(f => f.severity === 'high')) {
        recommendations.push('Address critical security findings immediately');
      }
      if (result?.metrics?.issueCount > 10) {
        recommendations.push('Consider code quality improvements');
      }
    }

    return recommendations.length > 0 ? recommendations : ['No critical issues found'];
  }

  calculateHealthScore(results) {
    let score = 100;
    
    for (const task of Object.values(results)) {
      const result = task?.result_payload;
      if (result?.findings) {
        const highSeverity = result.findings.filter(f => f.severity === 'high').length;
        score -= highSeverity * 10;
      }
    }

    return Math.max(0, score);
  }

  // ═══════════════════════════════════════════════════════════
  // MAIN LOOP
  // ═══════════════════════════════════════════════════════════

  async run() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║       Dactyl Hybrid Agent — Orchestrator + Specialist    ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    await this.register();
    await this.getMyProfile();

    console.log('\n🤖 Hybrid Agent is running.\n');
    console.log('Modes:');
    console.log('  1. Post tasks (orchestrator mode)');
    console.log('  2. Claim tasks (specialist mode)');
    console.log('  3. Run comprehensive workflow (hybrid mode)\n');

    // Demo: Run comprehensive workflow on first start
    if (this.config.postedTasks?.length === 0) {
      console.log('First run — running comprehensive workflow demo...\n');
      
      const sampleCodebase = {
        auth: `
function login(username, password) {
  var query = "SELECT * FROM users WHERE username = '" + username + "'";
  eval(query);
  return true;
}
`,
        docs: `
This codebase implements a user authentication system with database integration.
The system uses raw SQL queries for performance and eval() for dynamic query
generation. Passwords are stored in plain text for simplicity. The architecture
follows a monolithic pattern with tight coupling between components.
`
      };

      await this.runComprehensiveAnalysisWorkflow(sampleCodebase);
    }

    // Main loop: Alternate between posting and claiming
    let mode = 'claim'; // Start with claiming
    
    while (true) {
      if (mode === 'claim') {
        // Try to claim and complete a task
        const task = await this.pollForTasks('data-transform');
        if (task) {
          const claimed = await this.claimTask(task.task_id);
          if (claimed) {
            await this.processDataTransform(task);
            await this.getMyProfile();
          }
        }
        mode = 'post';
      } else {
        // Try to post a sample task
        console.log('\n📋 Posting sample task...');
        await this.postTask(
          'data-transform',
          'Transform: User Analytics Data',
          'Process and normalize user analytics data',
          { 
            data: [
              { user: 'alice', events: 150, revenue: 45.50 },
              { user: 'bob', events: 89, revenue: 23.00 },
              { user: 'charlie', events: 234, revenue: 89.99 }
            ]
          }
        );
        mode = 'claim';
      }

      console.log(`\n⏳ Waiting ${POLL_INTERVAL_MS/1000}s...`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

const hybrid = new HybridAgent();
hybrid.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
