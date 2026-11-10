import { claimForUser } from "../../src/db/repository";
import {
  clampDailyLessonLimit, DEFAULT_DAILY_LESSON_LIMIT, getDailyLessonLimit, setDailyLessonLimit,
} from "../../src/db/settings";
import { createMigratedTestDb } from "../helpers/testDb";

describe("daily lesson limit", () => {
  it("defaults to 15 when never set", async () => {
    const db = await createMigratedTestDb();

    expect(await getDailyLessonLimit(db)).toBe(DEFAULT_DAILY_LESSON_LIMIT);
    expect(DEFAULT_DAILY_LESSON_LIMIT).toBe(15);
  });

  it("saves and reads back a new limit", async () => {
    const db = await createMigratedTestDb();

    await setDailyLessonLimit(db, 25);
    await setDailyLessonLimit(db, 30);

    expect(await getDailyLessonLimit(db)).toBe(30);
  });

  it("keeps the limit inside 5–100", async () => {
    const db = await createMigratedTestDb();

    expect(await setDailyLessonLimit(db, 0)).toBe(5);
    expect(await setDailyLessonLimit(db, 500)).toBe(100);
    expect(await getDailyLessonLimit(db)).toBe(100);
  });

  it.each([
    [NaN, 15],
    [Infinity, 15],
    [12.6, 13],
  ])("clamps %p to %p", (input, expected) => {
    expect(clampDailyLessonLimit(input)).toBe(expected);
  });

  it("falls back to the default if the stored value is garbage", async () => {
    const db = await createMigratedTestDb();
    await db.runAsync("INSERT INTO settings (key, value) VALUES ('daily_lesson_limit', 'abc')", []);

    expect(await getDailyLessonLimit(db)).toBe(15);
  });

  it("survives switching to another WaniKani account", async () => {
    const db = await createMigratedTestDb();
    await claimForUser(db, "user-a");
    await setDailyLessonLimit(db, 40);

    await claimForUser(db, "user-b"); // wipes WaniKani data

    expect(await getDailyLessonLimit(db)).toBe(40);
  });
});
