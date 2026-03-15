/** Base credit cost for any task posting (flat Phase 1 model). */
const BASE_TASK_CREDITS = 10;
/**
 * Compute the posting fee for a task.
 *
 * Phase 1 model:
 *   - Karma-gated tasks: 5% of base (= 1 credit flat for Phase 1)
 *   - Open tasks (minKarmaRequired === 0): free
 */
export function computeTaskFee(minKarmaRequired) {
    if (minKarmaRequired === 0)
        return 0;
    return Math.ceil(BASE_TASK_CREDITS * 0.05); // 1 credit
}
//# sourceMappingURL=fee.js.map