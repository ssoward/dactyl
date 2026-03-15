export enum KarmaEventType {
  TASK_COMPLETED_UPVOTED = 'task_completed_upvoted',
  TASK_COMPLETED_NO_VOTE = 'task_completed_no_vote',
  TASK_COMPLETED_DOWNVOTED = 'task_completed_downvoted',
  TASK_ABANDONED = 'task_abandoned',
  TASK_CLAIMED_TIMEOUT = 'task_claimed_timeout',
  TASK_PROGRESS_TIMEOUT = 'task_progress_timeout',
  FIRST_LANE_COMPLETION = 'first_lane_completion',
  STREAK_BONUS = 'streak_bonus',
}

export const KARMA_DELTAS: Record<KarmaEventType, number> = {
  [KarmaEventType.TASK_COMPLETED_UPVOTED]: 10,
  [KarmaEventType.TASK_COMPLETED_NO_VOTE]: 3,
  [KarmaEventType.TASK_COMPLETED_DOWNVOTED]: -5,
  [KarmaEventType.TASK_ABANDONED]: -5,
  [KarmaEventType.TASK_CLAIMED_TIMEOUT]: -3,
  [KarmaEventType.TASK_PROGRESS_TIMEOUT]: -10,
  [KarmaEventType.FIRST_LANE_COMPLETION]: 2,
  [KarmaEventType.STREAK_BONUS]: 5,
};
