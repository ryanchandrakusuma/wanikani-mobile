import { fireEvent, render, screen } from "@testing-library/react-native";
import { LessonView } from "../../src/lessons/LessonView";
import { lessonPages, pageLabel } from "../../src/lessons/pages";
import type { LessonItem } from "../../src/db/lessons";
import { EMPTY_STUDY, type Subject } from "../../src/subjects/model";

jest.mock("expo-audio", () => ({ useAudioPlayer: () => ({ play: jest.fn(), seekTo: jest.fn().mockResolvedValue(undefined) }) }));
jest.mock("expo-image", () => ({ Image: () => null }));

function subject(object: Subject["object"], data: Partial<Subject["data"]> = {}, id = 1): Subject {
  return {
    id, object,
    data: {
      level: 3, slug: "x", characters: "大", meanings: [{ meaning: "Big", primary: true, accepted_answer: true }],
      meaning_mnemonic: "A <radical>big</radical> person.", lesson_position: 0, spaced_repetition_system_id: 1,
      hidden_at: null, ...data,
    },
  };
}

const kanji = subject("kanji", {
  component_subject_ids: [10],
  meanings: [
    { meaning: "Big", primary: true, accepted_answer: true },
    { meaning: "Large", primary: false, accepted_answer: true },
  ],
  meaning_hint: "Think of something huge.",
  readings: [
    { reading: "だい", primary: true, accepted_answer: true, type: "onyomi" },
    { reading: "おお", primary: false, accepted_answer: false, type: "kunyomi" },
  ],
  reading_mnemonic: "It's <reading>dai</reading>.",
});
const radical = subject("radical", { characters: "一", meanings: [{ meaning: "Ground", primary: true, accepted_answer: true }] }, 10);

const vocab = subject("vocabulary", {
  characters: "大人",
  component_subject_ids: [1],
  meanings: [{ meaning: "Adult", primary: true, accepted_answer: true }],
  parts_of_speech: ["noun"],
  readings: [{ reading: "おとな", primary: true, accepted_answer: true }],
  context_sentences: [{ ja: "大人です。", en: "I'm an adult." }],
  pronunciation_audios: [{ url: "a.mp3", content_type: "audio/mpeg", metadata: {} }],
});

const item = (s: Subject, study = EMPTY_STUDY): LessonItem => ({ assignmentId: s.id, subject: s, study });

describe("lessonPages", () => {
  it.each([
    [radical, ["meaning"]],
    [kanji, ["composition", "meaning", "reading"]],
    [subject("kanji", { component_subject_ids: [] }), ["meaning", "reading"]],
    [vocab, ["composition", "meaning", "reading", "context"]],
    [subject("kana_vocabulary"), ["meaning", "context"]],
  ])("%#", (s, pages) => {
    expect(lessonPages(s)).toEqual(pages);
  });

  it("labels pages by item type", () => {
    expect(pageLabel("meaning", radical)).toBe("Name");
    expect(pageLabel("composition", kanji)).toBe("Radicals");
    expect(pageLabel("composition", vocab)).toBe("Kanji");
    expect(pageLabel("reading", kanji)).toBe("Readings");
  });
});

describe("LessonView", () => {
  it("shows the item with its type and level", async () => {
    await render(<LessonView item={item(kanji)} components={[radical]} page={0} onPageChange={jest.fn()} />);

    expect(screen.getAllByText("大").length).toBeGreaterThan(0);
    expect(screen.getByText("Big")).toBeTruthy();
    expect(screen.getByText("Kanji · Level 3")).toBeTruthy();
  });

  it("lists the radicals on the composition page", async () => {
    await render(<LessonView item={item(kanji)} components={[radical]} page={0} onPageChange={jest.fn()} />);

    expect(screen.getByText("Made of these radicals")).toBeTruthy();
    expect(screen.getByText("Ground")).toBeTruthy();
  });

  it("shows meanings, mnemonic, hint and the user's synonyms on the meaning page", async () => {
    const study = { meaningSynonyms: ["huge"], meaningNote: "My note", readingNote: null };
    await render(<LessonView item={item(kanji, study)} components={[]} page={1} onPageChange={jest.fn()} />);

    expect(screen.getByText("Large")).toBeTruthy();
    expect(screen.getByText("huge")).toBeTruthy();
    expect(screen.getByText("A big person.")).toBeTruthy();
    expect(screen.getByText("Think of something huge.")).toBeTruthy();
    expect(screen.getByText("My note")).toBeTruthy();
  });

  it("marks the kanji reading to learn", async () => {
    await render(<LessonView item={item(kanji)} components={[]} page={2} onPageChange={jest.fn()} />);

    expect(screen.getByText("On'yomi (learn this one)")).toBeTruthy();
    expect(screen.getByText("だい")).toBeTruthy();
    expect(screen.getByText("Kun'yomi")).toBeTruthy();
    expect(screen.getByText("It's dai.")).toBeTruthy();
  });

  it("shows vocabulary reading with audio, and example sentences", async () => {
    const { rerender } = await render(<LessonView item={item(vocab)} components={[]} page={2} onPageChange={jest.fn()} />);
    expect(screen.getByText("おとな")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Play pronunciation" })).toBeTruthy();

    await rerender(<LessonView item={item(vocab)} components={[]} page={3} onPageChange={jest.fn()} />);
    expect(screen.getByText("大人です。")).toBeTruthy();
    expect(screen.getByText("I'm an adult.")).toBeTruthy();
  });

  it("switches pages from the tabs", async () => {
    const onPageChange = jest.fn();
    await render(<LessonView item={item(kanji)} components={[]} page={0} onPageChange={onPageChange} />);

    await fireEvent.press(screen.getByRole("tab", { name: "Readings" }));

    expect(onPageChange).toHaveBeenCalledWith(2);
  });

  it("has no tabs for a radical (single page)", async () => {
    await render(<LessonView item={item(radical)} components={[]} page={0} onPageChange={jest.fn()} />);

    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Radical · Level 3")).toBeTruthy();
  });
});
