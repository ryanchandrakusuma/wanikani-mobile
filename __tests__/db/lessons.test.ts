import { toWkTime } from "../../src/db/queries";
import {
  completeLessons, DEFAULT_FIRST_INTERVAL_SECONDS, getLessonQueue, getStageIntervalSeconds, getSubjectsByIds,
} from "../../src/db/lessons";
import { upsert } from "../../src/db/repository";
import { assignment, subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

type TestDb = Awaited<ReturnType<typeof createMigratedTestDb>>;

const NOW = new Date("2026-03-01T10:00:00.000Z");
const lesson = { srs_stage: 0, started_at: null, available_at: null, unlocked_at: "2026-02-01T00:00:00.000000Z" };

async function addLesson(db: TestDb, id: number, level: number, position: number, extra: Partial<Parameters<typeof subject>[1]> = {}) {
  await upsert.subjects(db, [subject(id, { level, lesson_position: position, ...extra })]);
  await upsert.assignments(db, [assignment(id, lesson)]);
}

async function addSrsSystem(db: TestDb, stage1: { interval: number | null; interval_unit: string | null }) {
  await upsert.srs_systems(db, [{
    id: 1, object: "spaced_repetition_system", url: "", data_updated_at: null,
    data: {
      name: "Default", starting_stage_position: 1, passing_stage_position: 5, burning_stage_position: 9,
      unlocking_stage_position: 0,
      stages: [{ position: 0, interval: null, interval_unit: null }, { position: 1, ...stage1 }],
    },
  }]);
}

let ids = 0;
const newId = () => `uuid-${++ids}`;

describe("getLessonQueue", () => {
  it("orders by level, then WaniKani lesson position", async () => {
    const db = await createMigratedTestDb();
    await addLesson(db, 10, 2, 0);
    await addLesson(db, 11, 1, 5);
    await addLesson(db, 12, 1, 1);

    const queue = await getLessonQueue(db, 10);

    expect(queue.map((l) => l.subject.id)).toEqual([12, 11, 10]);
    expect(queue[0]).toMatchObject({ assignmentId: 12, subject: { object: "kanji", data: { level: 1 } } });
  });

  it("respects the limit", async () => {
    const db = await createMigratedTestDb();
    for (let i = 1; i <= 8; i++) await addLesson(db, i, 1, i);

    expect(await getLessonQueue(db, 5)).toHaveLength(5);
    expect(await getLessonQueue(db, 0)).toEqual([]);
  });

  it("skips started, locked, hidden and retired items", async () => {
    const db = await createMigratedTestDb();
    await addLesson(db, 1, 1, 1);
    await upsert.subjects(db, [subject(2), subject(3), subject(4), subject(5, { hidden_at: "2026-01-01T00:00:00Z" })]);
    await upsert.assignments(db, [
      assignment(2, { srs_stage: 1 }), // already started
      assignment(3, { ...lesson, unlocked_at: null }), // locked
      assignment(4, { ...lesson, hidden: true }),
      assignment(5, lesson), // subject retired
    ]);

    expect((await getLessonQueue(db, 10)).map((l) => l.subject.id)).toEqual([1]);
  });

  it("includes the user's synonyms and notes", async () => {
    const db = await createMigratedTestDb();
    await addLesson(db, 1, 1, 1);
    await upsert.study_materials(db, [{
      id: 100, object: "study_material", url: "", data_updated_at: null,
      data: {
        subject_id: 1, subject_type: "kanji", meaning_note: "Looks like a person",
        reading_note: null, meaning_synonyms: ["huge"], hidden: false,
      },
    }]);

    const [item] = await getLessonQueue(db, 1);

    expect(item.study).toEqual({ meaningSynonyms: ["huge"], meaningNote: "Looks like a person", readingNote: null });
  });

  it("uses empty study material when there is none", async () => {
    const db = await createMigratedTestDb();
    await addLesson(db, 1, 1, 1);

    expect((await getLessonQueue(db, 1))[0].study).toEqual({ meaningSynonyms: [], meaningNote: null, readingNote: null });
  });
});

describe("getSubjectsByIds", () => {
  it("returns subjects in the requested order, skipping unknown ids", async () => {
    const db = await createMigratedTestDb();
    await upsert.subjects(db, [subject(1), subject(2), subject(3)]);

    expect((await getSubjectsByIds(db, [3, 99, 1])).map((s) => s.id)).toEqual([3, 1]);
    expect(await getSubjectsByIds(db, [])).toEqual([]);
  });
});

describe("getStageIntervalSeconds", () => {
  it.each([
    [{ interval: 14400, interval_unit: "seconds" }, 14400],
    [{ interval: 4, interval_unit: "hours" }, 14400],
    [{ interval: 1, interval_unit: "days" }, 86400],
    [{ interval: null, interval_unit: null }, null],
    [{ interval: 3, interval_unit: "fortnights" }, null],
  ])("%p → %p seconds", async (stage1, expected) => {
    const db = await createMigratedTestDb();
    await addSrsSystem(db, stage1);

    expect(await getStageIntervalSeconds(db, 1, 1)).toBe(expected);
  });

  it("is null for an unknown system", async () => {
    const db = await createMigratedTestDb();
    expect(await getStageIntervalSeconds(db, 42, 1)).toBeNull();
  });
});

describe("completeLessons", () => {
  it("moves items to Apprentice 1 and queues them for WaniKani", async () => {
    const db = await createMigratedTestDb();
    await addSrsSystem(db, { interval: 4, interval_unit: "hours" });
    await addLesson(db, 1, 1, 1);
    const items = await getLessonQueue(db, 5);

    expect(await completeLessons(db, items, NOW, newId)).toBe(1);

    const a = await db.getFirstAsync<{ srs_stage: number; started_at: string; available_at: string; data: string }>(
      "SELECT srs_stage, started_at, available_at, data FROM assignments WHERE id = 1", [],
    );
    expect(a).toMatchObject({
      srs_stage: 1,
      started_at: toWkTime(NOW),
      available_at: toWkTime(new Date(NOW.getTime() + 4 * 3_600_000)),
    });
    expect(JSON.parse(a!.data)).toMatchObject({ srs_stage: 1, started_at: toWkTime(NOW) });

    expect(await db.getAllAsync("SELECT kind, payload, assignment_id FROM outbox", [])).toEqual([{
      kind: "start_assignment",
      payload: JSON.stringify({ assignment_id: 1, started_at: NOW.toISOString() }),
      assignment_id: 1,
    }]);
    expect(await db.getAllAsync("SELECT id, kind, subject_id FROM activity_log", [])).toEqual([
      { id: expect.stringMatching(/^uuid-/), kind: "lesson", subject_id: 1 },
    ]);
  });

  it("falls back to 4 hours when the SRS timings are missing", async () => {
    const db = await createMigratedTestDb();
    await addLesson(db, 1, 1, 1);

    await completeLessons(db, await getLessonQueue(db, 5), NOW, newId);

    const a = await db.getFirstAsync<{ available_at: string }>("SELECT available_at FROM assignments WHERE id = 1", []);
    expect(a!.available_at).toBe(toWkTime(new Date(NOW.getTime() + DEFAULT_FIRST_INTERVAL_SECONDS * 1000)));
  });

  it("removes finished items from the lesson queue and adds them to the review forecast", async () => {
    const db = await createMigratedTestDb();
    await addLesson(db, 1, 1, 1);
    await addLesson(db, 2, 1, 2);
    const [first] = await getLessonQueue(db, 5);

    await completeLessons(db, [first], NOW, newId);

    expect((await getLessonQueue(db, 5)).map((l) => l.subject.id)).toEqual([2]);
  });

  it("does nothing for items finished twice", async () => {
    const db = await createMigratedTestDb();
    await addLesson(db, 1, 1, 1);
    const items = await getLessonQueue(db, 5);

    await completeLessons(db, items, NOW, newId);
    expect(await completeLessons(db, items, NOW, newId)).toBe(0);

    expect(await db.getFirstAsync("SELECT COUNT(*) AS n FROM outbox", [])).toEqual({ n: 1 });
    expect(await db.getFirstAsync("SELECT COUNT(*) AS n FROM activity_log", [])).toEqual({ n: 1 });
  });

  it("saves all or nothing", async () => {
    const db = await createMigratedTestDb();
    await addLesson(db, 1, 1, 1);
    await addLesson(db, 2, 1, 2);
    const items = await getLessonQueue(db, 5);
    let n = 0;
    const failingId = () => { if (++n === 2) throw new Error("boom"); return `id-${n}`; };

    await expect(completeLessons(db, items, NOW, failingId)).rejects.toThrow("boom");

    expect(await getLessonQueue(db, 5)).toHaveLength(2);
    expect(await db.getFirstAsync("SELECT COUNT(*) AS n FROM outbox", [])).toEqual({ n: 0 });
  });
});
