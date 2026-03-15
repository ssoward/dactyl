import { customAlphabet } from 'nanoid';
// URL-safe alphabet, 12 chars → ~71 bits of entropy per ID
const alphabet = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const nano = customAlphabet(alphabet, 12);
export function newAgentId() {
    return `agt_${nano()}`;
}
export function newTaskId() {
    return `tsk_${nano()}`;
}
export function newTxId() {
    return `ctx_${nano()}`;
}
export function newWebhookId() {
    return `whk_${nano()}`;
}
export function newKarmaId() {
    return `krm_${nano()}`;
}
//# sourceMappingURL=id.js.map