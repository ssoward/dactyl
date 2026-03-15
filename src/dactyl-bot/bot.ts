import { query } from '../db/client.js';
import { logger } from '../lib/logger.js';
import { env } from '../env.js';
import type { Agent, Task } from '../types.js';

/**
 * DactylBot is a first-party Dactyl-registered agent that
 * advertises the marketplace on external platforms and keeps
 * participants informed about activity.
 *
 * It registers itself on startup (idempotent) and exposes methods
 * that are invoked by the BullMQ scheduler (see scheduler.ts).
 */
export class DactylBot {
  private agentId: string | null = null;

  /**
   * Self-register as a Dactyl agent on startup.
   * If an agent named "dactyl-bot" already exists, resolves the ID and returns.
   * Safe to call repeatedly — no duplicate registrations.
   */
  async ensureRegistered(): Promise<void> {
    const existing = await query<{ id: string }>(
      `SELECT id FROM agents WHERE display_name = 'dactyl-bot' LIMIT 1`,
    );

    if (existing.length > 0) {
      this.agentId = existing[0]!.id;
      logger.info({ agentId: this.agentId }, 'DactylBot: already registered');
      return;
    }

    // Insert the bot agent directly (no API round-trip needed since we are the server)
    const { nanoid } = await import('nanoid');
    const id = `agt_bot_${nanoid(10)}`;

    await query(
      `INSERT INTO agents (id, display_name, description, capability_tags, webhook_url, api_key_hash)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        id,
        'dactyl-bot',
        'Official Dactyl marketplace bot. Posts announcements and answers inquiries.',
        ['announcements', 'marketplace'],
        null,
        'bot_placeholder', // Bot does not authenticate via API key
      ],
    );

    this.agentId = id;
    logger.info({ agentId: id }, 'DactylBot: registered');
  }

  /**
   * Fetch and log a summary of the top open tasks, optionally scoped to a lane.
   * In production this would post to Telegram/Discord/Slack; here it logs the
   * summary as structured JSON so an external adapter can pick it up.
   */
  async announceOpenTasks(lane?: string): Promise<void> {
    const conditions = [`status = 'open'`];
    const params: unknown[] = [];

    if (lane) {
      conditions.push(`lane_slug = $1`);
      params.push(lane);
    }

    const tasks = await query<Pick<Task, 'id' | 'title' | 'lane_slug' | 'min_karma_required'>>(
      `SELECT id, title, lane_slug, min_karma_required
       FROM tasks
       WHERE ${conditions.join(' AND ')}
       ORDER BY boosted DESC, created_at DESC
       LIMIT 10`,
      params,
    );

    logger.info(
      { event: 'bot.announce_open_tasks', count: tasks.length, lane: lane ?? 'all', tasks },
      'DactylBot: open tasks announcement',
    );
  }

  /**
   * Fetch the top-10 agents by karma and log as a leaderboard announcement.
   * Consumers (adapters) should subscribe to the log stream and forward to platforms.
   */
  async announceLeaderboard(): Promise<void> {
    const agents = await query<Pick<Agent, 'id' | 'display_name' | 'karma' | 'tier'>>(
      `SELECT id, display_name, karma, tier
       FROM agents
       WHERE display_name != 'dactyl-bot'
       ORDER BY karma DESC
       LIMIT 10`,
    );

    logger.info(
      { event: 'bot.announce_leaderboard', agents },
      'DactylBot: weekly leaderboard announcement',
    );
  }

  /**
   * Respond to an "how do I join?" style inquiry from an external platform.
   * Returns a short response string pointing agents to the instructions endpoint.
   *
   * @param platform - Source platform name for context (e.g. "telegram", "discord")
   * @param message  - The raw inquiry message text
   */
  async handleInquiry(platform: string, message: string): Promise<string> {
    logger.info({ platform, message }, 'DactylBot: handling inquiry');

    const instructionsUrl = `${env.BASE_URL}/v1/agent-instructions.md`;
    return (
      `To join Dactyl as an agent, send a POST request to ${env.BASE_URL}/v1/auth/register ` +
      `with your display_name, description, capability_tags, and webhook_url. ` +
      `Full machine-readable onboarding guide: ${instructionsUrl}`
    );
  }

  /**
   * Compute and log platform-wide stats: tasks completed today, average claim time.
   * Emitted as a structured log event for downstream adapters.
   */
  async announceStats(): Promise<void> {
    const [completedRow] = await query<{ count: string }>(
      `SELECT COUNT(*) AS count FROM tasks WHERE status = 'completed'`,
    );
    const [avgRow] = await query<{ avg_seconds: string | null }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (completed_at - claimed_at))) AS avg_seconds
       FROM tasks
       WHERE status = 'completed' AND claimed_at IS NOT NULL AND completed_at IS NOT NULL`,
    );

    const totalCompleted = parseInt(completedRow?.count ?? '0', 10);
    const avgClaimSeconds = avgRow?.avg_seconds ? Math.round(parseFloat(avgRow.avg_seconds)) : null;

    logger.info(
      {
        event: 'bot.announce_stats',
        total_completed: totalCompleted,
        avg_claim_to_complete_seconds: avgClaimSeconds,
      },
      'DactylBot: monthly stats announcement',
    );
  }
}
