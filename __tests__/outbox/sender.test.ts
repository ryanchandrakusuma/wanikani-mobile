import { getAssignment, startAssignment, WKApiError } from "../../src/api/client";
import { completeLessons, getLessonQueue } from "../../src/db/lessons";
import { getUpdatedAfter, saveSyncState, upsert } from "../../src/db/repository";
import { flushOutbox } from "../../src/outbox/sender";
import { assignment, subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

jest.mock("../../src/api/client", () => ({
  ...jest.requireActual("../../src/api/client"),
  startAssignment: jest.fn(),
  getAssignment: jest.fn(),
}));

const mockStart = jest.mocked(startAssignment);
const mockGet = jest.mocked(getAssignment);
type TestDb = Awaited<ReturnType<typeof createMigratedTestDb>>;

const NOW = new Date("2026-03-01T10:00:00.000Z");
const SERVER_TIME = "2026-03-01T10:00:01.000000Z";
let n = 0;

/** Adds lesson items and finishes them locally, filling the outbox. */
async function finishLessons(db: TestDb, ids: number[]) {
  for (const id of ids) {
    await upsert.subjects(db, [subject(id, { lesson_position: id })]);
    await upsert.assignments(db, [assignment(id, {
      srs_stage: 0, started_at: null, available_at: null, unlocked_at: "2026-02-01T00:00:00.000000Z",
    })]);
  }
  await completeLessons(db, await getLessonQueue(db, 99), NOW, () => `id-${++n}`);
}

const serverVersion = (id: number, stage = 1) =>
  assignment(id, { srs_stage: stage, started_at: SERVER_TIME, available_at: "2026-03-01T14:00:01.000000Z" }, SERVER_TIME);

const outboxCount = async (db: TestDb) => (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox", []))!.n;

beforeEach(() => {
  mockStart.mockReset();
  mockGet.mockReset();
});

it("sends finished lessons and stores WaniKani's response", async () => {
  const db = await createMigratedTestDb();
  await finishLessons(db, [1, 2]);
  mockStart.mockImplementation(async (_t, id) => serverVersion(id));

  expect(await flushOutbox(db, "tok")).toEqual({ sent: 2, dropped: 0, pending: 0 });

  expect(mockStart).toHaveBeenNthCalledWith(1, "tok", 1, NOW.toISOString());
  expect(mockStart).toHaveBeenNthCalledWith(2, "tok", 2, NOW.toISOString());
  expect(await db.getFirstAsync("SELECT started_at FROM assignments WHERE id = 1", [])).toEqual({ started_at: SERVER_TIME });
});

it("keeps everything queued when offline, and stops trying after the first failure", async () => {
  const db = await createMigratedTestDb();
  await finishLessons(db, [1, 2]);
  mockStart.mockRejectedValue(new WKApiError("No connection", "network"));

  expect(await flushOutbox(db, "tok")).toEqual({ sent: 0, dropped: 0, pending: 2 });

  expect(mockStart).toHaveBeenCalledTimes(1);
  expect(await db.getFirstAsync("SELECT attempts, last_error FROM outbox ORDER BY id LIMIT 1", []))
    .toEqual({ attempts: 1, last_error: "No connection" });
  // local progress is kept
  expect(await db.getFirstAsync("SELECT srs_stage FROM assignments WHERE id = 1", [])).toEqual({ srs_stage: 1 });
});

it("sends what's left on the next try", async () => {
  const db = await createMigratedTestDb();
  await finishLessons(db, [1, 2]);
  mockStart
    .mockImplementationOnce(async (_t, id) => serverVersion(id))
    .mockRejectedValueOnce(new WKApiError("Server error", "server", 503));
  expect(await flushOutbox(db, "tok")).toEqual({ sent: 1, dropped: 0, pending: 1 });

  mockStart.mockImplementation(async (_t, id) => serverVersion(id));
  expect(await flushOutbox(db, "tok")).toEqual({ sent: 1, dropped: 0, pending: 0 });
  expect(mockStart).toHaveBeenLastCalledWith("tok", 2, NOW.toISOString());
});

it("drops a lesson WaniKani refuses and takes the server's version", async () => {
  const db = await createMigratedTestDb();
  await finishLessons(db, [1]);
  mockStart.mockRejectedValue(new WKApiError("Already started", "client", 422));
  mockGet.mockResolvedValue(serverVersion(1, 2)); // done on the website meanwhile

  expect(await flushOutbox(db, "tok")).toEqual({ sent: 0, dropped: 1, pending: 0 });

  expect(await db.getFirstAsync("SELECT srs_stage FROM assignments WHERE id = 1", [])).toEqual({ srs_stage: 2 });
});

it("forces a full assignment re-download if the refused item can't be refreshed", async () => {
  const db = await createMigratedTestDb();
  await finishLessons(db, [1]);
  await saveSyncState(db, "assignments", "2026-02-20T00:00:00.000000Z", NOW.toISOString());
  mockStart.mockRejectedValue(new WKApiError("Already started", "client", 422));
  mockGet.mockRejectedValue(new WKApiError("No connection", "network"));

  await flushOutbox(db, "tok");

  expect(await getUpdatedAfter(db, "assignments")).toBeNull();
  expect(await outboxCount(db)).toBe(0);
});

it("throws when the token is rejected, keeping the queue", async () => {
  const db = await createMigratedTestDb();
  await finishLessons(db, [1]);
  mockStart.mockRejectedValue(new WKApiError("Bad token", "unauthorized", 401));

  await expect(flushOutbox(db, "tok")).rejects.toMatchObject({ kind: "unauthorized" });
  expect(await outboxCount(db)).toBe(1);
});

it("leaves reviews queued for a later step", async () => {
  const db = await createMigratedTestDb();
  await db.runAsync("INSERT INTO outbox (kind, payload, created_at) VALUES ('review', '{}', 'now')", []);

  expect(await flushOutbox(db, "tok")).toEqual({ sent: 0, dropped: 0, pending: 1 });
  expect(mockStart).not.toHaveBeenCalled();
});

it("does nothing with an empty outbox", async () => {
  const db = await createMigratedTestDb();

  expect(await flushOutbox(db, "tok")).toEqual({ sent: 0, dropped: 0, pending: 0 });
});
