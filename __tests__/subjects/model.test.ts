import {
  hasReading, primaryMeaning, primaryReading, pronunciationUrl, radicalImageUrl, type Subject,
} from "../../src/subjects/model";

function make(object: Subject["object"], data: Partial<Subject["data"]> = {}): Subject {
  return {
    id: 1,
    object,
    data: {
      level: 1, slug: "x", characters: "大", meanings: [], meaning_mnemonic: "", lesson_position: 0,
      spaced_repetition_system_id: 1, hidden_at: null, ...data,
    },
  };
}

describe("primaryMeaning", () => {
  it("picks the primary meaning", () => {
    const s = make("kanji", {
      meanings: [{ meaning: "Large", primary: false, accepted_answer: true }, { meaning: "Big", primary: true, accepted_answer: true }],
    });
    expect(primaryMeaning(s)).toBe("Big");
  });

  it("falls back to the first meaning, then the slug", () => {
    expect(primaryMeaning(make("kanji", { meanings: [{ meaning: "One", primary: false, accepted_answer: true }] }))).toBe("One");
    expect(primaryMeaning(make("radical", { slug: "ground" }))).toBe("ground");
  });
});

describe("primaryReading", () => {
  it("picks the primary reading or null", () => {
    const s = make("kanji", {
      readings: [{ reading: "だい", primary: true, accepted_answer: true, type: "onyomi" }, { reading: "おお", primary: false, accepted_answer: false, type: "kunyomi" }],
    });
    expect(primaryReading(s)).toBe("だい");
    expect(primaryReading(make("radical"))).toBeNull();
  });
});

describe("hasReading", () => {
  const readings = [{ reading: "だい", primary: true, accepted_answer: true }];
  it.each([
    ["radical", false],
    ["kanji", true],
    ["vocabulary", true],
    ["kana_vocabulary", false],
  ] as const)("%s → %s", (object, expected) => {
    expect(hasReading(make(object, { readings }))).toBe(expected);
  });
});

describe("radicalImageUrl", () => {
  it("is null when the radical has characters", () => {
    expect(radicalImageUrl(make("radical", { characters: "一" }))).toBeNull();
  });

  it("prefers PNG over SVG", () => {
    const s = make("radical", {
      characters: null,
      character_images: [
        { url: "a.svg", content_type: "image/svg+xml", metadata: {} },
        { url: "a.png", content_type: "image/png", metadata: {} },
      ],
    });
    expect(radicalImageUrl(s)).toBe("a.png");
  });
});

describe("pronunciationUrl", () => {
  it("prefers MP3", () => {
    const s = make("vocabulary", {
      pronunciation_audios: [
        { url: "a.ogg", content_type: "audio/ogg", metadata: {} },
        { url: "a.mp3", content_type: "audio/mpeg", metadata: {} },
      ],
    });
    expect(pronunciationUrl(s)).toBe("a.mp3");
    expect(pronunciationUrl(make("kanji"))).toBeNull();
  });
});
