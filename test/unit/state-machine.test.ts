import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskStatus } from '../../src/types.js';

// Mock env before importing state-machine so it doesn't try to read .env
vi.mock('../../src/env.js', () => ({
  env: {
    CLAIM_TTL_SECONDS: 600,
    PROGRESS_TTL_SECONDS: 86400,
  },
}));

import { validTransition, canClaim, resolveClaimDeadlines } from '../../src/tasks/state-machine.js';

describe('validTransition', () => {
  it('open → claimed is valid', () => {
    expect(validTransition(TaskStatus.OPEN, TaskStatus.CLAIMED)).toBe(true);
  });

  it('claimed → in_progress is valid', () => {
    expect(validTransition(TaskStatus.CLAIMED, TaskStatus.IN_PROGRESS)).toBe(true);
  });

  it('in_progress → completed is valid', () => {
    expect(validTransition(TaskStatus.IN_PROGRESS, TaskStatus.COMPLETED)).toBe(true);
  });

  it('in_progress → failed is valid', () => {
    expect(validTransition(TaskStatus.IN_PROGRESS, TaskStatus.FAILED)).toBe(true);
  });

  it('open → completed is invalid', () => {
    expect(validTransition(TaskStatus.OPEN, TaskStatus.COMPLETED)).toBe(false);
  });

  it('completed → open is invalid', () => {
    expect(validTransition(TaskStatus.COMPLETED, TaskStatus.OPEN)).toBe(false);
  });

  it('completed → claimed is invalid', () => {
    expect(validTransition(TaskStatus.COMPLETED, TaskStatus.CLAIMED)).toBe(false);
  });

  it('failed → completed is invalid', () => {
    expect(validTransition(TaskStatus.FAILED, TaskStatus.COMPLETED)).toBe(false);
  });
});

describe('canClaim', () => {
  it('allows claim when karma equals required (0, 0)', () => {
    const result = canClaim(0, 0);
    expect(result.ok).toBe(true);
  });

  it('rejects claim when karma is below required', () => {
    const result = canClaim(99, 100);
    expect(result.ok).toBe(false);
    expect(result.code).toBe('insufficient_karma');
    expect(result.detail).toMatchObject({ required: 100, current: 99 });
  });

  it('allows claim when karma exactly meets required threshold', () => {
    const result = canClaim(100, 100);
    expect(result.ok).toBe(true);
  });

  it('allows claim when karma far exceeds required', () => {
    const result = canClaim(500, 0);
    expect(result.ok).toBe(true);
  });
});

describe('resolveClaimDeadlines', () => {
  it('returns correct claimExpiresAt based on TTL', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const { claimExpiresAt } = resolveClaimDeadlines(now, 600, 86400);
    const expected = new Date(now.getTime() + 600 * 1000);
    expect(claimExpiresAt.toISOString()).toBe(expected.toISOString());
  });

  it('returns progressDeadlineAt after claimExpiresAt', () => {
    const now = new Date('2025-01-01T00:00:00.000Z');
    const { claimExpiresAt, progressDeadlineAt } = resolveClaimDeadlines(now, 600, 86400);
    const expectedProgress = new Date(claimExpiresAt.getTime() + 86400 * 1000);
    expect(progressDeadlineAt.toISOString()).toBe(expectedProgress.toISOString());
  });
});
