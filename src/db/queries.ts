import type { Db } from "./types";

/**
 * WaniKani timestamps carry microseconds ("…T10:00:00.000000Z"), JS gives
 * milliseconds ("…T10:00:00.000Z"). Padding to the same format makes SQL
 * string comparison (<=, >) exact.
 */
export function toWkTime(d: Date): string {
  return d.toISOString().replace(/Z$/, "000Z");
}

/** Assignments the user can actually study: not hidden, subject not retired. */
const ACTIVE = "a.hidden = 0 AND s.hidden_at IS NULL";
/** SRS stages 1–8 get reviews; 0 = lesson not done, 9 = burned. */
const IN_REVIEW = "a.srs_stage BETWEEN 1 AND 8";

export interface TodoCounts {
  /** Unlocked items whose lesson hasn't been done yet (total, not limited). */
  lessonsAvailable: number;
  /** Lessons done since local midnight (on any device or the website). */
  lessonsStartedToday: number;
  reviewsAvailable: number;
  /** Earliest future review time, or null if nothing is scheduled. */
  nextReviewAt: string | null;
}

export async function getTodoCounts(db: Db, now: Date, startOfDay: Date): Promise<TodoCounts> {
  const nowWk = toWkTime(now);
  const row = await db.getFirstAsync<{
    lessons: number | null; started_today: number | null; reviews: number | null; next_review: string | null;
  }>(
    `SELECT
       SUM(CASE WHEN a.srs_stage = 0 AND a.unlocked_at IS NOT NULL AND a.started_at IS NULL THEN 1 ELSE 0 END) AS lessons,
       SUM(CASE WHEN a.started_at >= ? THEN 1 ELSE 0 END) AS started_today,
       SUM(CASE WHEN ${IN_REVIEW} AND a.available_at <= ? THEN 1 ELSE 0 END) AS reviews,
       MIN(CASE WHEN ${IN_REVIEW} AND a.available_at > ? THEN a.available_at END) AS next_review
     FROM assignments a
     JOIN subjects s ON s.id = a.subject_id
     WHERE ${ACTIVE}`,
    [toWkTime(startOfDay), nowWk, nowWk],
  );
  return {
    lessonsAvailable: row?.lessons ?? 0,
    lessonsStartedToday: row?.started_today ?? 0,
    reviewsAvailable: row?.reviews ?? 0,
    nextReviewAt: row?.next_review ?? null,
  };
}

export interface ForecastHour {
  /** Start of the hour, in the device's local time. */
  hourStart: Date;
  /** Reviews becoming available during this hour. */
  count: number;
  /** Reviews waiting by the end of this hour (includes ones available now). */
  cumulative: number;
}

/** Reviews arriving in the next `hours` hours, grouped by local clock hour. Empty hours are skipped. */
export async function getForecast(
  db: Db, now: Date, availableNow: number, hours = 24,
): Promise<ForecastHour[]> {
  const end = new Date(now.getTime() + hours * 3_600_000);
  const rows = await db.getAllAsync<{ available_at: string }>(
    `SELECT a.available_at
     FROM assignments a
     JOIN subjects s ON s.id = a.subject_id
     WHERE ${ACTIVE} AND ${IN_REVIEW} AND a.available_at > ? AND a.available_at <= ?
     ORDER BY a.available_at`,
    [toWkTime(now), toWkTime(end)],
  );

  const buckets = new Map<number, number>();
  for (const { available_at } of rows) {
    const hour = new Date(available_at);
    hour.setMinutes(0, 0, 0);
    buckets.set(hour.getTime(), (buckets.get(hour.getTime()) ?? 0) + 1);
  }

  let running = availableNow;
  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([time, count]) => {
      running += count;
      return { hourStart: new Date(time), count, cumulative: running };
    });
}
