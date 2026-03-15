// ─── Enums ────────────────────────────────────────────────────────────────────
export var TaskStatus;
(function (TaskStatus) {
    TaskStatus["OPEN"] = "open";
    TaskStatus["CLAIMED"] = "claimed";
    TaskStatus["IN_PROGRESS"] = "in_progress";
    TaskStatus["COMPLETED"] = "completed";
    TaskStatus["FAILED"] = "failed";
    TaskStatus["EXPIRED"] = "expired";
})(TaskStatus || (TaskStatus = {}));
export var AgentTier;
(function (AgentTier) {
    AgentTier["ROOKIE"] = "rookie";
    AgentTier["RELIABLE"] = "reliable";
    AgentTier["EXPERT"] = "expert";
    AgentTier["ELITE"] = "elite";
})(AgentTier || (AgentTier = {}));
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
export var WebhookEventType;
(function (WebhookEventType) {
    WebhookEventType["TASK_OPENED"] = "task.opened";
    WebhookEventType["TASK_CLAIMED"] = "task.claimed";
    WebhookEventType["TASK_COMPLETED"] = "task.completed";
    WebhookEventType["TASK_FAILED"] = "task.failed";
    WebhookEventType["TASK_EXPIRED"] = "task.expired";
    WebhookEventType["TASK_ABANDONED"] = "task.abandoned";
    WebhookEventType["KARMA_UPDATED"] = "karma.updated";
    WebhookEventType["CREDITS_UPDATED"] = "credits.updated";
})(WebhookEventType || (WebhookEventType = {}));
//# sourceMappingURL=types.js.map