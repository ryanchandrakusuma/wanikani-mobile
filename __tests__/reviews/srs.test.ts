import { nextReviewTime, nextSrsStage } from "../../src/reviews/srs";

describe("nextSrsStage", () => {
  it("moves up one stage when everything was right", () => {
    expect(nextSrsStage(1, 0, 0)).toBe(2);
    expect(nextSrsStage(4, 0, 0)).toBe(5);
    expect(nextSrsStage(8, 0, 0)).toBe(9);
  });

  it("never goes past burned", () => {
    expect(nextSrsStage(9, 0, 0)).toBe(9);
  });

  it("drops by half the mistakes, rounded up, below Guru", () => {
    expect(nextSrsStage(4, 1, 0)).toBe(3);
    expect(nextSrsStage(4, 1, 1)).toBe(3);
    expect(nextSrsStage(4, 2, 1)).toBe(2);
  });

  it("drops twice as far from Guru up", () => {
    expect(nextSrsStage(5, 1, 0)).toBe(3);
    expect(nextSrsStage(8, 0, 1)).toBe(6);
    expect(nextSrsStage(8, 2, 1)).toBe(4);
  });

  it("never drops below Apprentice 1", () => {
    expect(nextSrsStage(1, 3, 3)).toBe(1);
    expect(nextSrsStage(6, 5, 5)).toBe(1);
  });
});

describe("nextReviewTime", () => {
  it("adds the wait and rounds down to the hour, like WaniKani", () => {
    // WaniKani's example: answered at 3:31 pm, 8 h wait → 11:00 pm
    expect(nextReviewTime(new Date("2026-03-01T15:31:20.500Z"), 8 * 3600).toISOString())
      .toBe("2026-03-01T23:00:00.000Z");
  });
});
