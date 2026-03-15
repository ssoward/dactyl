import { redis } from './client.js';
const CLAIM_KEY_PREFIX = 'dactyl:claim:';
function claimKey(taskId) {
    return `${CLAIM_KEY_PREFIX}${taskId}`;
}
/**
 * Atomically acquire a claim lock for a task.
 * Uses Redis SET NX EX — returns true only if the key was newly set.
 * If another agent already holds the claim, returns false.
 */
export async function acquireClaim(taskId, agentId, ttlSeconds) {
    // Use the EX+NX overload: SET key value EX seconds NX
    const result = await redis.set(claimKey(taskId), agentId, 'EX', ttlSeconds, 'NX');
    return result === 'OK';
}
/**
 * Release the claim lock for a task.
 * Called on task completion, abandonment, or expiry cleanup.
 */
export async function releaseClaim(taskId) {
    await redis.del(claimKey(taskId));
}
/**
 * Get the agent ID currently holding the claim lock, or null if unclaimed.
 */
export async function getClaimHolder(taskId) {
    return redis.get(claimKey(taskId));
}
//# sourceMappingURL=claim-lock.js.map