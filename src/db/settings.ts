import type { Db } from "./types";

/** WaniKani's own default daily lesson limit. */
export const DEFAULT_DAILY_LESSON_LIMIT = 15;
export const MIN_DAILY_LESSON_LIMIT = 5;
export const MAX_DAILY_LESSON_LIMIT = 100;
export const DAILY_LESSON_LIMIT_STEP = 5;

const KEY = "daily_lesson_limit";

export function clampDailyLessonLimit(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_DAILY_LESSON_LIMIT;
  return Math.min(MAX_DAILY_LESSON_LIMIT, Math.max(MIN_DAILY_LESSON_LIMIT, Math.round(n)));
}

export async function getDailyLessonLimit(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ value: string }>("SELECT value FROM settings WHERE key = ?", [KEY]);
  return row ? clampDailyLessonLimit(Number(row.value)) : DEFAULT_DAILY_LESSON_LIMIT;
}

/** Saves the limit (clamped to the allowed range) and returns what was saved. */
export async function setDailyLessonLimit(db: Db, n: number): Promise<number> {
  const value = clampDailyLessonLimit(n);
  await db.runAsync(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [KEY, String(value)],
  );
  return value;
}
