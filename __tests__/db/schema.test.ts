import { migrate, SCHEMA_VERSION } from "../../src/db/schema";
import { createTestDb } from "../helpers/testDb";

const EXPECTED_TABLES = [
  "activity_log", "assignments", "level_progressions", "meta", "outbox", "review_statistics",
  "srs_systems", "study_materials", "subjects", "sync_state",
];

async function tableNames(db: ReturnType<typeof createTestDb>) {
  const rows = await db.getAllAsync<{ name: string }>(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name", [],
  );
  return rows.map((r) => r.name);
}

async function userVersion(db: ReturnType<typeof createTestDb>) {
  return (await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []))!.user_version;
}

describe("migrate", () => {
  it("creates every table on a fresh database", async () => {
    const db = createTestDb();

    await migrate(db);

    expect(await tableNames(db)).toEqual(EXPECTED_TABLES);
    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
  });

  it("is safe to run again and keeps existing data", async () => {
    const db = createTestDb();
    await migrate(db);
    await db.runAsync("INSERT INTO meta (key, value) VALUES ('k', 'v')", []);

    await migrate(db);

    expect(await db.getFirstAsync("SELECT value FROM meta WHERE key = 'k'", [])).toEqual({ value: "v" });
    expect(await userVersion(db)).toBe(SCHEMA_VERSION);
  });

  it("refuses to open a database from a newer app version", async () => {
    const db = createTestDb();
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION + 1}`);

    await expect(migrate(db)).rejects.toThrow(/newer/);
  });

  it("only allows known activity kinds", async () => {
    const db = createTestDb();
    await migrate(db);

    await expect(
      db.runAsync("INSERT INTO activity_log (id, kind, subject_id, created_at) VALUES ('a', 'bogus', 1, 'now')", []),
    ).rejects.toThrow(/CHECK constraint/);
  });
});
