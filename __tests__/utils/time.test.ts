import { formatClock, formatIn, formatRelative, startOfLocalDay } from "../../src/utils/time";

describe("startOfLocalDay", () => {
  it("returns local midnight of the same day", () => {
    const d = new Date(2026, 2, 1, 15, 42, 7, 123); // local time
    expect(startOfLocalDay(d)).toEqual(new Date(2026, 2, 1, 0, 0, 0, 0));
  });

  it("does not modify the input", () => {
    const d = new Date(2026, 2, 1, 15, 0);
    startOfLocalDay(d);
    expect(d.getHours()).toBe(15);
  });
});

describe("formatClock", () => {
  it.each([
    [new Date(2026, 2, 1, 9, 5), "09:05"],
    [new Date(2026, 2, 1, 14, 0), "14:00"],
    [new Date(2026, 2, 1, 0, 0), "00:00"],
  ])("%p → %s", (d, expected) => {
    expect(formatClock(d)).toBe(expected);
  });
});

describe("formatIn", () => {
  const now = new Date("2026-03-01T12:00:00.000Z");
  const later = (ms: number) => new Date(now.getTime() + ms);

  it.each([
    [-5_000, "now"],
    [0, "now"],
    [30_000, "in 1 min"],
    [45 * 60_000, "in 45 min"],
    [60 * 60_000, "in 1 h"],
    [23 * 3_600_000 + 59 * 60_000, "in 23 h"],
    [24 * 3_600_000, "in 1 day"],
    [3 * 86_400_000, "in 3 days"],
  ])("%i ms ahead → %s", (ms, expected) => {
    expect(formatIn(later(ms), now)).toBe(expected);
  });
});

const NOW = new Date("2026-03-01T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

describe("formatRelative", () => {
  it.each([
    [0, "just now"],
    [59_000, "just now"],
    [60_000, "1 min ago"],
    [59 * 60_000, "59 min ago"],
    [60 * 60_000, "1 h ago"],
    [23 * 3_600_000, "23 h ago"],
    [24 * 3_600_000, "1 day ago"],
    [3 * 86_400_000, "3 days ago"],
  ])("%i ms ago → %s", (ms, expected) => {
    expect(formatRelative(ago(ms), NOW)).toBe(expected);
  });

  it("treats a time slightly in the future (clock drift) as just now", () => {
    expect(formatRelative(new Date(NOW.getTime() + 5_000).toISOString(), NOW)).toBe("just now");
  });
});
