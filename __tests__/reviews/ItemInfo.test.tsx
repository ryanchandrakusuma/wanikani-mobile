import { render, screen } from "@testing-library/react-native";
import { ItemInfo } from "../../src/reviews/ItemInfo";
import { EMPTY_STUDY, type Subject } from "../../src/subjects/model";

jest.mock("expo-image", () => ({ Image: () => null }));
jest.mock("expo-audio", () => ({ useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn() }) }));

const big: Subject = {
  id: 1, object: "kanji",
  data: {
    level: 3, slug: "big", characters: "大",
    meanings: [{ meaning: "Big", primary: true, accepted_answer: true }],
    readings: [{ reading: "だい", primary: true, accepted_answer: true, type: "onyomi" }],
    meaning_mnemonic: "A big person.", reading_mnemonic: "Dye it.",
    component_subject_ids: [9],
    lesson_position: 0, spaced_repetition_system_id: 1, hidden_at: null,
  },
};

it("shows meaning and reading details, without the composition tab", async () => {
  await render(<ItemInfo item={{ assignmentId: 1, subject: big, study: { ...EMPTY_STUDY, meaningNote: "my note" } }} />);

  expect(screen.getByText("Big")).toBeTruthy();
  expect(screen.getByText("Kanji · Level 3")).toBeTruthy();
  expect(screen.getByText("A big person.")).toBeTruthy();
  expect(screen.getByText("だい")).toBeTruthy();
  expect(screen.getByText("Dye it.")).toBeTruthy();
  expect(screen.getByText("my note")).toBeTruthy();
  expect(screen.queryByText("Made of these radicals")).toBeNull();
});
