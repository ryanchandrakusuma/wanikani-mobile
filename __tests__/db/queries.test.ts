import type { WKAssignment } from "../../src/api/types";
import { getForecast, getTodoCounts, toWkTime } from "../../src/db/queries";
import { upsert } from "../../src/db/repository";
import { assignment, subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

const NOW = new Date("2026-03-01T10:30:00.000Z");
const START_OF_DAY = new Date("2026-03-01T00:00:00.000Z");
const H = 3_600_000;
const at = (offsetMs: number) => toWkTime(new Date(NOW.getTime() + offsetMs));

let nextId = 1;
/** Adds a subject + assignment pair and returns its id. */
async function add(db: Awaited<ReturnType<typeof createMigratedTestDb>>, a: Partial<WKAssignment>, subjectHiddenAt: string | null = null) {
  const id = nextId++;
  await upsert.subjects(db, [subject(id, { hidden_at: subjectHiddenAt })]);
  await upsert.assignments(db, [assignment(id, a)]);
  return id;
}

const lesson = { srs_stage: 0, started_at: null, available_at: null, unlocked_at: "2026-02-01T00:00:00.000000Z" };
const review = (offsetMs: number, stage = 3) => ({
  srs_stage: stage, started_at: "2026-02-01T00:00:00.000000Z", available_at: at(offsetMs),
});

describe("toWkTime", () => {
  it("pads JS milliseconds to WaniKani's microseconds", () => {
    expect(toWkTime(new Date("2026-03-01T10:30:00.123Z"))).toBe("2026-03-01T10:30:00.123000Z");
  });
});

describe("getTodoCounts", () => {
  it("is all zeros on an empty database", async () => {
    const db = await createMigratedTestDb();

    expect(await getTodoCounts(db, NOW, START_OF_DAY)).toEqual({
      lessonsAvailable: 0, lessonsStartedToday: 0, reviewsAvailable: 0, nextReviewAt: null,
    });
  });

  it("counts unlocked, not-started items as lessons", async () => {
    const db = await createMigratedTestDb();
    await add(db, lesson);
    await add(db, lesson);
    await add(db, { ...lesson, unlocked_at: null }); // locked → not a lesson

    expect((await getTodoCounts(db, NOW, START_OF_DAY)).lessonsAvailable).toBe(2);
  });

  it("counts reviews that are due now, including exactly now", async () => {
    const db = await createMigratedTestDb();
    await add(db, review(-H));
    await add(db, review(0)); // due this exact moment
    await add(db, review(+1)); // 1 ms in the future → not yet

    expect((await getTodoCounts(db, NOW, START_OF_DAY)).reviewsAvailable).toBe(2);
  });

  it("compares against WaniKani's microsecond timestamps exactly", async () => {
    const db = await createMigratedTestDb();
    // 999 microseconds after NOW: in the future, even though the millisecond part matches
    await add(db, { ...review(0), available_at: "2026-03-01T10:30:00.000999Z" });

    expect((await getTodoCounts(db, NOW, START_OF_DAY)).reviewsAvailable).toBe(0);
  });

  it("ignores burned, hidden, and retired items", async () => {
    const db = await createMigratedTestDb();
    await add(db, { ...review(-H), srs_stage: 9, burned_at: "2026-02-01T00:00:00.000000Z" });
    await add(db, { ...review(-H), hidden: true });
    await add(db, review(-H), "2026-01-01T00:00:00.000000Z"); // subject retired by WaniKani
    await add(db, { ...lesson, hidden: true });

    expect(await getTodoCounts(db, NOW, START_OF_DAY)).toMatchObject({ lessonsAvailable: 0, reviewsAvailable: 0 });
  });

  it("counts lessons started since midnight", async () => {
    const db = await createMigratedTestDb();
    await add(db, { ...review(H), started_at: "2026-03-01T08:00:00.000000Z" });
    await add(db, { ...review(H), started_at: "2026-03-01T00:00:00.000000Z" }); // exactly midnight
    await add(db, { ...review(H), started_at: "2026-02-28T23:59:59.999999Z" }); // yesterday

    expect((await getTodoCounts(db, NOW, START_OF_DAY)).lessonsStartedToday).toBe(2);
  });

  it("reports the earliest upcoming review", async () => {
    const db = await createMigratedTestDb();
    await add(db, review(-H)); // already due, not "next"
    await add(db, review(5 * H));
    await add(db, review(2 * H));
    await add(db, review(30 * H));

    expect((await getTodoCounts(db, NOW, START_OF_DAY)).nextReviewAt).toBe(at(2 * H));
  });
});

describe("getForecast", () => {
  const hourOf = (offsetMs: number) => {
    const d = new Date(NOW.getTime() + offsetMs);
    d.setMinutes(0, 0, 0);
    return d;
  };

  it("groups upcoming reviews by local hour with a running total", async () => {
    const db = await createMigratedTestDb();
    await add(db, review(H));
    await add(db, review(H + 60_000)); // same hour
    await add(db, review(3 * H));

    const forecast = await getForecast(db, NOW, 5);

    expect(forecast).toEqual([
      { hourStart: hourOf(H), count: 2, cumulative: 7 },
      { hourStart: hourOf(3 * H), count: 1, cumulative: 8 },
    ]);
  });

  it("only looks 24 hours ahead and skips reviews already due", async () => {
    const db = await createMigratedTestDb();
    await add(db, review(-H));
    await add(db, review(24 * H)); // edge: included
    await add(db, review(24 * H + 1)); // just outside

    const forecast = await getForecast(db, NOW, 0);

    expect(forecast.map((f) => f.count)).toEqual([1]);
    expect(forecast[0].hourStart).toEqual(hourOf(24 * H));
  });

  it("leaves out burned, hidden, and retired items", async () => {
    const db = await createMigratedTestDb();
    await add(db, { ...review(H), srs_stage: 9 });
    await add(db, { ...review(H), hidden: true });
    await add(db, review(H), "2026-01-01T00:00:00.000000Z");

    expect(await getForecast(db, NOW, 0)).toEqual([]);
  });

  it("supports a custom window", async () => {
    const db = await createMigratedTestDb();
    await add(db, review(2 * H));
    await add(db, review(48 * H));

    expect((await getForecast(db, NOW, 0, 72)).map((f) => f.count)).toEqual([1, 1]);
  });
});
