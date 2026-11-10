import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react-native";
import { getDatabase } from "../../src/db/database";
import { getDailyLessonLimit, setDailyLessonLimit } from "../../src/db/settings";
import { SettingsProvider, useSettings } from "../../src/settings/SettingsContext";
import { createMigratedTestDb } from "../helpers/testDb";

jest.mock("../../src/db/database", () => ({ getDatabase: jest.fn() }));

const wrapper = ({ children }: { children: ReactNode }) => <SettingsProvider>{children}</SettingsProvider>;

let db: Awaited<ReturnType<typeof createMigratedTestDb>>;

beforeEach(async () => {
  db = await createMigratedTestDb();
  jest.mocked(getDatabase).mockResolvedValue(db);
});

it("starts at the default of 15", async () => {
  const { result } = await renderHook(() => useSettings(), { wrapper });

  expect(result.current.dailyLessonLimit).toBe(15);
});

it("loads the saved limit", async () => {
  await setDailyLessonLimit(db, 30);

  const { result } = await renderHook(() => useSettings(), { wrapper });

  await waitFor(() => expect(result.current.dailyLessonLimit).toBe(30));
});

it("saves a new limit to the database", async () => {
  const { result } = await renderHook(() => useSettings(), { wrapper });

  await act(() => result.current.setDailyLessonLimit(20));

  expect(result.current.dailyLessonLimit).toBe(20);
  expect(await getDailyLessonLimit(db)).toBe(20);
});

it("clamps values outside 5–100", async () => {
  const { result } = await renderHook(() => useSettings(), { wrapper });

  await act(() => result.current.setDailyLessonLimit(0));

  expect(result.current.dailyLessonLimit).toBe(5);
});

it("keeps the default if the database can't be opened", async () => {
  jest.mocked(getDatabase).mockRejectedValue(new Error("no db"));

  const { result } = await renderHook(() => useSettings(), { wrapper });

  await waitFor(() => expect(getDatabase).toHaveBeenCalled());
  expect(result.current.dailyLessonLimit).toBe(15);
});

it("throws a clear error outside SettingsProvider", async () => {
  jest.spyOn(console, "error").mockImplementation(() => {});

  await expect(async () => {
    await renderHook(() => useSettings());
  }).rejects.toThrow("useSettings must be used inside SettingsProvider");
});
