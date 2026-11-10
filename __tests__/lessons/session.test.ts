import { upsert } from "../../src/db/repository";
import { BATCH_SIZE, loadBatch, nextBatchSize } from "../../src/lessons/session";
import { assignment, subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

describe("nextBatchSize", () => {
  it.each([
    [15, 0, false, 5], // plenty left today
    [15, 12, false, 3], // only 3 left before the limit
    [15, 15, false, 0], // limit reached
    [15, 20, false, 0], // over the limit (e.g. lessons on the website)
    [15, 15, true, 5], // "Do more anyway"
  ])("limit %i, done %i, ignore %p → %i", (limit, done, ignore, expected) => {
    expect(nextBatchSize(limit, done, ignore)).toBe(expected);
  });

  it("uses batches of 5", () => {
    expect(BATCH_SIZE).toBe(5);
  });
});

describe("loadBatch", () => {
  it("loads lessons with the subjects they are made of", async () => {
    const db = await createMigratedTestDb();
    const lesson = { srs_stage: 0, started_at: null, available_at: null, unlocked_at: "2026-02-01T00:00:00.000000Z" };
    await upsert.subjects(db, [
      subject(10, { characters: "一", lesson_position: 1 }),
      subject(11, { characters: "人", lesson_position: 2 }),
      subject(20, { characters: "大", lesson_position: 3, component_subject_ids: [10, 11] }),
    ]);
    await upsert.assignments(db, [assignment(20, lesson)]);

    const batch = await loadBatch(db, 5);

    expect(batch.items.map((i) => i.subject.id)).toEqual([20]);
    expect(batch.components[20].map((s) => s.data.characters)).toEqual(["一", "人"]);
  });

  it("is empty when there are no lessons", async () => {
    const db = await createMigratedTestDb();

    expect(await loadBatch(db, 5)).toEqual({ items: [], components: {} });
  });
});
