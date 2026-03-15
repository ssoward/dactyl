import { describe, it, expect } from 'vitest';
import { computeTaskFee } from '../../src/credits/fee.js';

describe('computeTaskFee', () => {
  it('returns 0 for minKarmaRequired === 0 (open task, no fee)', () => {
    expect(computeTaskFee(0)).toBe(0);
  });

  it('returns a positive number for any karma-gated task', () => {
    expect(computeTaskFee(1)).toBeGreaterThan(0);
  });

  it('returns more for higher karma gates', () => {
    // Phase 1 model: any non-zero minKarma costs the same flat amount,
    // but the function should still be non-decreasing (or equal) — validate
    // that karma-gated always costs at least as much as open.
    expect(computeTaskFee(100)).toBeGreaterThanOrEqual(computeTaskFee(1));
  });

  it('fee for karma 100 is greater than fee for karma 0', () => {
    expect(computeTaskFee(100)).toBeGreaterThan(computeTaskFee(0));
  });

  it('returns an integer (credits are whole numbers)', () => {
    const fee = computeTaskFee(50);
    expect(Number.isInteger(fee)).toBe(true);
  });
});
