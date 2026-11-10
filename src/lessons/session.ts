import { getLessonQueue, getSubjectsByIds, type LessonItem } from "../db/lessons";
import type { Db } from "../db/types";
import type { Subject } from "../subjects/model";

/** Items learned before each quiz (WaniKani's default). */
export const BATCH_SIZE = 5;

/**
 * How many lessons the next batch may hold.
 * Normally capped by what's left of today's limit; after "Do more anyway" it's a full batch.
 */
export function nextBatchSize(dailyLimit: number, doneToday: number, ignoreLimit: boolean): number {
  if (ignoreLimit) return BATCH_SIZE;
  return Math.max(0, Math.min(BATCH_SIZE, dailyLimit - doneToday));
}

export interface Batch {
  items: LessonItem[];
  /** subject id → the radicals / kanji it is made of */
  components: Record<number, Subject[]>;
}

/** The next lessons plus the subjects they are made of, ready to show offline. */
export async function loadBatch(db: Db, size: number): Promise<Batch> {
  const items = await getLessonQueue(db, size);
  const ids = [...new Set(items.flatMap((i) => i.subject.data.component_subject_ids ?? []))];
  const byId = new Map((await getSubjectsByIds(db, ids)).map((s) => [s.id, s]));
  const components: Record<number, Subject[]> = {};
  for (const item of items) {
    components[item.subject.id] = (item.subject.data.component_subject_ids ?? [])
      .map((id) => byId.get(id))
      .filter((s): s is Subject => !!s);
  }
  return { items, components };
}
