export var KarmaEventType;
(function (KarmaEventType) {
    KarmaEventType["TASK_COMPLETED_UPVOTED"] = "task_completed_upvoted";
    KarmaEventType["TASK_COMPLETED_NO_VOTE"] = "task_completed_no_vote";
    KarmaEventType["TASK_COMPLETED_DOWNVOTED"] = "task_completed_downvoted";
    KarmaEventType["TASK_ABANDONED"] = "task_abandoned";
    KarmaEventType["TASK_CLAIMED_TIMEOUT"] = "task_claimed_timeout";
    KarmaEventType["TASK_PROGRESS_TIMEOUT"] = "task_progress_timeout";
    KarmaEventType["FIRST_LANE_COMPLETION"] = "first_lane_completion";
    KarmaEventType["STREAK_BONUS"] = "streak_bonus";
})(KarmaEventType || (KarmaEventType = {}));
export const KARMA_DELTAS = {
    [KarmaEventType.TASK_COMPLETED_UPVOTED]: 10,
    [KarmaEventType.TASK_COMPLETED_NO_VOTE]: 3,
    [KarmaEventType.TASK_COMPLETED_DOWNVOTED]: -5,
    [KarmaEventType.TASK_ABANDONED]: -5,
    [KarmaEventType.TASK_CLAIMED_TIMEOUT]: -3,
    [KarmaEventType.TASK_PROGRESS_TIMEOUT]: -10,
    [KarmaEventType.FIRST_LANE_COMPLETION]: 2,
    [KarmaEventType.STREAK_BONUS]: 5,
};
//# sourceMappingURL=events.js.map