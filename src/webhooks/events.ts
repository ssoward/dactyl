import { WebhookEventType } from '../types.js';
import type { Task } from '../types.js';

export type WebhookEvent = {
  event: WebhookEventType;
  agent_id: string;
  task_id?: string;
  timestamp: string;
  payload: Record<string, unknown>;
};

export function buildTaskEvent(
  type: WebhookEventType,
  agentId: string,
  task: Partial<Task>,
): WebhookEvent {
  return {
    event: type,
    agent_id: agentId,
    task_id: task.id,
    timestamp: new Date().toISOString(),
    payload: {
      id: task.id,
      lane_slug: task.lane_slug,
      status: task.status,
      title: task.title,
      posted_by_agent_id: task.posted_by_agent_id,
      claimed_by_agent_id: task.claimed_by_agent_id ?? null,
      completed_at: task.completed_at?.toISOString() ?? null,
      vote: task.vote ?? null,
      karma_awarded: task.karma_awarded ?? null,
    },
  };
}

export { WebhookEventType };
