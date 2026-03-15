import { Queue } from 'bullmq';
import { bullmqConnection } from '../redis/client.js';

// Queue names as constants to avoid typos
export const QUEUE_CLAIM_EXPIRY = 'dactyl-claim-expiry';
export const QUEUE_PROGRESS_EXPIRY = 'dactyl-progress-expiry';
export const QUEUE_KARMA_AUTO_AWARD = 'dactyl-karma-auto-award';
export const QUEUE_TASK_EXPIRY = 'dactyl-task-expiry';

function makeQueue(name: string): Queue {
  return new Queue(name, { connection: bullmqConnection() });
}

const claimExpiryQueue = makeQueue(QUEUE_CLAIM_EXPIRY);
const progressExpiryQueue = makeQueue(QUEUE_PROGRESS_EXPIRY);
const karmaAutoAwardQueue = makeQueue(QUEUE_KARMA_AUTO_AWARD);
const taskExpiryQueue = makeQueue(QUEUE_TASK_EXPIRY);

/** Schedule a claim-expiry job delayed until expiresAt. Returns the BullMQ job ID. */
export async function scheduleClaimExpiry(
  taskId: string,
  expiresAt: Date,
): Promise<string> {
  const delay = Math.max(0, expiresAt.getTime() - Date.now());
  const job = await claimExpiryQueue.add(
    'claim-expiry',
    { taskId },
    { delay, jobId: `claim-${taskId}` },
  );
  return job.id ?? `claim-${taskId}`;
}

/** Schedule a progress-expiry (in_progress timeout) job. Returns the BullMQ job ID. */
export async function scheduleProgressExpiry(
  taskId: string,
  agentId: string,
  deadline: Date,
): Promise<string> {
  const delay = Math.max(0, deadline.getTime() - Date.now());
  const job = await progressExpiryQueue.add(
    'progress-expiry',
    { taskId, agentId },
    { delay, jobId: `progress-${taskId}` },
  );
  return job.id ?? `progress-${taskId}`;
}

/** Schedule the 7-day auto-award karma job. Returns the BullMQ job ID. */
export async function scheduleKarmaAutoAward(
  taskId: string,
  claimedByAgentId: string,
): Promise<string> {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const job = await karmaAutoAwardQueue.add(
    'karma-auto-award',
    { taskId, agentId: claimedByAgentId },
    { delay: SEVEN_DAYS_MS, jobId: `karma-award-${taskId}` },
  );
  return job.id ?? `karma-award-${taskId}`;
}

/** Schedule a task expiry job. Returns the BullMQ job ID. */
export async function scheduleTaskExpiry(
  taskId: string,
  expiresAt: Date,
): Promise<string> {
  const delay = Math.max(0, expiresAt.getTime() - Date.now());
  const job = await taskExpiryQueue.add(
    'task-expiry',
    { taskId },
    { delay, jobId: `task-expiry-${taskId}` },
  );
  return job.id ?? `task-expiry-${taskId}`;
}

/** Cancel a scheduled BullMQ job by queue name + job ID. */
export async function cancelJob(
  queueName: string,
  jobId: string,
): Promise<void> {
  const queue = new Queue(queueName, { connection: bullmqConnection() });
  const job = await queue.getJob(jobId);
  if (job) {
    await job.remove();
  }
  await queue.close();
}
