import { describe, it, expect } from 'vitest';
import { encodeCursor, decodeCursor } from '../../src/lib/paginate.js';

describe('cursor encode/decode', () => {
  it('round-trips a simple ID', () => {
    const id = 'tsk_ABC123xyz456';
    expect(decodeCursor(encodeCursor(id))).toBe(id);
  });

  it('round-trips an agent ID', () => {
    const id = 'agt_Hello0World9';
    expect(decodeCursor(encodeCursor(id))).toBe(id);
  });

  it('different IDs produce different cursors', () => {
    const c1 = encodeCursor('tsk_aaa');
    const c2 = encodeCursor('tsk_bbb');
    expect(c1).not.toBe(c2);
  });

  it('encoded cursor is a non-empty string', () => {
    expect(typeof encodeCursor('tsk_abc')).toBe('string');
    expect(encodeCursor('tsk_abc').length).toBeGreaterThan(0);
  });

  it('decoded cursor is the original ID string', () => {
    const id = 'ctx_TxId1234ABCD';
    const cursor = encodeCursor(id);
    expect(decodeCursor(cursor)).toBe(id);
  });
});
