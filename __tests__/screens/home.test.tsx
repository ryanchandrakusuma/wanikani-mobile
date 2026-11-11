import { fireEvent, render, screen, within } from "@testing-library/react-native";
import { router } from "expo-router";
import Home from "../../src/app/(tabs)/home";
import { useAuth } from "../../src/contexts/AuthContext";
import { useSettings } from "../../src/contexts/SettingsContext";
import { useSync } from "../../src/contexts/SyncContext";
import { useTodo, type Todo } from "../../src/todo/useTodo";

jest.mock("expo-router", () => ({ router: { push: jest.fn() } }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});
jest.mock("../../src/contexts/AuthContext", () => ({ useAuth: jest.fn() }));
jest.mock("../../src/contexts/SyncContext", () => ({ useSync: jest.fn() }));
jest.mock("../../src/contexts/SettingsContext", () => ({ useSettings: jest.fn() }));
jest.mock("../../src/todo/useTodo", () => ({ useTodo: jest.fn() }));

const user = {
  id: "u1", username: "koichi", level: 7, profile_url: "", started_at: "",
  current_vacation_started_at: null as string | null,
  subscription: { active: true, type: "recurring", max_level_granted: 60, period_ends_at: null },
};

function setup(todo: Partial<Todo> | null, opts: { limit?: number; vacation?: boolean; sync?: Partial<ReturnType<typeof useSync>> } = {}) {
  jest.mocked(useAuth).mockReturnValue({
    user: { ...user, current_vacation_started_at: opts.vacation ? "2026-03-01T00:00:00Z" : null },
    refreshUser: jest.fn(),
  } as unknown as ReturnType<typeof useAuth>);
  jest.mocked(useSync).mockReturnValue({
    phase: "idle", progress: null, lastSyncedAt: null, error: null, counts: null,
    sync: jest.fn(), pendingOutboxCount: jest.fn(), ...opts.sync,
  });
  jest.mocked(useSettings).mockReturnValue({ dailyLessonLimit: opts.limit ?? 15, setDailyLessonLimit: jest.fn() });
  jest.mocked(useTodo).mockReturnValue({
    todo: todo && {
      lessonsAvailable: 0, lessonsStartedToday: 0, reviewsAvailable: 0, nextReviewAt: null, forecast: [],
      ...todo,
    },
    refresh: jest.fn(),
  });
}

const card = (id: string) => within(screen.getByTestId(id));

beforeEach(() => jest.mocked(router.push).mockReset());

describe("header", () => {
  it("greets the user with their level", async () => {
    setup({});
    await render(<Home />);

    expect(screen.getByText("koichi")).toBeTruthy();
    expect(screen.getByText("Level 7")).toBeTruthy();
  });

  it("shows a banner in vacation mode", async () => {
    setup({}, { vacation: true });
    await render(<Home />);

    expect(screen.getByText(/Vacation mode is on/)).toBeTruthy();
  });
});

describe("lessons card", () => {
  it("shows the total available and today's progress toward the limit", async () => {
    setup({ lessonsAvailable: 1234, lessonsStartedToday: 3 }, { limit: 15 });
    await render(<Home />);

    expect(card("lessons-card").getByText("1,234")).toBeTruthy();
    expect(card("lessons-card").getByText("3 of 15 done today")).toBeTruthy();
  });

  it("says when the daily limit is reached", async () => {
    setup({ lessonsAvailable: 40, lessonsStartedToday: 20 }, { limit: 20 });
    await render(<Home />);

    expect(card("lessons-card").getByText("Daily limit reached (20)")).toBeTruthy();
  });

  it("opens the lessons screen", async () => {
    setup({ lessonsAvailable: 5 });
    await render(<Home />);

    await fireEvent.press(screen.getByRole("button", { name: "Start lessons" }));

    expect(router.push).toHaveBeenCalledWith("/lessons");
  });

  it("disables Start when there are no lessons", async () => {
    setup({ lessonsAvailable: 0 });
    await render(<Home />);

    expect(card("lessons-card").getByText("No lessons waiting")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start lessons" })).toBeDisabled();
  });
});

describe("reviews card", () => {
  it("shows reviews ready now and opens the review screen", async () => {
    setup({ reviewsAvailable: 42 });
    await render(<Home />);

    expect(card("reviews-card").getByText("42")).toBeTruthy();
    expect(card("reviews-card").getByText("Ready now")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Start reviews" }));
    expect(router.push).toHaveBeenCalledWith("/reviews");
  });

  it("says all caught up and disables Start at zero", async () => {
    setup({ reviewsAvailable: 0 });
    await render(<Home />);

    expect(card("reviews-card").getByText("All caught up")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start reviews" })).toBeDisabled();
  });
});

describe("upcoming reviews", () => {
  it("shows when the next reviews arrive", async () => {
    const next = new Date(Date.now() + 2 * 3_600_000 + 60_000);
    setup({ nextReviewAt: next.toISOString() });
    await render(<Home />);

    const hh = String(next.getHours()).padStart(2, "0");
    const mm = String(next.getMinutes()).padStart(2, "0");
    expect(screen.getByTestId("next-review")).toHaveTextContent(`Next reviews in 2 h · ${hh}:${mm}`);
  });

  it("says when nothing is scheduled", async () => {
    setup({});
    await render(<Home />);

    expect(screen.getByTestId("next-review")).toHaveTextContent("No reviews scheduled");
  });

  it("lists the 24-hour forecast with running totals", async () => {
    setup({
      reviewsAvailable: 5,
      forecast: [
        { hourStart: new Date(2026, 2, 1, 14, 0), count: 12, cumulative: 17 },
        { hourStart: new Date(2026, 2, 1, 18, 0), count: 30, cumulative: 47 },
      ],
    });
    await render(<Home />);

    expect(screen.getByLabelText("14:00: 12 new, 17 total")).toBeTruthy();
    expect(screen.getByLabelText("18:00: 30 new, 47 total")).toBeTruthy();
    expect(screen.getByText("+30")).toBeTruthy();
  });

  it("shows an empty state for a quiet day", async () => {
    setup({ forecast: [] });
    await render(<Home />);

    expect(screen.getByText("No reviews in the next 24 hours.")).toBeTruthy();
  });
});

describe("sync line", () => {
  it("shows sync progress", async () => {
    setup({}, { sync: { phase: "syncing", progress: { resource: "subjects", label: "items", fetched: 4000, total: 9321 } } });
    await render(<Home />);

    expect(screen.getByTestId("sync-status")).toHaveTextContent("Syncing items… 4,000 / 9,321");
  });
});

it("renders before the to-do list has loaded", async () => {
  setup(null);
  await render(<Home />);

  expect(screen.getByTestId("lessons-card")).toBeTruthy();
  expect(screen.getByTestId("next-review")).toHaveTextContent("");
});
