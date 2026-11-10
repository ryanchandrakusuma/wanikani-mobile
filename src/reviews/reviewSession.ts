import type { Verdict } from "../quiz/answerCheck";
import type { Question, QuestionKind, QuizItem } from "../quiz/quizQueue";

/** Items "in play" at once, like WaniKani. New ones come in as these are finished. */
export const ACTIVE_ITEMS = 10;

interface ActiveItem {
  id: number;
  hasReading: boolean;
  /** Questions still to answer correctly. */
  pending: QuestionKind[];
  meaningIncorrect: number;
  readingIncorrect: number;
}

/** An item with both questions answered correctly, ready to be saved. */
export interface FinishedReview {
  id: number;
  meaningIncorrect: number;
  readingIncorrect: number;
}

export interface ReviewSession {
  /** Items not started yet, in random order. */
  backlog: QuizItem[];
  active: ActiveItem[];
  current: Question | null;
  wrappingUp: boolean;
  finished: FinishedReview[];
  activeSize: number;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const toActive = (item: QuizItem): ActiveItem => ({
  id: item.id,
  hasReading: item.hasReading,
  pending: item.hasReading ? ["meaning", "reading"] : ["meaning"],
  meaningIncorrect: 0,
  readingIncorrect: 0,
});

function refill(backlog: QuizItem[], active: ActiveItem[], size: number) {
  const take = Math.max(0, size - active.length);
  return { backlog: backlog.slice(take), active: [...active, ...backlog.slice(0, take).map(toActive)] };
}

/**
 * Any open question from the items in play, at random. A different item than
 * the one just asked is preferred, so an item's meaning and reading are rarely back to back.
 */
function pick(active: ActiveItem[], previous: Question | null, rng: () => number): Question | null {
  const all = active.flatMap((a) => a.pending.map((kind) => ({ itemId: a.id, kind })));
  if (all.length === 0) return null;
  const others = previous ? all.filter((q) => q.itemId !== previous.itemId) : all;
  const pool = others.length ? others : all;
  return pool[Math.floor(rng() * pool.length)];
}

export function createReviewSession(
  items: QuizItem[], rng: () => number = Math.random, activeSize = ACTIVE_ITEMS,
): ReviewSession {
  const { backlog, active } = refill(shuffle(items, rng), [], activeSize);
  return { backlog, active, current: pick(active, null, rng), wrappingUp: false, finished: [], activeSize };
}

/**
 * correct   → that question is done; if it was the item's last, the item is finished
 *             (returned so it can be saved) and a new one comes into play.
 * incorrect → the mistake is counted and the question is asked again later.
 * retry     → nothing changes.
 */
export function answerReview(
  state: ReviewSession, verdict: Verdict, rng: () => number = Math.random,
): { state: ReviewSession; finished: FinishedReview | null } {
  const q = state.current;
  if (!q || verdict === "retry") return { state, finished: null };

  let finished: FinishedReview | null = null;
  let active = state.active.flatMap((a): ActiveItem[] => {
    if (a.id !== q.itemId) return [a];
    if (verdict === "incorrect") {
      return [q.kind === "meaning"
        ? { ...a, meaningIncorrect: a.meaningIncorrect + 1 }
        : { ...a, readingIncorrect: a.readingIncorrect + 1 }];
    }
    const pending = a.pending.filter((k) => k !== q.kind);
    if (pending.length) return [{ ...a, pending }];
    finished = { id: a.id, meaningIncorrect: a.meaningIncorrect, readingIncorrect: a.readingIncorrect };
    return [];
  });

  let backlog = state.backlog;
  if (!state.wrappingUp) ({ backlog, active } = refill(backlog, active, state.activeSize));

  return {
    state: {
      ...state,
      backlog,
      active,
      current: pick(active, q, rng),
      finished: finished ? [...state.finished, finished] : state.finished,
    },
    finished,
  };
}

/** Asked at least once, or on screen right now. */
const isStarted = (a: ActiveItem, current: Question | null) =>
  a.id === current?.itemId ||
  a.meaningIncorrect + a.readingIncorrect > 0 ||
  a.pending.length < (a.hasReading ? 2 : 1);

/**
 * Stops bringing in new items. Items in play that haven't been asked yet go
 * back to the backlog; the ones already started are finished first.
 */
export function wrapUp(state: ReviewSession): ReviewSession {
  const keep = state.active.filter((a) => isStarted(a, state.current));
  const back = state.active.filter((a) => !isStarted(a, state.current)).map(({ id, hasReading }) => ({ id, hasReading }));
  return { ...state, wrappingUp: true, active: keep, backlog: [...back, ...state.backlog] };
}

export function isSessionOver(state: ReviewSession): boolean {
  return state.current === null;
}

export interface ReviewProgress {
  /** Items finished this session. */
  done: number;
  /** Items still to do (all of them, or only the ones in play while wrapping up). */
  left: number;
  /** Finished items answered without any mistake. */
  correct: number;
}

export function reviewProgress(state: ReviewSession): ReviewProgress {
  return {
    done: state.finished.length,
    left: state.active.length + (state.wrappingUp ? 0 : state.backlog.length),
    correct: state.finished.filter((f) => f.meaningIncorrect + f.readingIncorrect === 0).length,
  };
}
