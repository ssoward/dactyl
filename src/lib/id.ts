import { customAlphabet } from 'nanoid';

// URL-safe alphabet, 12 chars → ~71 bits of entropy per ID
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const nano = customAlphabet(alphabet, 12);

export function newAgentId(): string {
  return `agt_${nano()}`;
}

export function newTaskId(): string {
  return `tsk_${nano()}`;
}

export function newTxId(): string {
  return `ctx_${nano()}`;
}

export function newWebhookId(): string {
  return `whk_${nano()}`;
}

export function newKarmaId(): string {
  return `krm_${nano()}`;
}
