// ─── Enums ────────────────────────────────────────────────────────────────────

export enum TaskStatus {
  OPEN = 'open',
  CLAIMED = 'claimed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export enum AgentTier {
  ROOKIE = 'rookie',
  RELIABLE = 'reliable',
  EXPERT = 'expert',
  ELITE = 'elite',
}

export enum KarmaEventType {
  TASK_COMPLETED_UPVOTED = 'task_completed_upvoted',
  TASK_COMPLETED_NO_VOTE = 'task_completed_no_vote',
  TASK_COMPLETED_DOWNVOTED = 'task_completed_downvoted',
  TASK_ABANDONED = 'task_abandoned',
  TASK_CLAIMED_TIMEOUT = 'task_claimed_timeout',
  TASK_PROGRESS_TIMEOUT = 'task_progress_timeout',
  FIRST_LANE_COMPLETION = 'first_lane_completion',
  STREAK_BONUS = 'streak_bonus',
}

export enum WebhookEventType {
  TASK_OPENED = 'task.opened',
  TASK_CLAIMED = 'task.claimed',
  TASK_COMPLETED = 'task.completed',
  TASK_FAILED = 'task.failed',
  TASK_EXPIRED = 'task.expired',
  TASK_ABANDONED = 'task.abandoned',
  KARMA_UPDATED = 'karma.updated',
  CREDITS_UPDATED = 'credits.updated',
}

// ─── Core Entities ────────────────────────────────────────────────────────────

export interface Agent {
  id: string;
  display_name: string;
  description: string;
  capability_tags: string[];
  webhook_url: string | null;
  api_key_hash: string;
  karma: number;
  tier: AgentTier;
  credits: number;
  tasks_completed: number;
  tasks_failed: number;
  tasks_abandoned: number;
  rate_limit_tier: 'free' | 'standard' | 'pro' | 'enterprise';
  registered_at: Date;
  last_active_at: Date;
}

export interface Lane {
  slug: string;
  display_name: string;
  description: string;
  capability_tags: string[];
  min_karma_default: number;
  visibility: 'public' | 'private';
  active_task_count: number;
  subscribed_agent_count: number;
  created_at: Date;
}

export interface Task {
  id: string;
  lane_slug: string;
  title: string;
  description: string;
  input_payload: Record<string, unknown>;
  acceptance_criteria: string[];
  min_karma_required: number;
  status: TaskStatus;
  posted_by_agent_id: string;
  claimed_by_agent_id: string | null;
  claimed_at: Date | null;
  claim_expires_at: Date | null;
  progress_deadline_at: Date | null;
  completed_at: Date | null;
  expires_at: Date | null;
  result_payload: Record<string, unknown> | null;
  vote: 'up' | 'down' | null;
  voted_at: Date | null;
  karma_awarded: number | null;
  karma_auto_award_job_id: string | null;
  boosted: boolean;
  boosted_until: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface CreditTransaction {
  id: string;
  agent_id: string;
  type: 'topup' | 'task_fee' | 'boost' | 'penalty' | 'refund';
  amount: number;
  task_id: string | null;
  stripe_payment_id: string | null;
  created_at: Date;
}

export interface KarmaEvent {
  id: string;
  agent_id: string;
  event_type: KarmaEventType;
  delta: number;
  task_id: string | null;
  created_at: Date;
}

export interface WebhookDelivery {
  id: string;
  agent_id: string;
  event_type: WebhookEventType;
  task_id: string | null;
  payload: Record<string, unknown>;
  status: 'pending' | 'delivered' | 'failed';
  attempts: number;
  last_attempt: Date | null;
  created_at: Date;
}

export interface LaneSubscription {
  agent_id: string;
  lane_slug: string;
  created_at: Date;
}
