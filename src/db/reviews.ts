import { BURNED_STAGE, DEFAULT_INTERVAL_SECONDS, GURU_STAGE, nextReviewTime, nextSrsStage } from "../reviews/srs";
import type { FinishedReview } from "../reviews/reviewSession";
import type { SubjectObject } from "../subjects/model";
import { getStageIntervalSeconds, parseStudy, type LessonItem } from "./lessons";
import { toWkTime } from "./queries";
import type { Db } from "./types";

export interface ReviewItem extends LessonItem {
  /** Stage before this review (1–8). */
  srsStage: number;
}

interface ReviewRow {
  assignment_id: number;
  srs_stage: number;
  subject_id: number;
  object: SubjectObject;
  data: string;
  study: string | null;
}

/** Every review due now. The session shuffles them, so the order here doesn't matter. */
export async function getReviewQueue(db: Db, now: Date): Promise<ReviewItem[]> {
  const rows = await db.getAllAsync<ReviewRow>(
    `SELECT a.id AS assignment_id, a.srs_stage, s.id AS subject_id, s.object, s.data, sm.data AS study
     FROM assignments a
     JOIN subjects s ON s.id = a.subject_id
     LEFT JOIN study_materials sm ON sm.subject_id = s.id AND sm.hidden = 0
     WHERE a.hidden = 0 AND s.hidden_at IS NULL
       AND a.srs_stage BETWEEN 1 AND 8 AND a.available_at <= ?
     ORDER BY a.available_at, a.id`,
    [toWkTime(now)],
  );
  return rows.map((r) => ({
    assignmentId: r.assignment_id,
    srsStage: r.srs_stage,
    subject: { id: r.subject_id, object: r.object, data: JSON.parse(r.data) },
    study: parseStudy(r.study),
  }));
}

/**
 * Saves one finished review item locally, all at once:
 * - the assignment moves to its new stage and next review time (as WaniKani would set them)
 * - an outbox row ("this item was reviewed at this time with these mistakes") for WaniKani
 * - an activity_log row for the daily history
 * Returns false if the item had already been saved (e.g. reviewed twice).
 */
export async function completeReview(
  db: Db, item: ReviewItem, result: FinishedReview, now: Date, newId: () => string,
): Promise<boolean> {
  const stage = nextSrsStage(item.srsStage, result.meaningIncorrect, result.readingIncorrect);
  const nowWk = toWkTime(now);

  let saved = false;
  await db.withTransactionAsync(async () => {
    let availableAt: string | null = null;
    if (stage < BURNED_STAGE) {
      const interval =
        (await getStageIntervalSeconds(db, item.subject.data.spaced_repetition_system_id, stage)) ??
        DEFAULT_INTERVAL_SECONDS[stage];
      availableAt = toWkTime(nextReviewTime(now, interval));
    }
    const burnedAt = stage === BURNED_STAGE ? nowWk : null;
    const passedAt = `CASE WHEN passed_at IS NULL AND ? >= ${GURU_STAGE} THEN ? ELSE passed_at END`;

    const { changes } = await db.runAsync(
      `UPDATE assignments
       SET srs_stage = ?, available_at = ?, burned_at = ?, passed_at = ${passedAt},
           data = json_set(data, '$.srs_stage', ?, '$.available_at', ?, '$.burned_at', ?, '$.passed_at', ${passedAt})
       WHERE id = ? AND srs_stage = ? AND available_at <= ?`,
      [
        stage, availableAt, burnedAt, stage, nowWk,
        stage, availableAt, burnedAt, stage, nowWk,
        item.assignmentId, item.srsStage, nowWk,
      ],
    );
    if (!changes) return;

    await db.runAsync(
      "INSERT INTO outbox (kind, payload, created_at, assignment_id) VALUES ('review', ?, ?, ?)",
      [
        JSON.stringify({
          assignment_id: item.assignmentId,
          incorrect_meaning_answers: result.meaningIncorrect,
          incorrect_reading_answers: result.readingIncorrect,
          created_at: now.toISOString(),
        }),
        now.toISOString(),
        item.assignmentId,
      ],
    );
    await db.runAsync(
      `INSERT INTO activity_log (id, kind, subject_id, meaning_incorrect, reading_incorrect, created_at)
       VALUES (?, 'review', ?, ?, ?, ?)`,
      [newId(), item.subject.id, result.meaningIncorrect, result.readingIncorrect, now.toISOString()],
    );
    saved = true;
  });
  return saved;
}
