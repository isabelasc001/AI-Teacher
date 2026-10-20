export type LessonCycleSubscription = {
  current_period_start?: string | null;
  current_period_end?: string | null;
  starts_at?: string | null;
};

export type LessonCycleWindow = {
  startsAt: string;
  endsAt: string;
};

const DEFAULT_LESSON_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

function validTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function getLessonCycleWindow(
  subscription: LessonCycleSubscription,
): LessonCycleWindow | null {
  const startTimestamp = validTimestamp(subscription.current_period_start)
    ?? validTimestamp(subscription.starts_at);
  if (startTimestamp === null) return null;

  const endTimestamp = validTimestamp(subscription.current_period_end)
    ?? startTimestamp + DEFAULT_LESSON_RETENTION_MS;

  return {
    startsAt: new Date(startTimestamp).toISOString(),
    endsAt: new Date(endTimestamp).toISOString(),
  };
}

export function isLessonInCurrentCycle(
  createdAt: string,
  window: LessonCycleWindow | null,
  now = Date.now(),
) {
  if (!window || now >= Date.parse(window.endsAt)) return false;

  const createdAtTimestamp = Date.parse(createdAt);
  return Number.isFinite(createdAtTimestamp)
    && createdAtTimestamp >= Date.parse(window.startsAt)
    && createdAtTimestamp < Date.parse(window.endsAt);
}
