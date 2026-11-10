// WaniKani's spaced repetition stages:
// 1–4 Apprentice, 5–6 Guru, 7 Master, 8 Enlightened, 9 Burned.

export const BURNED_STAGE = 9;
export const GURU_STAGE = 5;

/**
 * The stage after a review, the way WaniKani calculates it:
 * - no mistakes → one stage up
 * - mistakes → down by ⌈mistakes ÷ 2⌉ stages, doubled from Guru up,
 *   never below Apprentice 1
 */
export function nextSrsStage(stage: number, meaningIncorrect: number, readingIncorrect: number): number {
  const mistakes = meaningIncorrect + readingIncorrect;
  if (mistakes === 0) return Math.min(stage + 1, BURNED_STAGE);
  const penalty = stage >= GURU_STAGE ? 2 : 1;
  return Math.max(1, stage - Math.ceil(mistakes / 2) * penalty);
}

/**
 * WaniKani's standard wait before the next review at each stage, in seconds.
 * Used only if the spaced repetition system hasn't been downloaded yet.
 */
export const DEFAULT_INTERVAL_SECONDS: Record<number, number> = {
  1: 4 * 3600,
  2: 8 * 3600,
  3: 23 * 3600,
  4: 47 * 3600,
  5: 167 * 3600,
  6: 335 * 3600,
  7: 719 * 3600,
  8: 2879 * 3600,
};

/** Reviews become available at the start of an hour, so add the wait and round down. */
export function nextReviewTime(answeredAt: Date, intervalSeconds: number): Date {
  const t = new Date(answeredAt.getTime() + intervalSeconds * 1000);
  t.setUTCMinutes(0, 0, 0);
  return t;
}
