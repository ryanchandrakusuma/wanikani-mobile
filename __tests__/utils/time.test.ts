import { formatRelative } from "../../src/utils/time";

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
