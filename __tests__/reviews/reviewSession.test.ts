import {
  ACTIVE_ITEMS, answerReview, createReviewSession, isSessionOver, reviewProgress, wrapUp, type ReviewSession,
} from "../../src/reviews/reviewSession";
import type { Verdict } from "../../src/quiz/answerCheck";

const items = (n: number, hasReading = true) => Array.from({ length: n }, (_, i) => ({ id: i + 1, hasReading }));

/** Answers whatever is asked with `verdict(question)` until the session ends. */
function runAll(state: ReviewSession, verdict: (q: NonNullable<ReviewSession["current"]>, n: number) => Verdict) {
  const asked: NonNullable<ReviewSession["current"]>[] = [];
  for (let n = 0; !isSessionOver(state) && n < 1000; n++) {
    asked.push(state.current!);
    state = answerReview(state, verdict(state.current!, n)).state;
  }
  return { state, asked };
}

it("asks meaning and reading for each item, and only meaning for radicals", () => {
  const session = createReviewSession([{ id: 1, hasReading: true }, { id: 2, hasReading: false }]);
  const { asked, state } = runAll(session, () => "correct");

  expect(asked).toHaveLength(3);
  expect(asked.filter((q) => q.itemId === 1).map((q) => q.kind).sort()).toEqual(["meaning", "reading"]);
  expect(asked.filter((q) => q.itemId === 2).map((q) => q.kind)).toEqual(["meaning"]);
  expect(reviewProgress(state)).toEqual({ done: 2, left: 0, correct: 2 });
});

it("keeps at most 10 items in play and brings new ones in as items finish", () => {
  let state = createReviewSession(items(15));
  expect(state.active).toHaveLength(ACTIVE_ITEMS);
  expect(state.backlog).toHaveLength(5);

  while (state.finished.length === 0) state = answerReview(state, "correct").state;

  expect(state.active).toHaveLength(ACTIVE_ITEMS);
  expect(state.backlog).toHaveLength(4);
});

it("returns an item when both its questions are right, with its mistakes counted", () => {
  let state = createReviewSession([{ id: 7, hasReading: true }]);
  const results = [];
  for (const verdict of ["incorrect", "incorrect", "correct", "incorrect", "correct"] as Verdict[]) {
    const r = answerReview(state, verdict);
    state = r.state;
    results.push({ finished: r.finished });
  }

  const last = results.at(-1)!.finished;
  expect(last).not.toBeNull();
  expect(last!.id).toBe(7);
  expect(last!.meaningIncorrect + last!.readingIncorrect).toBe(3);
  expect(results.slice(0, 4).every((r) => r.finished === null)).toBe(true);
  expect(isSessionOver(state)).toBe(true);
  expect(reviewProgress(state)).toEqual({ done: 1, left: 0, correct: 0 });
});

it("asks a wrong answer again later", () => {
  const { asked } = runAll(createReviewSession([{ id: 1, hasReading: false }]), (_q, n) => (n === 0 ? "incorrect" : "correct"));
  expect(asked).toEqual([{ itemId: 1, kind: "meaning" }, { itemId: 1, kind: "meaning" }]);
});

it("ignores a retry", () => {
  const state = createReviewSession(items(3));
  expect(answerReview(state, "retry")).toEqual({ state, finished: null });
});

it("prefers a different item next, so meaning and reading of one item aren't back to back", () => {
  const { asked } = runAll(createReviewSession(items(5)), () => "correct");
  const backToBack = asked.filter((q, i) => i > 0 && asked[i - 1].itemId === q.itemId);
  // only possible once a single item is left
  expect(backToBack.length).toBeLessThanOrEqual(1);
});

it("is random: a different seed gives a different order", () => {
  const seeded = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const a = runAll(createReviewSession(items(8), seeded(1)), () => "correct").asked;
  let s = createReviewSession(items(8), seeded(99));
  const b: typeof a = [];
  const rng = seeded(5);
  while (!isSessionOver(s)) { b.push(s.current!); s = answerReview(s, "correct", rng).state; }
  expect(b).not.toEqual(a);
});

describe("wrap up", () => {
  it("finishes the items already started, then ends", () => {
    let state = createReviewSession(items(20));
    const first = state.current!.itemId;
    state = answerReview(state, "correct").state; // `first` is now half done
    const second = state.current!.itemId; // on screen

    state = wrapUp(state);

    expect(state.active.map((a) => a.id).sort()).toEqual([first, second].sort());
    expect(state.backlog).toHaveLength(18);
    expect(reviewProgress(state).left).toBe(2);

    const { state: end } = runAll(state, () => "correct");
    expect(end.finished.map((f) => f.id).sort()).toEqual([first, second].sort());
    expect(isSessionOver(end)).toBe(true);
  });

  it("keeps an item that was answered wrong", () => {
    let state = createReviewSession(items(5));
    const wrong = state.current!.itemId;
    state = answerReview(state, "incorrect").state;
    state = wrapUp(state);
    expect(state.active.map((a) => a.id)).toContain(wrong);
  });
});
