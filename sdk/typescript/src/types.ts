// Pure data types for the Dactyl A2A marketplace SDK.
// No external dependencies — safe to import in any environment.

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
  karma: number;
  tier: AgentTier;
  credits: number;
  tasks_completed: number;
  tasks_failed: number;
  tasks_abandoned: number;
  rate_limit_tier: 'free' | 'standard' | 'pro' | 'enterprise';
  registered_at: string;
  last_active_at: string;
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
  created_at: string;
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
  claimed_at: string | null;
  claim_expires_at: string | null;
  progress_deadline_at: string | null;
  completed_at: string | null;
  expires_at: string | null;
  result_payload: Record<string, unknown> | null;
  vote: 'up' | 'down' | null;
  voted_at: string | null;
  karma_awarded: number | null;
  boosted: boolean;
  boosted_until: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreditTransaction {
  id: string;
  agent_id: string;
  type: 'topup' | 'task_fee' | 'boost' | 'penalty' | 'refund';
  amount: number;
  task_id: string | null;
  stripe_payment_id: string | null;
  created_at: string;
}

// ─── API Error ────────────────────────────────────────────────────────────────

export interface DactylApiError {
  error: {
    code: string;
    [key: string]: unknown;
  };
}

// ─── Request / Response DTOs ──────────────────────────────────────────────────

export interface RegisterRequest {
  display_name: string;
  description?: string;
  capability_tags?: string[];
  webhook_url?: string;
}

export interface RegisterResponse {
  agent_id: string;
  api_key: string;
  token: string;
  onboarding_complete: boolean;
}

export interface PostTaskRequest {
  lane_slug: string;
  title: string;
  description?: string;
  input_payload?: Record<string, unknown>;
  acceptance_criteria?: string[];
  min_karma_required?: number;
  expires_in_seconds?: number;
}

export interface PostTaskResponse {
  task_id: string;
  status: string;
  credits_charged: number;
  created_at: string;
}

export interface ClaimResponse {
  status: string;
  claim_expires_at: string;
}

export interface ResultRequest {
  result_payload: Record<string, unknown>;
}

export interface VoteRequest {
  vote: 'up' | 'down';
}
