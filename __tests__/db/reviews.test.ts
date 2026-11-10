import { toWkTime } from "../../src/db/queries";
import { completeReview, getReviewQueue, type ReviewItem } from "../../src/db/reviews";
import { upsert } from "../../src/db/repository";
import { assignment, subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

type TestDb = Awaited<ReturnType<typeof createMigratedTestDb>>;

const NOW = new Date("2026-03-01T10:31:00.000Z");
const DUE = "2026-03-01T10:00:00.000000Z";
const LATER = "2026-03-01T12:00:00.000000Z";

let ids = 0;
const newId = () => `uuid-${++ids}`;
const perfect = (id: number) => ({ id, meaningIncorrect: 0, readingIncorrect: 0 });

async function addReview(db: TestDb, id: number, stage: number, availableAt = DUE, extra = {}) {
  await upsert.subjects(db, [subject(id)]);
  await upsert.assignments(db, [assignment(id, { srs_stage: stage, available_at: availableAt, ...extra })]);
}

async function addSrsSystem(db: TestDb) {
  await upsert.srs_systems(db, [{
    id: 1, object: "spaced_repetition_system", url: "", data_updated_at: null,
    data: {
      name: "Default", starting_stage_position: 1, passing_stage_position: 5, burning_stage_position: 9,
      unlocking_stage_position: 0,
      stages: [
        { position: 1, interval: 14400, interval_unit: "seconds" },
        { position: 2, interval: 2, interval_unit: "hours" },
        { position: 5, interval: 1, interval_unit: "weeks" },
      ],
    },
  }]);
}

const row = (db: TestDb, id: number) => db.getFirstAsync<{
  srs_stage: number; available_at: string | null; passed_at: string | null; burned_at: string | null; data: string;
}>("SELECT srs_stage, available_at, passed_at, burned_at, data FROM assignments WHERE id = ?", [id]);

async function queueItem(db: TestDb, id: number): Promise<ReviewItem> {
  return (await getReviewQueue(db, NOW)).find((i) => i.assignmentId === id)!;
}

describe("getReviewQueue", () => {
  it("returns items due now, with their current stage", async () => {
    const db = await createMigratedTestDb();
    await addReview(db, 1, 3);
    await addReview(db, 2, 1, LATER);

    const queue = await getReviewQueue(db, NOW);

    expect(queue.map((i) => [i.assignmentId, i.srsStage])).toEqual([[1, 3]]);
    expect(queue[0].subject).toMatchObject({ id: 1, object: "kanji" });
  });

  it("skips lessons, burned, hidden and retired items", async () => {
    const db = await createMigratedTestDb();
    await addReview(db, 1, 0);
    await addReview(db, 2, 9);
    await addReview(db, 3, 4, DUE, { hidden: true });
    await upsert.subjects(db, [subject(4, { hidden_at: "2026-01-01T00:00:00Z" })]);
    await upsert.assignments(db, [assignment(4, { srs_stage: 2, available_at: DUE })]);
    await addReview(db, 5, 8);

    expect((await getReviewQueue(db, NOW)).map((i) => i.assignmentId)).toEqual([5]);
  });
});

describe("completeReview", () => {
  it("moves the item up a stage, due at the start of the hour after the wait", async () => {
    const db = await createMigratedTestDb();
    await addSrsSystem(db);
    await addReview(db, 1, 1);

    expect(await completeReview(db, await queueItem(db, 1), perfect(1), NOW, newId)).toBe(true);

    const r = await row(db, 1);
    // 10:31 + 2 h (stage 2) → 12:00
    expect(r).toMatchObject({ srs_stage: 2, available_at: "2026-03-01T12:00:00.000000Z", burned_at: null });
    expect(JSON.parse(r!.data)).toMatchObject({ srs_stage: 2, available_at: "2026-03-01T12:00:00.000000Z" });
  });

  it("drops the stage after mistakes", async () => {
    const db = await createMigratedTestDb();
    await addSrsSystem(db);
    await addReview(db, 1, 3);

    await completeReview(db, await queueItem(db, 1), { id: 1, meaningIncorrect: 1, readingIncorrect: 0 }, NOW, newId);

    expect(await row(db, 1)).toMatchObject({ srs_stage: 2 });
  });

  it("uses WaniKani's standard wait if the spaced repetition system isn't downloaded", async () => {
    const db = await createMigratedTestDb();
    await addReview(db, 1, 2);

    await completeReview(db, await queueItem(db, 1), perfect(1), NOW, newId);

    // stage 3 = 23 h: 10:31 + 23 h → 09:31 next day → 09:00
    expect(await row(db, 1)).toMatchObject({ srs_stage: 3, available_at: "2026-03-02T09:00:00.000000Z" });
  });

  it("marks the first time an item reaches Guru", async () => {
    const db = await createMigratedTestDb();
    await addSrsSystem(db);
    await addReview(db, 1, 4, DUE, { passed_at: null });
    await addReview(db, 2, 6, DUE, { passed_at: "2026-01-05T00:00:00.000000Z" });

    await completeReview(db, await queueItem(db, 1), perfect(1), NOW, newId);
    await completeReview(db, await queueItem(db, 2), perfect(2), NOW, newId);

    const one = await row(db, 1);
    expect(one).toMatchObject({ srs_stage: 5, passed_at: toWkTime(NOW) });
    expect(JSON.parse(one!.data).passed_at).toBe(toWkTime(NOW));
    expect(await row(db, 2)).toMatchObject({ passed_at: "2026-01-05T00:00:00.000000Z" });
  });

  it("burns an Enlightened item answered perfectly", async () => {
    const db = await createMigratedTestDb();
    await addReview(db, 1, 8);

    await completeReview(db, await queueItem(db, 1), perfect(1), NOW, newId);

    expect(await row(db, 1)).toMatchObject({ srs_stage: 9, available_at: null, burned_at: toWkTime(NOW) });
    expect(await getReviewQueue(db, new Date("2030-01-01T00:00:00Z"))).toEqual([]);
  });

  it("queues the result for WaniKani and logs it", async () => {
    const db = await createMigratedTestDb();
    await addReview(db, 1, 3);

    await completeReview(db, await queueItem(db, 1), { id: 1, meaningIncorrect: 2, readingIncorrect: 1 }, NOW, () => "log-1");

    const outbox = await db.getAllAsync<{ kind: string; payload: string; assignment_id: number }>(
      "SELECT kind, payload, assignment_id FROM outbox", [],
    );
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ kind: "review", assignment_id: 1 });
    expect(JSON.parse(outbox[0].payload)).toEqual({
      assignment_id: 1, incorrect_meaning_answers: 2, incorrect_reading_answers: 1, created_at: NOW.toISOString(),
    });
    expect(await db.getAllAsync("SELECT id, kind, subject_id, meaning_incorrect, reading_incorrect FROM activity_log", []))
      .toEqual([{ id: "log-1", kind: "review", subject_id: 1, meaning_incorrect: 2, reading_incorrect: 1 }]);
  });

  it("saves an item only once", async () => {
    const db = await createMigratedTestDb();
    await addReview(db, 1, 3);
    const item = await queueItem(db, 1);

    expect(await completeReview(db, item, perfect(1), NOW, newId)).toBe(true);
    expect(await completeReview(db, item, perfect(1), NOW, newId)).toBe(false);

    expect(await row(db, 1)).toMatchObject({ srs_stage: 4 });
    expect(await db.getFirstAsync("SELECT COUNT(*) AS n FROM outbox", [])).toEqual({ n: 1 });
  });
});
