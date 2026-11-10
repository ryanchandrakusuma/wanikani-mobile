import { getCollectionPage, WKApiError } from "../../src/api/client";
import type { WKCollection } from "../../src/api/types";
import { getStoredCounts, getUpdatedAfter } from "../../src/db/repository";
import { SYNC_RESOURCES, syncAll, type SyncProgress } from "../../src/sync/syncEngine";
import { assignment, collection, subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

jest.mock("../../src/api/client", () => ({
  ...jest.requireActual("../../src/api/client"),
  getCollectionPage: jest.fn(),
}));

const mockPage = jest.mocked(getCollectionPage);
const API = "https://api.wanikani.com/v2";

type Routes = Record<string, WKCollection<unknown> | Error>;

/** Every endpoint returns an empty first page unless a test overrides it. */
function serve(overrides: Routes) {
  const routes: Routes = {};
  for (const r of SYNC_RESOURCES) routes[r.path] = collection([], { updatedAt: null });
  Object.assign(routes, overrides);
  mockPage.mockImplementation(async (_token, url) => {
    const page = routes[url];
    if (!page) throw new Error(`Unexpected request: ${url}`);
    if (page instanceof Error) throw page;
    return page as WKCollection<never>;
  });
}

const requestedUrls = () => mockPage.mock.calls.map((c) => c[1]);
const fixedNow = () => new Date("2026-03-01T12:00:00.000Z");

beforeEach(() => mockPage.mockReset());

describe("first sync", () => {
  it("downloads every endpoint, following next_url across pages", async () => {
    const db = await createMigratedTestDb();
    serve({
      "/subjects": collection([subject(1), subject(2)], {
        next: `${API}/subjects?page_after_id=2`, total: 3, updatedAt: "2026-02-01T00:00:00.000000Z",
      }),
      [`${API}/subjects?page_after_id=2`]: collection([subject(3)], { total: 3, updatedAt: "2026-02-01T00:00:00.000000Z" }),
      "/assignments": collection([assignment(1), assignment(2)], { updatedAt: "2026-02-02T00:00:00.000000Z" }),
    });

    const summary = await syncAll(db, "tok", { now: fixedNow });

    expect(summary).toMatchObject({ subjects: 3, assignments: 2, srs_systems: 0 });
    expect(await getStoredCounts(db)).toMatchObject({ subjects: 3, assignments: 2 });
    expect(mockPage.mock.calls.every((c) => c[0] === "tok")).toBe(true);
    // No updated_after on the first run
    expect(requestedUrls()).toEqual(expect.arrayContaining(SYNC_RESOURCES.map((r) => r.path)));
    expect(requestedUrls().some((u) => u.includes("updated_after"))).toBe(false);
  });

  it("saves the cursor from the first page", async () => {
    const db = await createMigratedTestDb();
    serve({
      "/subjects": collection([subject(1)], { next: `${API}/subjects?page_after_id=1`, updatedAt: "2026-02-01T00:00:00.000000Z" }),
      [`${API}/subjects?page_after_id=1`]: collection([subject(2)], { updatedAt: "2026-02-09T00:00:00.000000Z" }),
    });

    await syncAll(db, "tok", { now: fixedNow });

    expect(await getUpdatedAfter(db, "subjects")).toBe("2026-02-01T00:00:00.000000Z");
  });

  it("reports progress per page", async () => {
    const db = await createMigratedTestDb();
    serve({
      "/subjects": collection([subject(1), subject(2)], { next: `${API}/subjects?page_after_id=2`, total: 3 }),
      [`${API}/subjects?page_after_id=2`]: collection([subject(3)], { total: 3 }),
    });
    const events: SyncProgress[] = [];

    await syncAll(db, "tok", { onProgress: (p) => events.push(p) });

    expect(events.filter((e) => e.resource === "subjects")).toEqual([
      { resource: "subjects", label: "items", fetched: 2, total: 3 },
      { resource: "subjects", label: "items", fetched: 3, total: 3 },
    ]);
  });

  it("syncs the small endpoints before the big ones", async () => {
    const db = await createMigratedTestDb();
    serve({});

    await syncAll(db, "tok");

    expect(requestedUrls()[0]).toBe("/spaced_repetition_systems");
    expect(requestedUrls().indexOf("/subjects")).toBeLessThan(requestedUrls().indexOf("/assignments"));
  });
});

describe("incremental sync", () => {
  it("asks only for changes since the saved cursor and applies them", async () => {
    const db = await createMigratedTestDb();
    serve({
      "/subjects": collection([subject(1, { level: 1 }), subject(2)], { updatedAt: "2026-02-01T00:00:00.000000Z" }),
    });
    await syncAll(db, "tok", { now: fixedNow });
    mockPage.mockReset();

    const changedUrl = "/subjects?updated_after=2026-02-01T00%3A00%3A00.000000Z";
    serve({
      [changedUrl]: collection([subject(1, { level: 5 }, "2026-02-10T00:00:00.000000Z")]),
      // Other endpoints have a null cursor still, so they are asked in full
    });

    await syncAll(db, "tok", { now: fixedNow });

    expect(requestedUrls()).toContain(changedUrl);
    expect(await db.getFirstAsync("SELECT level FROM subjects WHERE id = 1", [])).toEqual({ level: 5 });
    expect((await getStoredCounts(db)).subjects).toBe(2);
    expect(await getUpdatedAfter(db, "subjects")).toBe("2026-02-10T00:00:00.000000Z");
  });

  it("keeps the cursor when nothing changed, but records the sync time", async () => {
    const db = await createMigratedTestDb();
    serve({ "/subjects": collection([subject(1)], { updatedAt: "2026-02-01T00:00:00.000000Z" }) });
    await syncAll(db, "tok", { now: () => new Date("2026-03-01T00:00:00.000Z") });
    mockPage.mockReset();
    serve({ "/subjects?updated_after=2026-02-01T00%3A00%3A00.000000Z": collection([], { updatedAt: null }) });

    await syncAll(db, "tok", { now: () => new Date("2026-03-02T00:00:00.000Z") });

    expect(await db.getFirstAsync("SELECT updated_after, last_synced_at FROM sync_state WHERE resource = 'subjects'", []))
      .toEqual({ updated_after: "2026-02-01T00:00:00.000000Z", last_synced_at: "2026-03-02T00:00:00.000Z" });
  });
});

describe("interrupted sync", () => {
  it("keeps finished pages, does not move the cursor, and restarts cleanly", async () => {
    const db = await createMigratedTestDb();
    const page2 = `${API}/subjects?page_after_id=2`;
    serve({
      "/subjects": collection([subject(1), subject(2)], { next: page2, total: 3, updatedAt: "2026-02-01T00:00:00.000000Z" }),
      [page2]: new WKApiError("No connection", "network"),
    });

    await expect(syncAll(db, "tok")).rejects.toMatchObject({ kind: "network" });

    expect((await getStoredCounts(db)).subjects).toBe(2);
    expect(await getUpdatedAfter(db, "subjects")).toBeNull();
    expect(requestedUrls()).not.toContain("/assignments"); // stopped at the failure

    // Back online: subjects are fetched from the start again (no updated_after)
    mockPage.mockReset();
    serve({
      "/subjects": collection([subject(1), subject(2)], { next: page2, total: 3, updatedAt: "2026-02-01T00:00:00.000000Z" }),
      [page2]: collection([subject(3)], { total: 3 }),
    });
    await syncAll(db, "tok");

    expect((await getStoredCounts(db)).subjects).toBe(3);
    expect(await getUpdatedAfter(db, "subjects")).toBe("2026-02-01T00:00:00.000000Z");
  });

  it("rolls back a page whose rows fail to save", async () => {
    const db = await createMigratedTestDb();
    const broken = subject(2);
    (broken.data as { level: unknown }).level = null; // violates NOT NULL
    serve({ "/subjects": collection([subject(1), broken]) });

    await expect(syncAll(db, "tok")).rejects.toThrow();

    expect((await getStoredCounts(db)).subjects).toBe(0);
  });
});
