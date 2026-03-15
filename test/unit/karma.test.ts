import { describe, it, expect } from 'vitest';
import { computeTier } from '../../src/karma/engine.js';
import { KarmaEventType, KARMA_DELTAS } from '../../src/karma/events.js';

describe('computeTier', () => {
  it('returns rookie for karma 0', () => {
    expect(computeTier(0)).toBe('rookie');
  });

  it('returns rookie for karma 49', () => {
    expect(computeTier(49)).toBe('rookie');
  });

  it('returns reliable for karma 50', () => {
    expect(computeTier(50)).toBe('reliable');
  });

  it('returns reliable for karma 199', () => {
    expect(computeTier(199)).toBe('reliable');
  });

  it('returns expert for karma 200', () => {
    expect(computeTier(200)).toBe('expert');
  });

  it('returns expert for karma 499', () => {
    expect(computeTier(499)).toBe('expert');
  });

  it('returns elite for karma 500', () => {
    expect(computeTier(500)).toBe('elite');
  });

  it('returns elite for karma above 500', () => {
    expect(computeTier(9999)).toBe('elite');
  });
});

describe('KARMA_DELTAS', () => {
  it('has a positive delta for TASK_COMPLETED_UPVOTED', () => {
    expect(KARMA_DELTAS[KarmaEventType.TASK_COMPLETED_UPVOTED]).toBe(10);
  });

  it('has a positive delta for TASK_COMPLETED_NO_VOTE', () => {
    expect(KARMA_DELTAS[KarmaEventType.TASK_COMPLETED_NO_VOTE]).toBe(3);
  });

  it('has a negative delta for TASK_COMPLETED_DOWNVOTED', () => {
    expect(KARMA_DELTAS[KarmaEventType.TASK_COMPLETED_DOWNVOTED]).toBe(-5);
  });

  it('has a negative delta for TASK_ABANDONED', () => {
    expect(KARMA_DELTAS[KarmaEventType.TASK_ABANDONED]).toBe(-5);
  });

  it('has a negative delta for TASK_CLAIMED_TIMEOUT', () => {
    expect(KARMA_DELTAS[KarmaEventType.TASK_CLAIMED_TIMEOUT]).toBe(-3);
  });

  it('has a negative delta for TASK_PROGRESS_TIMEOUT', () => {
    expect(KARMA_DELTAS[KarmaEventType.TASK_PROGRESS_TIMEOUT]).toBe(-10);
  });

  it('has a positive delta for FIRST_LANE_COMPLETION', () => {
    expect(KARMA_DELTAS[KarmaEventType.FIRST_LANE_COMPLETION]).toBe(2);
  });

  it('has a positive delta for STREAK_BONUS', () => {
    expect(KARMA_DELTAS[KarmaEventType.STREAK_BONUS]).toBe(5);
  });

  it('defines a delta for every KarmaEventType enum value', () => {
    for (const eventType of Object.values(KarmaEventType)) {
      expect(KARMA_DELTAS).toHaveProperty(eventType);
      expect(typeof KARMA_DELTAS[eventType as KarmaEventType]).toBe('number');
    }
  });
});
