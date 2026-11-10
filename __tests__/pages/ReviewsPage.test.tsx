import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import Reviews from "../../src/pages/ReviewsPage";
import { getDatabase } from "../../src/db/database";
import { upsert } from "../../src/db/repository";
import { useSync } from "../../src/contexts/SyncContext";
import { assignment, subject } from "../helpers/fixtures";
import { createMigratedTestDb } from "../helpers/testDb";

jest.mock("expo-router", () => ({ router: { back: jest.fn() } }));
jest.mock("expo-crypto", () => ({ randomUUID: () => `uuid-${Math.random()}` }));
jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-audio", () => ({ useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn().mockResolvedValue(undefined) }) }));
jest.mock("react-native-safe-area-context", () => {
  const { View } = jest.requireActual("react-native");
  return { SafeAreaView: View };
});
jest.mock("../../src/db/database", () => ({ getDatabase: jest.fn() }));
jest.mock("../../src/contexts/SyncContext", () => ({ useSync: jest.fn() }));

type TestDb = Awaited<ReturnType<typeof createMigratedTestDb>>;
let db: TestDb;
const mockSync = jest.fn();

/** Radicals are asked meaning only, so one answer finishes an item. */
const RADICALS: Record<string, string> = { "一": "ground", "丨": "stick", "口": "mouth" };

async function addDueRadical(id: number, characters: string, stage = 3) {
  const meaning = RADICALS[characters];
  await upsert.subjects(db, [{
    ...subject(id, { characters, meanings: [{ meaning, primary: true, accepted_answer: true }], meaning_mnemonic: `Remember ${meaning}.` }),
    object: "radical",
  }]);
  await upsert.assignments(db, [assignment(id, { srs_stage: stage, available_at: "2026-01-01T00:00:00.000000Z" })]);
}

beforeEach(async () => {
  db = await createMigratedTestDb();
  jest.mocked(getDatabase).mockResolvedValue(db);
  mockSync.mockReset().mockResolvedValue(undefined);
  jest.mocked(useSync).mockReturnValue({ sync: mockSync } as unknown as ReturnType<typeof useSync>);
  jest.mocked(router.back).mockReset();
});

const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

/** The answer for whichever radical is on screen. */
function askedAnswer() {
  const glyph = screen.getByTestId("subject-glyph").props.accessibilityLabel as string;
  return RADICALS[glyph];
}

async function answer(text: string) {
  await fireEvent.changeText(screen.getByLabelText("Meaning answer"), text);
  await press("Check");
  await press("Next");
}

const stages = () => db.getAllAsync<{ id: number; srs_stage: number }>("SELECT id, srs_stage FROM assignments ORDER BY id", []);

it("says when there are no reviews", async () => {
  await render(<Reviews />);

  expect(await screen.findByText("No reviews waiting")).toBeTruthy();
  await press("Back to home");
  expect(router.back).toHaveBeenCalled();
});

it("reviews every due item, saves each one, and sends the results", async () => {
  await addDueRadical(1, "一");
  await addDueRadical(2, "丨");
  await render(<Reviews />);

  expect(await screen.findByText("0 done · 2 left")).toBeTruthy();
  await answer(askedAnswer());
  expect(screen.getByText("1 done · 1 left")).toBeTruthy();
  expect(screen.getByText("100%")).toBeTruthy();
  await answer(askedAnswer());

  expect(await screen.findByText("2 items reviewed")).toBeTruthy();
  expect(screen.getByText("100% correct")).toBeTruthy();
  expect(screen.getByText("Correct (2)")).toBeTruthy();
  expect(await stages()).toEqual([{ id: 1, srs_stage: 4 }, { id: 2, srs_stage: 4 }]);
  expect(await db.getFirstAsync("SELECT COUNT(*) AS n FROM outbox WHERE kind = 'review'", [])).toEqual({ n: 2 });
  expect(mockSync).toHaveBeenCalledTimes(1);
});

it("asks a wrong answer again, offers item info, and lowers the stage", async () => {
  await addDueRadical(1, "一");
  await render(<Reviews />);
  await screen.findByText("0 done · 1 left");

  await fireEvent.changeText(screen.getByLabelText("Meaning answer"), "banana");
  await press("Check");
  expect(screen.getByText("Answer: ground")).toBeTruthy();
  await press("Item info");
  expect(screen.getByText("Remember ground.")).toBeTruthy();
  await press("Next");

  expect(screen.getByText("0 done · 1 left")).toBeTruthy();
  await answer("ground");

  expect(await screen.findByText("1 item reviewed")).toBeTruthy();
  expect(screen.getByText("0% correct")).toBeTruthy();
  expect(screen.getByText("Answered wrong (1)")).toBeTruthy();
  expect(await stages()).toEqual([{ id: 1, srs_stage: 2 }]);
});

it("wraps up: finishes only the item on screen, then offers the rest", async () => {
  await addDueRadical(1, "一");
  await addDueRadical(2, "丨");
  await addDueRadical(3, "口");
  await render(<Reviews />);
  await screen.findByText("0 done · 3 left");

  await press("Wrap up");
  expect(screen.getByText("0 done · 1 left")).toBeTruthy();
  expect(screen.getByText("Wrapping up: finishing the 1 item you started.")).toBeTruthy();
  await answer(askedAnswer());

  expect(await screen.findByText("1 item reviewed")).toBeTruthy();
  await press("Keep reviewing (2 waiting)");
  expect(await screen.findByText("0 done · 2 left")).toBeTruthy();
});

it("asks before leaving mid-session, keeping finished items and sending them", async () => {
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await addDueRadical(1, "一");
  await addDueRadical(2, "丨");
  await render(<Reviews />);
  await screen.findByText("0 done · 2 left");
  await answer(askedAnswer());

  await press("Close reviews");
  expect(alert).toHaveBeenCalledWith("Leave reviews?", expect.any(String), expect.any(Array));
  const leave = alert.mock.calls[0][2]!.find((b) => b.text === "Leave")!;
  leave.onPress!();

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(mockSync).toHaveBeenCalledTimes(1);
  expect((await stages()).filter((s) => s.srs_stage === 4)).toHaveLength(1);
  alert.mockRestore();
});

it("closes without asking when nothing is in progress", async () => {
  await render(<Reviews />);
  await screen.findByText("No reviews waiting");

  await press("Close reviews");

  await waitFor(() => expect(router.back).toHaveBeenCalled());
  expect(mockSync).not.toHaveBeenCalled();
});
