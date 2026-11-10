import type { ReactNode } from "react";
import { AppState } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { WKApiError } from "../../src/api/client";
import { useAuth } from "../../src/contexts/AuthContext";
import { getDatabase } from "../../src/db/database";
import { claimForUser, upsert } from "../../src/db/repository";
import { FOREGROUND_SYNC_INTERVAL_MS, SyncProvider, useSync } from "../../src/sync/SyncContext";
import { syncAll, type SyncOptions } from "../../src/sync/syncEngine";
import { flushOutbox } from "../../src/outbox/sender";
import { subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

jest.mock("../../src/contexts/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../src/db/database", () => ({ getDatabase: jest.fn() }));
jest.mock("../../src/sync/syncEngine", () => ({
  ...jest.requireActual("../../src/sync/syncEngine"),
  syncAll: jest.fn(),
}));
jest.mock("../../src/outbox/sender", () => ({ flushOutbox: jest.fn() }));

const mockUseAuth = jest.mocked(useAuth);
const mockSyncAll = jest.mocked(syncAll);
const mockFlush = jest.mocked(flushOutbox);
const mockSignOut = jest.fn();

function signedInAs(userId: string | null, token: string | null = "tok") {
  mockUseAuth.mockReturnValue({
    token,
    user: userId ? { id: userId } : null,
    signOut: mockSignOut,
  } as unknown as ReturnType<typeof useAuth>);
}

const wrapper = ({ children }: { children: ReactNode }) => <SyncProvider>{children}</SyncProvider>;

let db: Awaited<ReturnType<typeof createMigratedTestDb>>;

beforeEach(async () => {
  db = await createMigratedTestDb();
  jest.mocked(getDatabase).mockResolvedValue(db);
  mockSyncAll.mockReset().mockResolvedValue({} as never);
  mockFlush.mockReset().mockResolvedValue({ sent: 0, dropped: 0, pending: 0 });
  mockSignOut.mockReset().mockResolvedValue(undefined);
});

it("sends queued results before downloading", async () => {
  signedInAs("user-a");
  const order: string[] = [];
  mockFlush.mockImplementation(async () => { order.push("flush"); return { sent: 1, dropped: 0, pending: 0 }; });
  mockSyncAll.mockImplementation(async () => { order.push("download"); return {} as never; });

  const { result } = await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(result.current.phase).toBe("idle"));
  expect(mockFlush).toHaveBeenCalledWith(db, "tok");
  expect(order).toEqual(["flush", "download"]);
});

it("signs out when sending is refused with a 401", async () => {
  signedInAs("user-a");
  mockFlush.mockRejectedValue(new WKApiError("bad token", "unauthorized", 401));

  await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  expect(mockSyncAll).not.toHaveBeenCalled();
});

it("shows stored counts without syncing when nobody is signed in", async () => {
  signedInAs(null, null);
  await upsert.subjects(db, [subject(1)]);

  const { result } = await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(result.current.counts?.subjects).toBe(1));
  expect(mockSyncAll).not.toHaveBeenCalled();
  expect(result.current.lastSyncedAt).toBeNull();
});

it("does not sync while offline at startup (user unknown)", async () => {
  signedInAs(null, "tok");

  const { result } = await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(result.current.counts).not.toBeNull());
  expect(mockSyncAll).not.toHaveBeenCalled();
});

it("syncs automatically once the user is known", async () => {
  signedInAs("user-a");

  const { result } = await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(mockSyncAll).toHaveBeenCalledTimes(1));
  expect(mockSyncAll).toHaveBeenCalledWith(db, "tok", expect.any(Object));
  await waitFor(() => expect(result.current.phase).toBe("idle"));
});

it("wipes another account's data before syncing", async () => {
  await claimForUser(db, "user-a");
  await upsert.subjects(db, [subject(1)]);
  signedInAs("user-b");

  const { result } = await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(mockSyncAll).toHaveBeenCalled());
  await waitFor(() => expect(result.current.counts?.subjects).toBe(0));
});

it("keeps the same account's data", async () => {
  await claimForUser(db, "user-a");
  await upsert.subjects(db, [subject(1)]);
  signedInAs("user-a");

  const { result } = await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(mockSyncAll).toHaveBeenCalled());
  await waitFor(() => expect(result.current.phase).toBe("idle"));
  expect(result.current.counts?.subjects).toBe(1);
});

it("shows progress while syncing and joins a sync already running", async () => {
  signedInAs("user-a");
  let finish!: () => void;
  mockSyncAll.mockImplementation((_db, _tok, opts?: SyncOptions) => {
    opts?.onProgress?.({ resource: "subjects", label: "items", fetched: 1000, total: 9000 });
    return new Promise((resolve) => { finish = () => resolve({} as never); });
  });

  const { result } = await renderHook(() => useSync(), { wrapper });
  await waitFor(() => expect(result.current.phase).toBe("syncing"));
  expect(result.current.progress).toMatchObject({ fetched: 1000, total: 9000 });

  let manual!: Promise<void>;
  await act(async () => { manual = result.current.sync(); });
  expect(mockSyncAll).toHaveBeenCalledTimes(1);

  await act(async () => { finish(); await manual; });
  expect(result.current.phase).toBe("idle");
  expect(result.current.progress).toBeNull();
});

it("shows a message and stays signed in when offline", async () => {
  signedInAs("user-a");
  mockSyncAll.mockRejectedValue(new WKApiError("No connection to WaniKani.", "network"));

  const { result } = await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(result.current.phase).toBe("error"));
  expect(result.current.error).toBe("No connection to WaniKani.");
  expect(mockSignOut).not.toHaveBeenCalled();
});

it("signs out when WaniKani rejects the token", async () => {
  signedInAs("user-a");
  mockSyncAll.mockRejectedValue(new WKApiError("bad token", "unauthorized", 401));

  await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
});

it("uses a generic message for unexpected errors", async () => {
  signedInAs("user-a");
  mockSyncAll.mockRejectedValue(new Error("disk full"));

  const { result } = await renderHook(() => useSync(), { wrapper });

  await waitFor(() => expect(result.current.error).toBe("Sync failed. Pull down to try again."));
});

it("re-syncs on returning to the app, at most once a minute", async () => {
  signedInAs("user-a");
  let onChange!: (state: string) => void;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, handler) => {
    onChange = handler as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
  const now = jest.spyOn(Date, "now").mockReturnValue(1_000_000);

  const { result } = await renderHook(() => useSync(), { wrapper });
  await waitFor(() => expect(result.current.phase).toBe("idle"));
  expect(mockSyncAll).toHaveBeenCalledTimes(1);

  now.mockReturnValue(1_000_000 + 10_000);
  await act(async () => onChange("active"));
  expect(mockSyncAll).toHaveBeenCalledTimes(1);

  now.mockReturnValue(1_000_000 + FOREGROUND_SYNC_INTERVAL_MS);
  await act(async () => onChange("active"));
  await waitFor(() => expect(mockSyncAll).toHaveBeenCalledTimes(2));

  await act(async () => onChange("background"));
  expect(mockSyncAll).toHaveBeenCalledTimes(2);
});

it("counts unsent outbox items", async () => {
  signedInAs("user-a");
  await db.runAsync("INSERT INTO outbox (kind, payload, created_at) VALUES ('review', '{}', 'now')", []);

  const { result } = await renderHook(() => useSync(), { wrapper });
  await waitFor(() => expect(result.current.counts).not.toBeNull());

  expect(await result.current.pendingOutboxCount()).toBe(1);
});

it("throws a clear error outside SyncProvider", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});

  await expect(async () => {
    await renderHook(() => useSync());
  }).rejects.toThrow("useSync must be used inside SyncProvider");
});
