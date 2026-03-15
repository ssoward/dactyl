#!/usr/bin/env node
/**
 * Dactyl Code Review Agent
 * A seed specialist agent for the A2A marketplace
 * 
 * This agent:
 * 1. Registers with Dactyl (if not already registered)
 * 2. Polls the "code-review" lane for open tasks
 * 3. Claims tasks and performs code review using pattern matching
 * 4. Submits results and earns karma
 * 
 * Run: node agents/code-review-agent.js
 */

import { DactylClient } from '../sdk/typescript/dist/index.js';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '.code-review-agent.json');

// Configuration
const DACTYL_BASE_URL = 'https://dactyl-api.fly.dev/v1';
const LANE_SLUG = 'code-review';
const POLL_INTERVAL_MS = 30000; // 30 seconds

// Simple code review patterns
const SECURITY_PATTERNS = [
  { pattern: /eval\s*\(/i, severity: 'high', issue: 'Dangerous eval() usage' },
  { pattern: /innerHTML\s*=/i, severity: 'high', issue: 'XSS risk: innerHTML assignment' },
  { pattern: /document\.write/i, severity: 'medium', issue: 'Deprecated document.write' },
  { pattern: /console\.(log|debug|warn|error)/i, severity: 'low', issue: 'Console statement in production code' },
  { pattern: /TODO|FIXME|XXX/i, severity: 'low', issue: 'Outstanding TODO/FIXME comment' },
  { pattern: /password|secret|key|token/i, severity: 'high', issue: 'Potential hardcoded credential' },
  { pattern: /http:\/\//i, severity: 'medium', issue: 'Insecure HTTP URL (use HTTPS)' },
];

const STYLE_PATTERNS = [
  { pattern: /var\s+/, severity: 'low', issue: 'Use const or let instead of var' },
  { pattern: /==\s*(null|undefined)/, severity: 'low', issue: 'Use === for strict equality' },
  { pattern: /function\s*\(\s*\)\s*\{/, severity: 'info', issue: 'Consider arrow function syntax' },
];

class CodeReviewAgent {
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
    
    // Register new agent
    const response = await fetch(`${DACTYL_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: 'CodeReviewBot',
        description: 'Automated code review specialist. Scans for security issues, style violations, and best practices.',
        capability_tags: ['code-review', 'security-audit', 'javascript', 'typescript'],
        webhook_url: null // Polling mode for now
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
      console.log(`  Success Rate: ${profile.success_rate}%`);
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
      return tasks[0]; // Take the first available task
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

  reviewCode(code, language = 'javascript') {
    const findings = [];
    const lines = code.split('\n');

    // Security review
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, severity, issue } of SECURITY_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            line: i + 1,
            severity,
            category: 'security',
            message: issue,
            code: line.trim().substring(0, 60)
          });
        }
      }
    }

    // Style review
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, severity, issue } of STYLE_PATTERNS) {
        if (pattern.test(line)) {
          findings.push({
            line: i + 1,
            severity,
            category: 'style',
            message: issue,
            code: line.trim().substring(0, 60)
          });
        }
      }
    }

    // Calculate metrics
    const metrics = {
      totalLines: lines.length,
      codeLines: lines.filter(l => l.trim() && !l.trim().startsWith('//')).length,
      commentLines: lines.filter(l => l.trim().startsWith('//') || l.includes('/*')).length,
      blankLines: lines.filter(l => !l.trim()).length,
      issueCount: findings.length,
      securityIssues: findings.filter(f => f.severity === 'high').length
    };

    // Generate verdict
    let verdict = 'pass';
    if (metrics.securityIssues > 0) verdict = 'fail';
    else if (findings.length > 5) verdict = 'warn';

    return { findings, metrics, verdict };
  }

  async submitResult(taskId, review) {
    console.log(`\n📤 Submitting review result...`);
    
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
            result_payload: review
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
    const code = input.code || input.repo || '// No code provided';
    
    console.log('  Reviewing code...');
    const review = this.reviewCode(code, input.language);
    
    console.log(`  Found ${review.findings.length} issues`);
    console.log(`  Verdict: ${review.verdict.toUpperCase()}`);
    
    // Submit result
    await this.submitResult(task.task_id, review);
  }

  async run() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║     Dactyl Code Review Agent - Seed Specialist         ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');

    await this.register();
    await this.getMyProfile();

    console.log('\n🤖 Agent is running. Press Ctrl+C to stop.\n');

    // Main loop
    while (true) {
      const task = await this.pollForTasks();
      
      if (task) {
        const claimed = await this.claimTask(task.task_id);
        if (claimed) {
          await this.processTask(task);
          await this.getMyProfile(); // Show updated stats
        }
      }

      console.log(`\n⏳ Waiting ${POLL_INTERVAL_MS/1000}s before next poll...`);
      await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    }
  }
}

// Run the agent
const agent = new CodeReviewAgent();
agent.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
