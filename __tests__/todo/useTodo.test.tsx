import { AppState } from "react-native";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { getDatabase } from "../../src/db/database";
import { toWkTime } from "../../src/db/queries";
import { upsert } from "../../src/db/repository";
import { useSync } from "../../src/sync/SyncContext";
import { TODO_REFRESH_MS, useTodo } from "../../src/todo/useTodo";
import { assignment, subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

jest.mock("../../src/db/database", () => ({ getDatabase: jest.fn() }));
jest.mock("../../src/sync/SyncContext", () => ({ useSync: jest.fn() }));

const mockUseSync = jest.mocked(useSync);
let db: Awaited<ReturnType<typeof createMigratedTestDb>>;
let nextId = 1;

function syncState(phase: "idle" | "syncing", lastSyncedAt: string | null) {
  mockUseSync.mockReturnValue({ phase, lastSyncedAt } as ReturnType<typeof useSync>);
}

async function addReview(availableAt: Date) {
  const id = nextId++;
  await upsert.subjects(db, [subject(id)]);
  await upsert.assignments(db, [assignment(id, { srs_stage: 2, available_at: toWkTime(availableAt) })]);
}

async function addLesson() {
  const id = nextId++;
  await upsert.subjects(db, [subject(id)]);
  await upsert.assignments(db, [assignment(id, { srs_stage: 0, started_at: null, available_at: null })]);
}

beforeEach(async () => {
  db = await createMigratedTestDb();
  jest.mocked(getDatabase).mockResolvedValue(db);
  syncState("idle", null);
});

afterEach(() => jest.useRealTimers());

it("reads counts and the forecast from the local database", async () => {
  await addLesson();
  await addReview(new Date(Date.now() - 60_000));
  await addReview(new Date(Date.now() + 2 * 3_600_000));

  const { result } = await renderHook(() => useTodo());

  await waitFor(() => expect(result.current.todo).not.toBeNull());
  expect(result.current.todo).toMatchObject({ lessonsAvailable: 1, reviewsAvailable: 1 });
  expect(result.current.todo!.forecast).toHaveLength(1);
  expect(result.current.todo!.forecast[0]).toMatchObject({ count: 1, cumulative: 2 });
});

it("re-reads after a sync finishes", async () => {
  const { result, rerender } = await renderHook(() => useTodo());
  await waitFor(() => expect(result.current.todo?.lessonsAvailable).toBe(0));

  await addLesson(); // the sync wrote new data
  syncState("idle", "2026-03-01T12:00:00.000Z");
  await rerender({});

  await waitFor(() => expect(result.current.todo?.lessonsAvailable).toBe(1));
});

it("re-reads every minute so newly due reviews appear", async () => {
  jest.useFakeTimers();
  const { result } = await renderHook(() => useTodo());
  await act(async () => { await jest.advanceTimersByTimeAsync(0); });
  expect(result.current.todo?.reviewsAvailable).toBe(0);

  await addReview(new Date(Date.now() - 1));
  await act(async () => { await jest.advanceTimersByTimeAsync(TODO_REFRESH_MS); });

  expect(result.current.todo?.reviewsAvailable).toBe(1);
});

it("re-reads when the app comes back to the foreground", async () => {
  let onChange!: (state: string) => void;
  jest.spyOn(AppState, "addEventListener").mockImplementation((_t, handler) => {
    onChange = handler as (state: string) => void;
    return { remove: jest.fn() } as never;
  });
  const { result } = await renderHook(() => useTodo());
  await waitFor(() => expect(result.current.todo).not.toBeNull());

  await addLesson();
  await act(async () => onChange("active"));

  await waitFor(() => expect(result.current.todo?.lessonsAvailable).toBe(1));
});
