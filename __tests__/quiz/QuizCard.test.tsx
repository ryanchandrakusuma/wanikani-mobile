import { fireEvent, render, screen } from "@testing-library/react-native";
import { QuizCard } from "../../src/quiz/QuizCard";
import type { Subject } from "../../src/subjects/model";

jest.mock("expo-image", () => ({ Image: () => null }));

const big: Subject = {
  id: 1, object: "kanji",
  data: {
    level: 1, slug: "big", characters: "大",
    meanings: [{ meaning: "Large", primary: false, accepted_answer: true }, { meaning: "Big", primary: true, accepted_answer: true }],
    readings: [
      { reading: "だい", primary: true, accepted_answer: true, type: "onyomi" },
      { reading: "おお", primary: false, accepted_answer: false, type: "kunyomi" },
    ],
    meaning_mnemonic: "", lesson_position: 0, spaced_repetition_system_id: 1, hidden_at: null,
  },
};

const meaningInput = () => screen.getByLabelText("Meaning answer");
const readingInput = () => screen.getByLabelText("Reading answer");
const check = () => fireEvent.press(screen.getByRole("button", { name: "Check" }));

describe("meaning question", () => {
  it("shows the prompt and accepts a correct answer", async () => {
    const onDone = jest.fn();
    await render(<QuizCard subject={big} kind="meaning" synonyms={[]} onDone={onDone} />);
    expect(screen.getByText("Kanji Meaning")).toBeTruthy();

    await fireEvent.changeText(meaningInput(), "big");
    await check();

    expect(screen.getByText("Correct")).toBeTruthy();
    expect(onDone).not.toHaveBeenCalled(); // waits for Next
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(onDone).toHaveBeenCalledWith("correct");
  });

  it("shows the accepted answers, primary first, after a wrong answer", async () => {
    const onDone = jest.fn();
    await render(<QuizCard subject={big} kind="meaning" synonyms={[]} onDone={onDone} />);

    await fireEvent.changeText(meaningInput(), "small");
    await check();

    expect(screen.getByText("Not quite")).toBeTruthy();
    expect(screen.getByText("Answer: Big, Large")).toBeTruthy();
    expect(meaningInput().props.editable).toBe(false);
    await fireEvent.press(screen.getByRole("button", { name: "Next" }));
    expect(onDone).toHaveBeenCalledWith("incorrect");
  });

  it("asks again without judging when the input is empty", async () => {
    const onDone = jest.fn();
    await render(<QuizCard subject={big} kind="meaning" synonyms={[]} onDone={onDone} />);

    await check();

    expect(screen.getByText("Type an answer first.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Check" })).toBeTruthy();
  });

  it("accepts the user's synonyms", async () => {
    await render(<QuizCard subject={big} kind="meaning" synonyms={["huge"]} onDone={jest.fn()} />);

    await fireEvent.changeText(meaningInput(), "huge");
    await check();

    expect(screen.getByText("Correct")).toBeTruthy();
  });
});

describe("reading question", () => {
  it("turns romaji into kana while typing", async () => {
    await render(<QuizCard subject={big} kind="reading" synonyms={[]} onDone={jest.fn()} />);

    await fireEvent.changeText(readingInput(), "dai");

    expect(readingInput().props.value).toBe("だい");
    expect(screen.getByText("Kanji Reading")).toBeTruthy();
  });

  it("accepts the taught reading", async () => {
    await render(<QuizCard subject={big} kind="reading" synonyms={[]} onDone={jest.fn()} />);

    await fireEvent.changeText(readingInput(), "dai");
    await check();

    expect(screen.getByText("Correct")).toBeTruthy();
  });

  it("asks for the other reading type without counting it wrong", async () => {
    await render(<QuizCard subject={big} kind="reading" synonyms={[]} onDone={jest.fn()} />);

    await fireEvent.changeText(readingInput(), "oo");
    await check();

    expect(screen.getByText(/looking for the on'yomi/)).toBeTruthy();
    expect(screen.queryByText("Not quite")).toBeNull();
  });

  it("shows the reading after a wrong answer", async () => {
    await render(<QuizCard subject={big} kind="reading" synonyms={[]} onDone={jest.fn()} />);

    await fireEvent.changeText(readingInput(), "shou");
    await check();

    expect(screen.getByText("Answer: だい")).toBeTruthy();
  });
});

describe("item info", () => {
  const { Text } = jest.requireActual("react-native");
  const info = <Text>Mnemonic about a big person</Text>;

  it("can be opened and closed after a wrong answer", async () => {
    await render(<QuizCard subject={big} kind="meaning" synonyms={[]} onDone={jest.fn()} info={info} />);
    await fireEvent.changeText(meaningInput(), "small");
    await check();

    expect(screen.queryByText("Mnemonic about a big person")).toBeNull();
    await fireEvent.press(screen.getByRole("button", { name: "Item info" }));
    expect(screen.getByText("Mnemonic about a big person")).toBeTruthy();
    await fireEvent.press(screen.getByRole("button", { name: "Hide item info" }));
    expect(screen.queryByText("Mnemonic about a big person")).toBeNull();
  });

  it("is offered after a correct answer too, but not before answering", async () => {
    await render(<QuizCard subject={big} kind="meaning" synonyms={[]} onDone={jest.fn()} info={info} />);
    expect(screen.queryByRole("button", { name: "Item info" })).toBeNull();

    await fireEvent.changeText(meaningInput(), "big");
    await check();
    await fireEvent.press(screen.getByRole("button", { name: "Item info" }));
    expect(screen.getByText("Mnemonic about a big person")).toBeTruthy();
  });

  it("is not offered without info (lesson quiz)", async () => {
    await render(<QuizCard subject={big} kind="meaning" synonyms={[]} onDone={jest.fn()} />);
    await fireEvent.changeText(meaningInput(), "small");
    await check();
    expect(screen.queryByRole("button", { name: "Item info" })).toBeNull();
  });
});
