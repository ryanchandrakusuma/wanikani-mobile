import {
  answerQuestion, createQuiz, currentQuestion, isFinished, MIN_REQUEUE_GAP, quizProgress, type QuizState,
} from "../../src/quiz/quizQueue";

const noShuffle = () => 0.999999; // Fisher–Yates keeps order when j === i
const first = () => 0;

describe("createQuiz", () => {
  it("asks meaning for every item and reading only where it applies", () => {
    const quiz = createQuiz([{ id: 1, hasReading: true }, { id: 2, hasReading: false }], noShuffle);

    expect(quiz.queue).toEqual([
      { itemId: 1, kind: "meaning" },
      { itemId: 1, kind: "reading" },
      { itemId: 2, kind: "meaning" },
    ]);
    expect(quiz.total).toBe(3);
  });

  it("shuffles the questions", () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ id: i, hasReading: true }));
    const quiz = createQuiz(items, first);

    expect(quiz.queue).toHaveLength(20);
    expect(quiz.queue).not.toEqual(createQuiz(items, noShuffle).queue);
  });

  it("is finished straight away with no items", () => {
    expect(isFinished(createQuiz([]))).toBe(true);
    expect(currentQuestion(createQuiz([]))).toBeNull();
  });
});

describe("answerQuestion", () => {
  const base = (): QuizState => createQuiz(
    [{ id: 1, hasReading: true }, { id: 2, hasReading: true }, { id: 3, hasReading: false }],
    noShuffle,
  );

  it("removes a correctly answered question", () => {
    const next = answerQuestion(base(), "correct");

    expect(next.queue).toHaveLength(4);
    expect(currentQuestion(next)).toEqual({ itemId: 1, kind: "reading" });
    expect(quizProgress(next)).toEqual({ done: 1, total: 5 });
  });

  it("keeps the same question on a retry", () => {
    const state = base();
    expect(answerQuestion(state, "retry")).toBe(state);
  });

  it("re-asks a wrong answer later, not immediately", () => {
    const next = answerQuestion(base(), "incorrect", first);

    expect(next.queue).toHaveLength(5);
    expect(next.queue.findIndex((q) => q.itemId === 1 && q.kind === "meaning")).toBe(MIN_REQUEUE_GAP);
    expect(currentQuestion(next)).not.toEqual({ itemId: 1, kind: "meaning" });
    expect(next.mistakes).toEqual({ 1: 1 });
  });

  it("can put a wrong answer at the very end", () => {
    const next = answerQuestion(base(), "incorrect", () => 0.999999);

    expect(next.queue.at(-1)).toEqual({ itemId: 1, kind: "meaning" });
  });

  it("asks the last question again when it is the only one left", () => {
    let state = createQuiz([{ id: 9, hasReading: false }]);
    state = answerQuestion(state, "incorrect");

    expect(currentQuestion(state)).toEqual({ itemId: 9, kind: "meaning" });
    expect(state.mistakes).toEqual({ 9: 1 });
  });

  it("finishes only after every question is answered correctly", () => {
    let state = createQuiz([{ id: 1, hasReading: true }], noShuffle);
    state = answerQuestion(state, "incorrect", first); // meaning wrong → back of queue
    state = answerQuestion(state, "correct"); // reading
    expect(isFinished(state)).toBe(false);
    state = answerQuestion(state, "correct"); // meaning again
    expect(isFinished(state)).toBe(true);
    expect(quizProgress(state)).toEqual({ done: 2, total: 2 });
    expect(state.mistakes).toEqual({ 1: 1 });
  });

  it("does nothing once finished", () => {
    const done = createQuiz([]);
    expect(answerQuestion(done, "correct")).toBe(done);
  });
});
