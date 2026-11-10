import type { WKSpacedRepetitionSystem } from "../api/types";
import { EMPTY_STUDY, type StudyMaterial, type Subject, type SubjectObject } from "../subjects/model";
import { toWkTime } from "./queries";
import type { Db } from "./types";

export interface LessonItem {
  assignmentId: number;
  subject: Subject;
  study: StudyMaterial;
}

interface LessonRow {
  assignment_id: number;
  subject_id: number;
  object: SubjectObject;
  data: string;
  study: string | null;
}

function parseStudy(json: string | null): StudyMaterial {
  if (!json) return EMPTY_STUDY;
  const s = JSON.parse(json) as { meaning_synonyms?: string[]; meaning_note?: string | null; reading_note?: string | null };
  return {
    meaningSynonyms: s.meaning_synonyms ?? [],
    meaningNote: s.meaning_note ?? null,
    readingNote: s.reading_note ?? null,
  };
}

/**
 * The next lessons, in WaniKani's order: lower levels first, then WaniKani's
 * lesson_position within the level (radicals before the kanji that use them).
 */
export async function getLessonQueue(db: Db, limit: number): Promise<LessonItem[]> {
  if (limit <= 0) return [];
  const rows = await db.getAllAsync<LessonRow>(
    `SELECT a.id AS assignment_id, s.id AS subject_id, s.object, s.data, sm.data AS study
     FROM assignments a
     JOIN subjects s ON s.id = a.subject_id
     LEFT JOIN study_materials sm ON sm.subject_id = s.id AND sm.hidden = 0
     WHERE a.hidden = 0 AND s.hidden_at IS NULL
       AND a.srs_stage = 0 AND a.unlocked_at IS NOT NULL AND a.started_at IS NULL
     ORDER BY s.level, s.lesson_position, s.id
     LIMIT ?`,
    [limit],
  );
  return rows.map((r) => ({
    assignmentId: r.assignment_id,
    subject: { id: r.subject_id, object: r.object, data: JSON.parse(r.data) },
    study: parseStudy(r.study),
  }));
}

/** Subjects by id, in the order asked for (e.g. the radicals that make up a kanji). */
export async function getSubjectsByIds(db: Db, ids: number[]): Promise<Subject[]> {
  if (ids.length === 0) return [];
  const rows = await db.getAllAsync<{ id: number; object: SubjectObject; data: string }>(
    `SELECT id, object, data FROM subjects WHERE id IN (${ids.map(() => "?").join(", ")})`,
    ids,
  );
  const byId = new Map(rows.map((r) => [r.id, { id: r.id, object: r.object, data: JSON.parse(r.data) } as Subject]));
  return ids.map((id) => byId.get(id)).filter((s): s is Subject => !!s);
}

const UNIT_SECONDS: Record<string, number> = {
  milliseconds: 0.001, seconds: 1, minutes: 60, hours: 3600, days: 86_400, weeks: 604_800,
};

/** Wait before the first review of a new lesson (Apprentice 1). WaniKani's standard is 4 hours. */
export const DEFAULT_FIRST_INTERVAL_SECONDS = 4 * 3600;

export async function getStageIntervalSeconds(db: Db, srsSystemId: number, stage: number): Promise<number | null> {
  const row = await db.getFirstAsync<{ data: string }>("SELECT data FROM srs_systems WHERE id = ?", [srsSystemId]);
  if (!row) return null;
  const system = JSON.parse(row.data) as WKSpacedRepetitionSystem;
  const s = system.stages.find((x) => x.position === stage);
  if (!s || s.interval == null || !s.interval_unit) return null;
  const factor = UNIT_SECONDS[s.interval_unit];
  return factor == null ? null : s.interval * factor;
}

/**
 * Saves a finished lesson batch locally, all at once:
 * - each assignment becomes Apprentice 1, due after the first SRS interval
 * - an outbox row per item ("start this assignment at this time") to send to WaniKani
 * - an activity_log row per item for the daily history
 * Items already started (e.g. finished twice) are skipped.
 */
export async function completeLessons(
  db: Db, items: LessonItem[], now: Date, newId: () => string,
): Promise<number> {
  let completed = 0;
  await db.withTransactionAsync(async () => {
    for (const item of items) {
      const interval =
        (await getStageIntervalSeconds(db, item.subject.data.spaced_repetition_system_id, 1)) ??
        DEFAULT_FIRST_INTERVAL_SECONDS;
      const startedAt = toWkTime(now);
      const availableAt = toWkTime(new Date(now.getTime() + interval * 1000));

      const { changes } = await db.runAsync(
        `UPDATE assignments
         SET srs_stage = 1, started_at = ?, available_at = ?,
             data = json_set(data, '$.srs_stage', 1, '$.started_at', ?, '$.available_at', ?)
         WHERE id = ? AND started_at IS NULL`,
        [startedAt, availableAt, startedAt, availableAt, item.assignmentId],
      );
      if (!changes) continue;

      await db.runAsync(
        "INSERT INTO outbox (kind, payload, created_at, assignment_id) VALUES ('start_assignment', ?, ?, ?)",
        [JSON.stringify({ assignment_id: item.assignmentId, started_at: now.toISOString() }), now.toISOString(), item.assignmentId],
      );
      await db.runAsync(
        "INSERT INTO activity_log (id, kind, subject_id, created_at) VALUES (?, 'lesson', ?, ?)",
        [newId(), item.subject.id, now.toISOString()],
      );
      completed++;
    }
  });
  return completed;
}
