import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import Settings from "../../src/app/(tabs)/settings";
import { useAuth } from "../../src/contexts/AuthContext";
import { useSettings } from "../../src/contexts/SettingsContext";
import { useSync } from "../../src/contexts/SyncContext";

jest.mock("expo-router", () => ({ router: { replace: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});
jest.mock("../../src/contexts/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../src/contexts/SyncContext", () => ({ useSync: jest.fn() }));
jest.mock("../../src/contexts/SettingsContext", () => ({ useSettings: jest.fn() }));

type SyncValue = ReturnType<typeof useSync>;
const mockSignOut = jest.fn();
const mockPending = jest.fn();
const mockSync = jest.fn();
const mockSetLimit = jest.fn();

function setup(sync: Partial<SyncValue> = {}, limit = 15) {
  jest.mocked(useAuth).mockReturnValue({
    user: {
      id: "u1", username: "koichi", level: 7, profile_url: "", started_at: "",
      current_vacation_started_at: null,
      subscription: { active: true, type: "recurring", max_level_granted: 60, period_ends_at: null },
    },
    signOut: mockSignOut,
  } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(useSync).mockReturnValue({
    phase: "idle", progress: null, lastSyncedAt: null, error: null, counts: null,
    sync: mockSync, pendingOutboxCount: mockPending, ...sync,
  });
  jest.mocked(useSettings).mockReturnValue({ dailyLessonLimit: limit, setDailyLessonLimit: mockSetLimit });
}

beforeEach(() => {
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockPending.mockReset().mockResolvedValue(0);
  mockSync.mockReset().mockResolvedValue(undefined);
  mockSetLimit.mockReset().mockResolvedValue(undefined);
  jest.mocked(router.replace).mockReset();
});

it("shows account details", async () => {
  setup();
  await render(<Settings />);

  expect(screen.getByText("koichi")).toBeTruthy();
  expect(screen.getByText("recurring")).toBeTruthy();
  expect(screen.getByText("up to 60")).toBeTruthy();
});

describe("daily lesson limit", () => {
  const increase = () => screen.getByRole("button", { name: "Increase daily lesson limit" });
  const decrease = () => screen.getByRole("button", { name: "Decrease daily lesson limit" });

  it("shows the current limit and the default", async () => {
    setup({}, 15);
    await render(<Settings />);

    expect(screen.getByTestId("daily-lesson-limit")).toHaveTextContent("15");
    expect(screen.getByText(/Default is 15/)).toBeTruthy();
  });

  it("steps up and down by 5", async () => {
    setup({}, 15);
    await render(<Settings />);

    await fireEvent.press(increase());
    expect(mockSetLimit).toHaveBeenLastCalledWith(20);

    await fireEvent.press(decrease());
    expect(mockSetLimit).toHaveBeenLastCalledWith(10);
  });

  it("disables − at the minimum and + at the maximum", async () => {
    setup({}, 5);
    const { rerender } = await render(<Settings />);
    expect(decrease()).toBeDisabled();
    expect(increase()).toBeEnabled();

    setup({}, 100);
    await rerender(<Settings />);
    expect(increase()).toBeDisabled();
    expect(decrease()).toBeEnabled();
  });
});

describe("sync", () => {
  it("shows status and syncs on demand", async () => {
    setup({ lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString() });
    await render(<Settings />);

    expect(screen.getByTestId("sync-status")).toHaveTextContent("Synced 5 min ago");
    await fireEvent.press(screen.getByRole("button", { name: "Sync now" }));
    expect(mockSync).toHaveBeenCalledTimes(1);
  });

  it("disables Sync now while a sync is running", async () => {
    setup({ phase: "syncing" });
    await render(<Settings />);

    expect(screen.getByRole("button", { name: "Sync now" })).toBeDisabled();
  });

  it("shows the sync error", async () => {
    setup({ phase: "error", error: "No connection to WaniKani." });
    await render(<Settings />);

    expect(screen.getByTestId("sync-status")).toHaveTextContent("No connection to WaniKani.");
  });
});

it("shows the local summary with spelled-out labels", async () => {
  setup({
    counts: {
      subjects: 9321, assignments: 812, study_materials: 3, review_statistics: 640,
      level_progressions: 7, srs_systems: 2,
    },
  });
  await render(<Settings />);

  expect(screen.getByText("Local summary")).toBeTruthy();
  expect(screen.getByText("9,321")).toBeTruthy();
  expect(screen.getByText("Spaced repetition systems")).toBeTruthy();
});

describe("disconnect account", () => {
  const disconnect = () => screen.getByRole("button", { name: "Disconnect account" });

  it("signs out straight away when nothing is waiting to be sent", async () => {
    setup();
    await render(<Settings />);

    await fireEvent.press(disconnect());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("warns first when results are still unsent", async () => {
    setup();
    mockPending.mockResolvedValue(3);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Settings />);

    await fireEvent.press(disconnect());

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][1]).toContain("3 results haven't been sent");
    expect(mockSignOut).not.toHaveBeenCalled();

    alert.mock.calls[0][2]!.find((b) => b.style === "destructive")!.onPress!();
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it("uses singular wording for one unsent result", async () => {
    setup();
    mockPending.mockResolvedValue(1);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Settings />);

    await fireEvent.press(disconnect());

    await waitFor(() => expect(alert.mock.calls[0][1]).toContain("1 result hasn't been sent"));
  });
});
