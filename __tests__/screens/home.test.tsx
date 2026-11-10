import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import Home from "../../src/app/home";
import { useAuth } from "../../src/auth/AuthContext";
import { useSync } from "../../src/sync/SyncContext";

jest.mock("expo-router", () => ({ Redirect: () => null, router: { replace: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});
jest.mock("../../src/auth/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../src/sync/SyncContext", () => ({ useSync: jest.fn() }));

type SyncValue = ReturnType<typeof useSync>;
const mockSignOut = jest.fn();
const mockPending = jest.fn();

function setup(sync: Partial<SyncValue> = {}) {
  jest.mocked(useAuth).mockReturnValue({
    status: "signedIn",
    user: {
      id: "u1", username: "koichi", level: 7, profile_url: "", started_at: "",
      current_vacation_started_at: null,
      subscription: { active: true, type: "recurring", max_level_granted: 60, period_ends_at: null },
    },
    signOut: mockSignOut,
    refreshUser: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(useSync).mockReturnValue({
    phase: "idle",
    progress: null,
    lastSyncedAt: null,
    error: null,
    counts: null,
    sync: jest.fn(),
    pendingOutboxCount: mockPending,
    ...sync,
  });
}

beforeEach(() => {
  mockSignOut.mockReset().mockResolvedValue(undefined);
  mockPending.mockReset().mockResolvedValue(0);
  jest.mocked(router.replace).mockReset();
});

const status = () => screen.getByTestId("sync-status");

describe("sync status", () => {
  it("shows download progress", async () => {
    setup({ phase: "syncing", progress: { resource: "subjects", label: "items", fetched: 4000, total: 9321 } });
    await render(<Home />);

    expect(status()).toHaveTextContent("Syncing items… 4,000 / 9,321");
  });

  it("shows when the last sync finished", async () => {
    setup({ lastSyncedAt: new Date(Date.now() - 5 * 60_000).toISOString() });
    await render(<Home />);

    expect(status()).toHaveTextContent("Synced 5 min ago");
  });

  it("says when nothing has synced yet", async () => {
    setup();
    await render(<Home />);

    expect(status()).toHaveTextContent("Not synced yet");
  });

  it("shows the sync error", async () => {
    setup({ phase: "error", error: "No connection to WaniKani." });
    await render(<Home />);

    expect(status()).toHaveTextContent("No connection to WaniKani.");
  });

  it("lists what is stored on the device", async () => {
    setup({
      counts: {
        subjects: 9321, assignments: 812, study_materials: 3, review_statistics: 640,
        level_progressions: 7, srs_systems: 2,
      },
    });
    await render(<Home />);

    expect(screen.getByText("Local summary")).toBeTruthy();
    expect(screen.getByText("9,321")).toBeTruthy();
    expect(screen.getByText("812")).toBeTruthy();
  });
});

describe("disconnect account", () => {
  const disconnect = () => screen.getByRole("button", { name: "Disconnect account" });

  it("signs out straight away when nothing is waiting to be sent", async () => {
    setup();
    await render(<Home />);

    await fireEvent.press(disconnect());

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it("warns first when results are still unsent", async () => {
    setup();
    mockPending.mockResolvedValue(3);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Home />);

    await fireEvent.press(disconnect());

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(alert.mock.calls[0][1]).toContain("3 results haven't been sent");
    expect(mockSignOut).not.toHaveBeenCalled();

    // Choosing "Disconnect anyway" signs out
    const buttons = alert.mock.calls[0][2]!;
    buttons.find((b) => b.style === "destructive")!.onPress!();
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
  });

  it("uses singular wording for one unsent result", async () => {
    setup();
    mockPending.mockResolvedValue(1);
    const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
    await render(<Home />);

    await fireEvent.press(disconnect());

    await waitFor(() => expect(alert.mock.calls[0][1]).toContain("1 result hasn't been sent"));
  });
});
