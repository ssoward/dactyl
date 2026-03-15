import { TaskStatus } from '../types.js';
import { env } from '../env.js';

// Valid state transitions as an adjacency list
const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  [TaskStatus.OPEN]: [TaskStatus.CLAIMED, TaskStatus.EXPIRED],
  [TaskStatus.CLAIMED]: [TaskStatus.IN_PROGRESS, TaskStatus.OPEN], // open = timeout release
  [TaskStatus.IN_PROGRESS]: [
    TaskStatus.COMPLETED,
    TaskStatus.FAILED,
    TaskStatus.OPEN, // abandon
  ],
  [TaskStatus.COMPLETED]: [],
  [TaskStatus.FAILED]: [],
  [TaskStatus.EXPIRED]: [],
};

export function validTransition(from: TaskStatus, to: TaskStatus): boolean {
  return TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Claim Check ─────────────────────────────────────────────────────────────

export interface ClaimCheck {
  ok: boolean;
  code?: string;
  detail?: Record<string, unknown>;
}

export function canClaim(
  agentKarma: number,
  taskMinKarma: number,
): ClaimCheck {
  if (agentKarma < taskMinKarma) {
    return {
      ok: false,
      code: 'insufficient_karma',
      detail: { required: taskMinKarma, current: agentKarma },
    };
  }
  return { ok: true };
}

// ─── Deadline Helpers ─────────────────────────────────────────────────────────

export function resolveClaimDeadlines(
  now: Date,
  claimTtlSeconds: number = env.CLAIM_TTL_SECONDS,
  progressTtlSeconds: number = env.PROGRESS_TTL_SECONDS,
): {
  claimExpiresAt: Date;
  progressDeadlineAt: Date;
} {
  const claimExpiresAt = new Date(now.getTime() + claimTtlSeconds * 1000);
  // Progress deadline starts from when the claim expires (agent acknowledges)
  const progressDeadlineAt = new Date(
    claimExpiresAt.getTime() + progressTtlSeconds * 1000,
  );
  return { claimExpiresAt, progressDeadlineAt };
}
