import {
  claimForUser, countPendingOutbox, getLastFullSync, getStoredCounts, getUpdatedAfter,
  saveSyncState, upsert, wipeAllData,
} from "../../src/db/repository";
import { assignment, subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

describe("upsert", () => {
  it("inserts subjects with query columns and the full JSON", async () => {
    const db = await createMigratedTestDb();

    await upsert.subjects(db, [subject(440, { level: 3, characters: "大" })]);

    const row = await db.getFirstAsync<Record<string, unknown>>("SELECT * FROM subjects WHERE id = 440", []);
    expect(row).toMatchObject({ id: 440, object: "kanji", level: 3, characters: "大", hidden_at: null });
    expect(JSON.parse(row!.data as string).meanings[0].meaning).toBe("One");
  });

  it("updates an existing row instead of duplicating it", async () => {
    const db = await createMigratedTestDb();
    await upsert.assignments(db, [assignment(1, { srs_stage: 1 })]);

    await upsert.assignments(db, [assignment(1, { srs_stage: 5, passed_at: "2026-02-01T00:00:00Z" })]);

    const rows = await db.getAllAsync<{ srs_stage: number; passed_at: string }>("SELECT srs_stage, passed_at FROM assignments", []);
    expect(rows).toEqual([{ srs_stage: 5, passed_at: "2026-02-01T00:00:00Z" }]);
  });

  it("does not overwrite an assignment whose result is still waiting in the outbox", async () => {
    const db = await createMigratedTestDb();
    await upsert.assignments(db, [assignment(1, { srs_stage: 1, started_at: "2026-03-01T10:00:00.000000Z" })]);
    await upsert.assignments(db, [assignment(2, { srs_stage: 0 })]);
    await db.runAsync(
      "INSERT INTO outbox (kind, payload, created_at, assignment_id) VALUES ('start_assignment', '{}', 'now', 1)", [],
    );

    // A sync brings older server data (lesson not yet started on the server)
    await upsert.assignments(db, [
      assignment(1, { srs_stage: 0, started_at: null }),
      assignment(2, { srs_stage: 3 }),
    ]);

    const rows = await db.getAllAsync<{ id: number; srs_stage: number }>("SELECT id, srs_stage FROM assignments ORDER BY id", []);
    expect(rows).toEqual([{ id: 1, srs_stage: 1 }, { id: 2, srs_stage: 3 }]);
  });

  it("updates the assignment again once its outbox row is gone", async () => {
    const db = await createMigratedTestDb();
    await upsert.assignments(db, [assignment(1, { srs_stage: 1 })]);
    await db.runAsync(
      "INSERT INTO outbox (kind, payload, created_at, assignment_id) VALUES ('start_assignment', '{}', 'now', 1)", [],
    );
    await db.runAsync("DELETE FROM outbox", []);

    await upsert.assignments(db, [assignment(1, { srs_stage: 2 })]);

    expect(await db.getFirstAsync("SELECT srs_stage FROM assignments WHERE id = 1", [])).toEqual({ srs_stage: 2 });
  });

  it("stores booleans as 0/1", async () => {
    const db = await createMigratedTestDb();

    await upsert.assignments(db, [assignment(1, { hidden: true }), assignment(2, { hidden: false })]);

    const rows = await db.getAllAsync<{ hidden: number }>("SELECT hidden FROM assignments ORDER BY id", []);
    expect(rows.map((r) => r.hidden)).toEqual([1, 0]);
  });

  it("handles more rows than one INSERT chunk", async () => {
    const db = await createMigratedTestDb();
    const many = Array.from({ length: 1000 }, (_, i) => subject(i + 1));

    await upsert.subjects(db, many);

    expect((await getStoredCounts(db)).subjects).toBe(1000);
  });

  it("does nothing for an empty page", async () => {
    const db = await createMigratedTestDb();

    await upsert.subjects(db, []);

    expect((await getStoredCounts(db)).subjects).toBe(0);
  });
});

describe("sync state", () => {
  it("has no cursor before the first sync", async () => {
    const db = await createMigratedTestDb();

    expect(await getUpdatedAfter(db, "subjects")).toBeNull();
  });

  it("saves and updates the cursor", async () => {
    const db = await createMigratedTestDb();

    await saveSyncState(db, "subjects", "2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z");
    await saveSyncState(db, "subjects", "2026-01-03T00:00:00Z", "2026-01-06T00:00:00Z");

    expect(await getUpdatedAfter(db, "subjects")).toBe("2026-01-03T00:00:00Z");
  });

  it("keeps the old cursor when WaniKani reports nothing new (null)", async () => {
    const db = await createMigratedTestDb();
    await saveSyncState(db, "subjects", "2026-01-01T00:00:00Z", "2026-01-05T00:00:00Z");

    await saveSyncState(db, "subjects", null, "2026-01-06T00:00:00Z");

    expect(await getUpdatedAfter(db, "subjects")).toBe("2026-01-01T00:00:00Z");
  });

  it("reports the last full sync only once every resource has synced", async () => {
    const db = await createMigratedTestDb();
    await saveSyncState(db, "subjects", null, "2026-01-05T10:00:00Z");

    expect(await getLastFullSync(db, ["subjects", "assignments"])).toBeNull();

    await saveSyncState(db, "assignments", null, "2026-01-05T09:00:00Z");
    expect(await getLastFullSync(db, ["subjects", "assignments"])).toBe("2026-01-05T09:00:00Z");
  });
});

describe("claimForUser", () => {
  it("claims an empty database without wiping", async () => {
    const db = await createMigratedTestDb();

    expect(await claimForUser(db, "user-a")).toBe(false);
  });

  it("keeps all data when the same account signs in again", async () => {
    const db = await createMigratedTestDb();
    await claimForUser(db, "user-a");
    await upsert.subjects(db, [subject(1)]);
    await db.runAsync("INSERT INTO activity_log (id, kind, subject_id, created_at) VALUES ('x', 'review', 1, 'now')", []);

    expect(await claimForUser(db, "user-a")).toBe(false);

    expect((await getStoredCounts(db)).subjects).toBe(1);
    expect(await db.getFirstAsync("SELECT COUNT(*) AS n FROM activity_log", [])).toEqual({ n: 1 });
  });

  it("wipes everything when a different account signs in", async () => {
    const db = await createMigratedTestDb();
    await claimForUser(db, "user-a");
    await upsert.subjects(db, [subject(1)]);
    await upsert.assignments(db, [assignment(1)]);
    await saveSyncState(db, "subjects", "2026-01-01T00:00:00Z", "2026-01-01T00:00:00Z");
    await db.runAsync("INSERT INTO outbox (kind, payload, created_at) VALUES ('review', '{}', 'now')", []);

    expect(await claimForUser(db, "user-b")).toBe(true);

    expect(await getStoredCounts(db)).toMatchObject({ subjects: 0, assignments: 0 });
    expect(await getUpdatedAfter(db, "subjects")).toBeNull();
    expect(await countPendingOutbox(db)).toBe(0);
    expect(await claimForUser(db, "user-b")).toBe(false); // now owned by B
  });
});

describe("wipeAllData", () => {
  it("rolls back if a delete fails, leaving data intact", async () => {
    const db = await createMigratedTestDb();
    await upsert.subjects(db, [subject(1)]);
    db.raw.exec("DROP TABLE outbox"); // force a failure partway through

    await expect(wipeAllData(db)).rejects.toThrow();

    expect((await getStoredCounts(db)).subjects).toBe(1);
  });
});

describe("countPendingOutbox", () => {
  it("counts queued results", async () => {
    const db = await createMigratedTestDb();
    expect(await countPendingOutbox(db)).toBe(0);

    await db.runAsync("INSERT INTO outbox (kind, payload, created_at) VALUES ('review', '{}', 'now')", []);

    expect(await countPendingOutbox(db)).toBe(1);
  });
});
