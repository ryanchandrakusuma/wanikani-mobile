import {
  checkMeaning, checkReading, levenshtein, normalizeMeaning, normalizeReading, typoTolerance,
} from "../../src/quiz/answerCheck";
import type { Subject } from "../../src/subjects/model";

function subject(object: Subject["object"], data: Partial<Subject["data"]>): Subject {
  return {
    id: 1, object,
    data: {
      level: 1, slug: "x", characters: "大", meanings: [], meaning_mnemonic: "", lesson_position: 0,
      spaced_repetition_system_id: 1, hidden_at: null, ...data,
    },
  };
}

const big = subject("kanji", {
  meanings: [
    { meaning: "Big", primary: true, accepted_answer: true },
    { meaning: "Large", primary: false, accepted_answer: true },
  ],
  auxiliary_meanings: [
    { meaning: "Huge", type: "whitelist" },
    { meaning: "Dog", type: "blacklist" }, // 犬 looks like 大
    { meaning: "Barge", type: "blacklist" }, // 1 typo away from "Large"
  ],
  readings: [
    { reading: "たい", primary: false, accepted_answer: true, type: "onyomi" },
    { reading: "だい", primary: true, accepted_answer: true, type: "onyomi" },
    { reading: "おお", primary: false, accepted_answer: false, type: "kunyomi" },
  ],
});

const vocab = subject("vocabulary", {
  characters: "大人",
  meanings: [{ meaning: "Adult", primary: true, accepted_answer: true }, { meaning: "Grown Up", primary: false, accepted_answer: true }],
  readings: [{ reading: "おとな", primary: true, accepted_answer: true }],
});

describe("helpers", () => {
  it("normalizes meanings", () => {
    expect(normalizeMeaning("  Grown-Up!! ")).toBe("grown up");
    expect(normalizeMeaning("one's   own")).toBe("ones own");
  });

  it.each([
    ["kitten", "sitting", 3],
    ["", "abc", 3],
    ["same", "same", 0],
  ])("levenshtein(%s, %s) = %i", (a, b, d) => {
    expect(levenshtein(a, b)).toBe(d);
  });

  it.each([[3, 0], [4, 1], [5, 1], [6, 2], [7, 2], [8, 3], [14, 4]])("tolerance for length %i is %i", (len, tol) => {
    expect(typoTolerance(len)).toBe(tol);
  });

  it("normalizes readings", () => {
    expect(normalizeReading("だいn")).toBe("だいん");
    expect(normalizeReading("ダイ")).toBe("だい");
    expect(normalizeReading("dai")).toBe("だい");
    expect(normalizeReading(" お と な ")).toBe("おとな");
  });
});

describe("checkMeaning", () => {
  it.each(["Big", "big", " BIG ", "large", "huge"])("accepts %p", (input) => {
    expect(checkMeaning(input, big).verdict).toBe("correct");
  });

  it("ignores hyphens and punctuation", () => {
    expect(checkMeaning("grown-up", vocab).verdict).toBe("correct");
  });

  it("forgives small typos and says so", () => {
    const result = checkMeaning("adlt", vocab);
    expect(result).toEqual({ verdict: "correct", message: "Close enough. Check the spelling." });
  });

  it("does not forgive typos on very short answers", () => {
    expect(checkMeaning("bog", big).verdict).toBe("incorrect");
  });

  it("rejects blocklisted words even when they are within typo distance", () => {
    expect(checkMeaning("barge", big).verdict).toBe("incorrect");
    expect(checkMeaning("dog", big).verdict).toBe("incorrect");
  });

  it("accepts the user's own synonyms", () => {
    expect(checkMeaning("enormous", big, ["Enormous"]).verdict).toBe("correct");
    expect(checkMeaning("enormous", big).verdict).toBe("incorrect");
  });

  it("asks again for empty input", () => {
    expect(checkMeaning("   ", big).verdict).toBe("retry");
  });

  it("asks again when a reading was typed instead of a meaning", () => {
    expect(checkMeaning("だい", big)).toMatchObject({ verdict: "retry", message: expect.stringContaining("meaning") });
  });

  it("marks a wrong answer incorrect", () => {
    expect(checkMeaning("small", big).verdict).toBe("incorrect");
  });
});

describe("checkReading", () => {
  it.each(["だい", "たい", "ダイ", "dai"])("accepts %p", (input) => {
    expect(checkReading(input, big).verdict).toBe("correct");
  });

  it("accepts a trailing romaji n", () => {
    const san = subject("kanji", { readings: [{ reading: "さん", primary: true, accepted_answer: true, type: "onyomi" }] });
    expect(checkReading("さn", san).verdict).toBe("correct");
  });

  it("asks for the taught reading when another valid kanji reading is typed", () => {
    expect(checkReading("おお", big)).toEqual({
      verdict: "retry",
      message: "That's a valid reading, but we're looking for the on'yomi.",
    });
  });

  it("marks a wrong reading incorrect", () => {
    expect(checkReading("しょう", big).verdict).toBe("incorrect");
    expect(checkReading("おとこ", vocab).verdict).toBe("incorrect");
  });

  it("asks again for empty or non-kana input", () => {
    expect(checkReading("", big).verdict).toBe("retry");
    expect(checkReading("big", big)).toMatchObject({ verdict: "retry", message: "Type the reading in kana." });
  });

  it("accepts vocabulary readings", () => {
    expect(checkReading("otona", vocab).verdict).toBe("correct");
  });
});
