import { Alert } from "react-native";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { router } from "expo-router";
import Lessons from "../../src/app/lessons";
import { getDatabase } from "../../src/db/database";
import { toWkTime } from "../../src/db/queries";
import { upsert } from "../../src/db/repository";
import { useSettings } from "../../src/settings/SettingsContext";
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
jest.mock("../../src/settings/SettingsContext", () => ({ useSettings: jest.fn() }));
jest.mock("../../src/contexts/SyncContext", () => ({ useSync: jest.fn() }));

type TestDb = Awaited<ReturnType<typeof createMigratedTestDb>>;
let db: TestDb;
const mockSync = jest.fn();
const unlocked = { srs_stage: 0, started_at: null, available_at: null, unlocked_at: "2026-02-01T00:00:00.000000Z" };

/** A one-page lesson: a radical ("Ground"), quizzed on meaning only. */
async function addRadical(id: number, meaning = "Ground", characters = "一") {
  await upsert.subjects(db, [{
    ...subject(id, { characters, lesson_position: id, meanings: [{ meaning, primary: true, accepted_answer: true }] }),
    object: "radical",
  }]);
  await upsert.assignments(db, [assignment(id, unlocked)]);
}

function setLimit(limit: number) {
  jest.mocked(useSettings).mockReturnValue({ dailyLessonLimit: limit, setDailyLessonLimit: jest.fn() });
}

beforeEach(async () => {
  db = await createMigratedTestDb();
  jest.mocked(getDatabase).mockResolvedValue(db);
  setLimit(15);
  mockSync.mockReset().mockResolvedValue(undefined);
  jest.mocked(useSync).mockReturnValue({ sync: mockSync } as unknown as ReturnType<typeof useSync>);
  jest.mocked(router.back).mockReset();
});

const press = (name: string) => fireEvent.press(screen.getByRole("button", { name }));

async function answer(text: string) {
  await fireEvent.changeText(screen.getByLabelText("Meaning answer"), text);
  await press("Check");
  await press("Next");
}

it("says when there are no lessons", async () => {
  await render(<Lessons />);

  expect(await screen.findByText("No lessons waiting")).toBeTruthy();
  await press("Back to home");
  expect(router.back).toHaveBeenCalled();
});

it("learns a batch, passes the quiz, and saves it", async () => {
  await addRadical(1, "Ground", "一");
  await addRadical(2, "Stick", "丨");
  await render(<Lessons />);

  expect(await screen.findByText("Lesson 1 of 2")).toBeTruthy();
  expect(screen.getByText("Ground")).toBeTruthy();
  await press("Next");
  expect(screen.getByText("Lesson 2 of 2")).toBeTruthy();
  await press("Start quiz");
  expect(screen.getByText("Quiz 0 / 2")).toBeTruthy();

  // Answer whichever item is asked (the quiz shows only the character)
  for (let i = 0; i < 2; i++) {
    const asked = screen.queryAllByText("一").length ? "ground" : "stick";
    await answer(asked);
  }

  expect(await screen.findByText("2 new items learned")).toBeTruthy();
  const rows = await db.getAllAsync<{ srs_stage: number }>("SELECT srs_stage FROM assignments ORDER BY id", []);
  expect(rows).toEqual([{ srs_stage: 1 }, { srs_stage: 1 }]);
  expect(await db.getFirstAsync("SELECT COUNT(*) AS n FROM outbox", [])).toEqual({ n: 2 });
  expect(mockSync).toHaveBeenCalledTimes(1);
});

it("asks a wrong answer again before finishing", async () => {
  await addRadical(1, "Ground");
  await render(<Lessons />);
  await screen.findByText("Lesson 1 of 1");
  await press("Start quiz");

  await answer("banana");
  expect(screen.getByText("Quiz 0 / 1")).toBeTruthy(); // still to do
  await answer("ground");

  expect(await screen.findByText("1 new item learned")).toBeTruthy();
});

it("caps the batch at what's left of the daily limit", async () => {
  setLimit(15);
  for (let i = 1; i <= 8; i++) await addRadical(i);
  // 12 lessons already done today → 3 left
  for (let i = 100; i < 112; i++) {
    await upsert.subjects(db, [subject(i)]);
    await upsert.assignments(db, [assignment(i, { srs_stage: 1, started_at: toWkTime(new Date()) })]);
  }
  await render(<Lessons />);

  expect(await screen.findByText("Lesson 1 of 3")).toBeTruthy();
});

it("shows the limit screen and lets the user do more anyway", async () => {
  setLimit(5);
  await addRadical(1);
  for (let i = 100; i < 105; i++) {
    await upsert.subjects(db, [subject(i)]);
    await upsert.assignments(db, [assignment(i, { srs_stage: 1, started_at: toWkTime(new Date()) })]);
  }
  await render(<Lessons />);

  expect(await screen.findByText("Daily limit reached")).toBeTruthy();
  expect(screen.getByText(/1 more are waiting/)).toBeTruthy();
  await press("Do more anyway");

  expect(await screen.findByText("Lesson 1 of 1")).toBeTruthy();
});

it("asks before leaving an unfinished batch", async () => {
  await addRadical(1);
  const alert = jest.spyOn(Alert, "alert").mockImplementation(() => {});
  await render(<Lessons />);
  await screen.findByText("Lesson 1 of 1");

  await press("Close lessons");

  expect(alert).toHaveBeenCalledWith("Leave lessons?", expect.any(String), expect.any(Array));
  expect(router.back).not.toHaveBeenCalled();
  alert.mock.calls[0][2]!.find((b) => b.text === "Leave")!.onPress!();
  expect(router.back).toHaveBeenCalled();
  // Nothing was saved
  expect(await db.getFirstAsync("SELECT COUNT(*) AS n FROM outbox", [])).toEqual({ n: 0 });
});

it("moves through a kanji's pages with Next and Back", async () => {
  await upsert.subjects(db, [subject(1, {
    characters: "大", lesson_position: 1,
    meanings: [{ meaning: "Big", primary: true, accepted_answer: true }],
    readings: [{ reading: "だい", primary: true, accepted_answer: true, type: "onyomi" }],
  })]);
  await upsert.assignments(db, [assignment(1, unlocked)]);
  await render(<Lessons />);
  await screen.findByText("Lesson 1 of 1");

  expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
  await press("Next"); // Meaning → Readings
  expect(screen.getByRole("tab", { name: "Readings" }).props.accessibilityState.selected).toBe(true);
  await press("Back");
  expect(screen.getByRole("tab", { name: "Meaning" }).props.accessibilityState.selected).toBe(true);
  await press("Next");
  await press("Start quiz");
  expect(screen.getByText("Quiz 0 / 2")).toBeTruthy(); // meaning + reading
});
