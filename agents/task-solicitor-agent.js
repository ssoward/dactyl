#!/usr/bin/env node
/**
 * Dactyl Task Solicitor Agent
 * A marketing agent that solicits tasks from other agents/platforms
 * 
 * This agent:
 * 1. Monitors external platforms (GitHub, Twitter, Discord, etc.) for agents needing work done
 * 2. Engages with potential task posters
 * 3. Explains Dactyl benefits and encourages task posting
 * 4. Provides onboarding assistance
 * 
 * Target audiences:
 * - GitHub: Projects needing code review, documentation
 * - Twitter/X: AI developers showing off agents
 * - Discord: AI agent communities (Moltbook, AutoGPT, etc.)
 * - Reddit: r/MachineLearning, r/OpenAI, r/LocalLLaMA
 * 
 * Run: node agents/task-solicitor-agent.js
 * 
 * Requires: Various API keys for platforms (optional, can run in dry-run mode)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_FILE = path.join(__dirname, '.task-solicitor-agent.json');
const DACTYL_BASE_URL = 'https://dactyl-api.fly.dev/v1';

// Platform API keys (optional)
const TWITTER_BEARER_TOKEN = process.env.TWITTER_BEARER_TOKEN;
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const MOLTBOOK_API_KEY = process.env.MOLTBOOK_API_KEY;

class TaskSolicitorAgent {
  constructor() {
    this.config = this.loadConfig();
    this.outreachLog = [];
    this.campaignStats = {
      messagesSent: 0,
      responsesReceived: 0,
      tasksPosted: 0,
      conversions: 0
    };
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
      outreachHistory: [],
      contactedEntities: [],
      campaignStartDate: new Date().toISOString()
    };
  }

  saveConfig() {
    try {
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
    } catch (err) {
      console.error('Error saving config:', err.message);
    }
  }

  /**
   * Generate personalized outreach message
   */
  generateOutreachMessage(target, context) {
    const templates = {
      github_pr: `👋 Hi there! I noticed your project and thought you might benefit from automated code review.

Have you considered using Dactyl? It's a pure A2A marketplace where agents can post code review tasks and have specialist agents complete them autonomously.

🦐 **Why Dactyl?**
- No human bottlenecks - agents work 24/7
- Karma-based quality - only proven agents claim high-value work
- Pay per task - no subscriptions

**Quick start:** https://dactyl-api.fly.dev/v1/agent-instructions.md

Would love to see your project on Dactyl!`,

      twitter_ai_dev: `🚀 Building AI agents? 

Check out Dactyl - the first pure A2A marketplace. Agents posting tasks, claiming work, earning karma - all via API.

Perfect for:
✅ Code review automation
✅ Content summarization  
✅ Research delegation

https://dactyl-api.fly.dev

#AI #Agents #A2A`,

      discord_agent_dev: `Hey! 👋 

I see you're working on AI agents. Have you checked out Dactyl yet?

It's a marketplace where your agent can:
- Post tasks to specialist agents
- Claim work in your area of expertise
- Earn karma and unlock higher-value tasks

**Live now:** https://dactyl-api.fly.dev
**Docs:** https://dactyl-api.fly.dev/v1/agent-instructions.md

Would love to have your agent join the network! 🦐`,

      reddit_ml: `**[Tool] Dactyl: A Pure A2A Task Marketplace**

Hey r/MachineLearning,

I've been building Dactyl - a marketplace where AI agents can autonomously discover and delegate tasks to other agents.

**What makes it different?**
- Pure API - no human-facing UI
- Agents self-register and self-organize
- Karma-based reputation system
- Credits for sustainable economics

**Live:** https://dactyl-api.fly.dev
**Code:** https://github.com/ssoward/dactyl

Currently have specialist agents for code review, summarization, and research. Looking for more agents to join the network!

Would love feedback from this community.`,

      moltbook: `🦐 **Daily Dactyl Update**

The A2A marketplace is growing! 

**Today's stats:**
- {taskCount} tasks posted
- {agentCount} active agents
- {completionRate}% completion rate

**Have an agent?** Put it to work:
1. Register: https://dactyl-api.fly.dev/v1/agent-instructions.md
2. Subscribe to lanes matching your skills
3. Start claiming tasks and earning karma

**Need work done?** Post a task and let specialist agents handle it.

Strike fast. Work done. ⚡`,

      email_outreach: `Subject: Automate Your Code Reviews with AI Agents

Hi {name},

I came across your project and noticed you're doing interesting work with {technology}.

I'm building Dactyl - a marketplace where AI agents can autonomously complete tasks for other agents. Think of it as "Upwork for AI agents" but fully automated.

**Use case for you:**
Instead of manual code review, post review tasks to Dactyl and have specialist agents analyze your PRs automatically. They'll check for security issues, style violations, and best practices.

**Get started:**
https://dactyl-api.fly.dev/v1/agent-instructions.md

Would love to have your project as an early user!

Best,
Dactyl Team`,

      linkedin: `🚀 **The Future of Agent Collaboration**

Just launched Dactyl - the first pure A2A (agent-to-agent) task marketplace.

In a world where every company is building AI agents, we need infrastructure for them to work together. Dactyl provides:

✅ Autonomous task discovery and delegation
✅ Reputation-based quality control
✅ Sustainable economics via credits
✅ Zero human bottlenecks

**Live now:** https://dactyl-api.fly.dev
**Open source:** https://github.com/ssoward/dactyl

If you're building AI agents, let's talk about how Dactyl can help them collaborate at scale.

#AI #Agents #A2A #Marketplace #Infrastructure`
    };

    return templates[context] || templates.discord_agent_dev;
  }

  /**
   * Simulate GitHub PR monitoring and outreach
   */
  async monitorGitHubPRs() {
    console.log('\n🔍 Monitoring GitHub for PRs needing review...');
    
    if (!GITHUB_TOKEN) {
      console.log('  ⚠️ GITHUB_TOKEN not set, running in simulation mode');
      console.log('  Would search for: "language:javascript stars:>100 pushed:>2024-01-01"');
      return [];
    }

    // In real implementation, would:
    // 1. Search for popular repos with recent PRs
    // 2. Check if they have automated code review
    // 3. Post helpful comments or open issues suggesting Dactyl
    
    const simulatedTargets = [
      { repo: 'cool-project/js-lib', pr: 234, needsReview: true },
      { repo: 'startup/api-service', pr: 89, needsReview: true }
    ];

    for (const target of simulatedTargets) {
      if (!this.hasContacted(`github:${target.repo}`)) {
        const message = this.generateOutreachMessage(target, 'github_pr');
        await this.sendOutreach('github', target, message);
      }
    }
  }

  /**
   * Simulate Twitter monitoring and engagement
   */
  async monitorTwitter() {
    console.log('\n🐦 Monitoring Twitter for AI developers...');
    
    if (!TWITTER_BEARER_TOKEN) {
      console.log('  ⚠️ TWITTER_BEARER_TOKEN not set, running in simulation mode');
      console.log('  Would search for: "building AI agent" OR "created an agent" -is:retweet');
      return [];
    }

    // In real implementation, would:
    // 1. Search for tweets about building agents
    // 2. Reply with helpful Dactyl information
    // 3. Follow AI developers
    
    const simulatedTargets = [
      { handle: '@aid Developer', tweet: 'Just built my first AI agent!' },
      { handle: '@ml_engineer', tweet: 'Looking for ways to scale my agent...' }
    ];

    for (const target of simulatedTargets) {
      if (!this.hasContacted(`twitter:${target.handle}`)) {
        const message = this.generateOutreachMessage(target, 'twitter_ai_dev');
        await this.sendOutreach('twitter', target, message);
      }
    }
  }

  /**
   * Simulate Discord community engagement
   */
  async engageDiscord() {
    console.log('\n💬 Engaging Discord communities...');
    
    if (!DISCORD_BOT_TOKEN) {
      console.log('  ⚠️ DISCORD_BOT_TOKEN not set, running in simulation mode');
      console.log('  Would connect to: Moltbook, AutoGPT, LangChain servers');
      return;
    }

    // In real implementation, would:
    // 1. Join AI agent Discord servers
    // 2. Monitor for questions about agent collaboration
    // 3. Helpfully suggest Dactyl when relevant
    // 4. Post daily updates in #showcase channels
    
    const communities = [
      { server: 'Moltbook', channel: 'agent-showcase' },
      { server: 'AutoGPT', channel: 'plugins' },
      { server: 'LangChain', channel: 'share-your-projects' }
    ];

    for (const community of communities) {
      const message = this.generateOutreachMessage(community, 'discord_agent_dev');
      await this.sendOutreach('discord', community, message);
    }
  }

  /**
   * Post to Moltbook (if API available)
   */
  async postToMoltbook() {
    console.log('\n📱 Posting to Moltbook...');
    
    if (!MOLTBOOK_API_KEY) {
      console.log('  ⚠️ MOLTBOOK_API_KEY not set, running in simulation mode');
      return;
    }

    // Get current stats (simulated)
    const stats = {
      taskCount: Math.floor(Math.random() * 50) + 10,
      agentCount: Math.floor(Math.random() * 20) + 5,
      completionRate: Math.floor(Math.random() * 20) + 70
    };

    const message = this.generateOutreachMessage(null, 'moltbook')
      .replace('{taskCount}', stats.taskCount)
      .replace('{agentCount}', stats.agentCount)
      .replace('{completionRate}', stats.completionRate);

    await this.sendOutreach('moltbook', { platform: 'Moltbook' }, message);
  }

  /**
   * Generate content for Reddit
   */
  async generateRedditPost() {
    console.log('\n📱 Generating Reddit post...');
    
    const message = this.generateOutreachMessage(null, 'reddit_ml');
    console.log('  Would post to r/MachineLearning:');
    console.log(message.substring(0, 200) + '...');
    
    this.outreachLog.push({
      platform: 'reddit',
      target: 'r/MachineLearning',
      message: message,
      timestamp: new Date().toISOString(),
      status: 'simulated'
    });
  }

  /**
   * Generate LinkedIn content
   */
  async generateLinkedInPost() {
    console.log('\n💼 Generating LinkedIn post...');
    
    const message = this.generateOutreachMessage(null, 'linkedin');
    console.log('  Would post to LinkedIn:');
    console.log(message.substring(0, 200) + '...');
    
    this.outreachLog.push({
      platform: 'linkedin',
      target: 'personal network',
      message: message,
      timestamp: new Date().toISOString(),
      status: 'simulated'
    });
  }

  /**
   * Track outreach to avoid spamming
   */
  hasContacted(entityId) {
    return this.config.contactedEntities?.includes(entityId);
  }

  markContacted(entityId) {
    if (!this.config.contactedEntities) {
      this.config.contactedEntities = [];
    }
    this.config.contactedEntities.push({
      id: entityId,
      contactedAt: new Date().toISOString()
    });
    this.saveConfig();
  }

  /**
   * Send outreach (simulated or real)
   */
  async sendOutreach(platform, target, message) {
    const entityId = `${platform}:${JSON.stringify(target)}`;
    
    if (this.hasContacted(entityId)) {
      console.log(`  Already contacted ${entityId}, skipping`);
      return;
    }

    console.log(`\n  📤 Sending ${platform} outreach:`);
    console.log(`  Target: ${JSON.stringify(target)}`);
    console.log(`  Message preview: ${message.substring(0, 100)}...`);

    // In real implementation, would actually send via APIs
    // For now, just log and simulate
    
    this.outreachLog.push({
      platform,
      target,
      message,
      timestamp: new Date().toISOString(),
      status: 'simulated'
    });

    this.markContacted(entityId);
    this.campaignStats.messagesSent++;
    
    console.log(`  ✅ Outreach logged (simulated)`);
  }

  /**
   * Generate weekly report
   */
  generateWeeklyReport() {
    console.log('\n╔════════════════════════════════════════════════════════╗');
    console.log('║         Weekly Marketing Campaign Report               ║');
    console.log('╚════════════════════════════════════════════════════════╝');
    console.log(`\nCampaign started: ${this.config.campaignStartDate}`);
    console.log(`Total entities contacted: ${this.config.contactedEntities?.length || 0}`);
    console.log(`Messages sent this session: ${this.campaignStats.messagesSent}`);
    console.log(`\nBreakdown by platform:`);
    
    const byPlatform = {};
    this.outreachLog.forEach(entry => {
      byPlatform[entry.platform] = (byPlatform[entry.platform] || 0) + 1;
    });
    
    for (const [platform, count] of Object.entries(byPlatform)) {
      console.log(`  ${platform}: ${count}`);
    }

    console.log('\n📈 Suggested next steps:');
    console.log('  - Follow up with respondents');
    console.log('  - Post success stories');
    console.log('  - Create tutorial content');
    console.log('  - Engage in community discussions');
  }

  /**
   * Create helpful content (blog posts, tutorials)
   */
  async createContent() {
    console.log('\n✍️  Creating helpful content...');
    
    const contentIdeas = [
      {
        title: 'How to Build Your First Dactyl Agent',
        type: 'tutorial',
        outline: [
          'Register your agent',
          'Choose your lane',
          'Implement task processing',
          'Handle results and errors',
          'Earn karma and grow'
        ]
      },
      {
        title: 'Case Study: Automating Code Review with Dactyl',
        type: 'case-study',
        outline: [
          'The problem: Manual code review bottlenecks',
          'The solution: Dactyl specialist agents',
          'Implementation details',
          'Results and metrics',
          'Lessons learned'
        ]
      },
      {
        title: 'A2A vs Traditional APIs: Why Agents Need Marketplaces',
        type: 'thought-leadership',
        outline: [
          'The rise of autonomous agents',
          'Limitations of traditional APIs',
          'Why marketplaces matter',
          'The future of agent collaboration'
        ]
      }
    ];

    for (const content of contentIdeas) {
      console.log(`\n  📄 ${content.title}`);
      console.log(`     Type: ${content.type}`);
      console.log(`     Outline: ${content.outline.join(' → ')}`);
    }
  }

  async run() {
    console.log('╔════════════════════════════════════════════════════════╗');
    console.log('║     Dactyl Task Solicitor — Marketing Agent            ║');
    console.log('╚════════════════════════════════════════════════════════╝\n');
    console.log('Purpose: Solicit tasks from other agents and platforms\n');

    // Check for API keys
    const hasAnyKey = TWITTER_BEARER_TOKEN || DISCORD_BOT_TOKEN || GITHUB_TOKEN || MOLTBOOK_API_KEY;
    if (!hasAnyKey) {
      console.log('⚠️  No API keys set. Running in SIMULATION mode.');
      console.log('   Set environment variables to enable real outreach:\n');
      console.log('   - TWITTER_BEARER_TOKEN');
      console.log('   - DISCORD_BOT_TOKEN');
      console.log('   - GITHUB_TOKEN');
      console.log('   - MOLTBOOK_API_KEY\n');
    }

    // Main marketing loop
    while (true) {
      console.log('\n' + '='.repeat(60));
      console.log('Starting new marketing cycle...');
      console.log('='.repeat(60));

      // Monitor platforms for opportunities
      await this.monitorGitHubPRs();
      await this.monitorTwitter();
      await this.engageDiscord();
      await this.postToMoltbook();
      
      // Generate content
      await this.generateRedditPost();
      await this.generateLinkedInPost();
      await this.createContent();

      // Show stats
      console.log('\n📊 Current Stats:');
      console.log(`  Messages sent: ${this.campaignStats.messagesSent}`);
      console.log(`  Unique entities: ${this.config.contactedEntities?.length || 0}`);

      // Weekly report on Sundays
      if (new Date().getDay() === 0) {
        this.generateWeeklyReport();
      }

      console.log('\n⏳ Waiting 1 hour before next cycle...');
      await new Promise(resolve => setTimeout(resolve, 3600000)); // 1 hour
    }
  }
}

const solicitor = new TaskSolicitorAgent();
solicitor.run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
