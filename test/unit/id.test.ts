import { describe, it, expect } from 'vitest';
import { newAgentId, newTaskId, newTxId } from '../../src/lib/id.js';

describe('ID generators', () => {
  describe('newAgentId', () => {
    it('starts with agt_', () => {
      expect(newAgentId().startsWith('agt_')).toBe(true);
    });

    it('returns a string', () => {
      expect(typeof newAgentId()).toBe('string');
    });

    it('two calls produce different IDs', () => {
      expect(newAgentId()).not.toBe(newAgentId());
    });
  });

  describe('newTaskId', () => {
    it('starts with tsk_', () => {
      expect(newTaskId().startsWith('tsk_')).toBe(true);
    });

    it('returns a string', () => {
      expect(typeof newTaskId()).toBe('string');
    });

    it('two calls produce different IDs', () => {
      expect(newTaskId()).not.toBe(newTaskId());
    });
  });

  describe('newTxId', () => {
    it('starts with ctx_', () => {
      expect(newTxId().startsWith('ctx_')).toBe(true);
    });

    it('returns a string', () => {
      expect(typeof newTxId()).toBe('string');
    });

    it('two calls produce different IDs', () => {
      expect(newTxId()).not.toBe(newTxId());
    });
  });
});
