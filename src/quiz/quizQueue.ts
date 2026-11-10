import type { Verdict } from "./answerCheck";

export type QuestionKind = "meaning" | "reading";

export interface Question {
  itemId: number;
  kind: QuestionKind;
}

export interface QuizItem {
  id: number;
  hasReading: boolean;
}

export interface QuizState {
  /** Questions still to answer correctly; the first one is shown. */
  queue: Question[];
  /** Total questions in the quiz (each must be answered correctly once). */
  total: number;
  /** Wrong answers per item, for the summary. */
  mistakes: Record<number, number>;
}

/** A wrong answer comes back at least this many questions later (when possible). */
export const MIN_REQUEUE_GAP = 2;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createQuiz(items: QuizItem[], rng: () => number = Math.random): QuizState {
  const questions: Question[] = items.flatMap((item) => [
    { itemId: item.id, kind: "meaning" as const },
    ...(item.hasReading ? [{ itemId: item.id, kind: "reading" as const }] : []),
  ]);
  return { queue: shuffle(questions, rng), total: questions.length, mistakes: {} };
}

export function currentQuestion(state: QuizState): Question | null {
  return state.queue[0] ?? null;
}

/**
 * correct   → the question is done.
 * incorrect → it comes back later in the quiz (never straight away if other questions remain).
 * retry     → nothing changes; the same question stays on screen.
 */
export function answerQuestion(state: QuizState, verdict: Verdict, rng: () => number = Math.random): QuizState {
  const [current, ...rest] = state.queue;
  if (!current || verdict === "retry") return state;
  if (verdict === "correct") return { ...state, queue: rest };

  const earliest = Math.min(MIN_REQUEUE_GAP, rest.length);
  const at = earliest + Math.floor(rng() * (rest.length - earliest + 1));
  const queue = [...rest.slice(0, at), current, ...rest.slice(at)];
  const mistakes = { ...state.mistakes, [current.itemId]: (state.mistakes[current.itemId] ?? 0) + 1 };
  return { ...state, queue, mistakes };
}

export function isFinished(state: QuizState): boolean {
  return state.queue.length === 0;
}

/** Questions answered correctly so far, out of the total. */
export function quizProgress(state: QuizState): { done: number; total: number } {
  return { done: state.total - state.queue.length, total: state.total };
}
