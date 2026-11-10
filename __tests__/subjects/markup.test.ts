import { parseMarkup, stripMarkup } from "../../src/subjects/markup";

describe("parseMarkup", () => {
  it("returns nothing for empty input", () => {
    expect(parseMarkup(null)).toEqual([]);
    expect(parseMarkup("")).toEqual([]);
  });

  it("keeps plain text as one segment", () => {
    expect(parseMarkup("Just text.")).toEqual([{ text: "Just text.", tag: null }]);
  });

  it("splits tagged parts", () => {
    expect(parseMarkup("The <radical>ground</radical> is <reading>big</reading>.")).toEqual([
      { text: "The ", tag: null },
      { text: "ground", tag: "radical" },
      { text: " is ", tag: null },
      { text: "big", tag: "reading" },
      { text: ".", tag: null },
    ]);
  });

  it("handles every WaniKani tag", () => {
    const tags = ["radical", "kanji", "vocabulary", "reading", "ja", "meaning"];
    const input = tags.map((t) => `<${t}>${t}</${t}>`).join(" ");
    expect(parseMarkup(input).filter((s) => s.tag).map((s) => s.tag)).toEqual(tags);
  });

  it("uses the innermost tag when nested", () => {
    expect(parseMarkup("<kanji>大<reading>だい</reading></kanji>")).toEqual([
      { text: "大", tag: "kanji" },
      { text: "だい", tag: "reading" },
    ]);
  });

  it("drops unknown tags but keeps their text", () => {
    expect(parseMarkup("A <b>bold</b> idea")).toEqual([{ text: "A bold idea", tag: null }]);
  });

  it("tolerates a missing closing tag", () => {
    expect(parseMarkup("<kanji>大 forever")).toEqual([{ text: "大 forever", tag: "kanji" }]);
  });

  it("ignores attributes and case in tags", () => {
    expect(parseMarkup('<KANJI class="x">大</KANJI>')).toEqual([{ text: "大", tag: "kanji" }]);
  });
});

describe("stripMarkup", () => {
  it("removes all tags", () => {
    expect(stripMarkup("The <radical>ground</radical> is <reading>big</reading>.")).toBe("The ground is big.");
  });
});
