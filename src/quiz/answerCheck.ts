import { isKana, isJapanese, toHiragana, toKana } from "wanakana";
import type { Subject } from "../subjects/model";

export type Verdict = "correct" | "incorrect" | "retry";

export interface CheckResult {
  verdict: Verdict;
  /** Shown to the user, e.g. why a retry was requested or that a typo was forgiven. */
  message?: string;
}

// ---------------------------------------------------------------------------
// Meaning
// ---------------------------------------------------------------------------

export function normalizeMeaning(s: string): string {
  return s
    .toLowerCase()
    .replace(/[.,'"!?()]/g, "")
    .replace(/[\s-]+/g, " ")
    .trim();
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

/** How many typos are forgiven for an answer of this length (WaniKani-style leniency). */
export function typoTolerance(length: number): number {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  if (length <= 7) return 2;
  return 2 + Math.floor(length / 7);
}

export function checkMeaning(input: string, subject: Subject, synonyms: string[] = []): CheckResult {
  const answer = normalizeMeaning(input);
  if (!answer) return { verdict: "retry", message: "Type an answer first." };
  if (isJapanese(input.replace(/\s/g, ""))) {
    return { verdict: "retry", message: "That looks like a reading. We want the meaning." };
  }

  const aux = subject.data.auxiliary_meanings ?? [];
  const blocked = aux.filter((m) => m.type === "blacklist").map((m) => normalizeMeaning(m.meaning));
  if (blocked.includes(answer)) return { verdict: "incorrect" };

  const accepted = [
    ...subject.data.meanings.filter((m) => m.accepted_answer).map((m) => m.meaning),
    ...aux.filter((m) => m.type === "whitelist").map((m) => m.meaning),
    ...synonyms,
  ].map(normalizeMeaning);

  if (accepted.includes(answer)) return { verdict: "correct" };

  const close = accepted.some((m) => levenshtein(answer, m) <= typoTolerance(m.length));
  if (close) return { verdict: "correct", message: "Close enough. Check the spelling." };

  return { verdict: "incorrect" };
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Final conversion of what was typed: romaji leftovers (a trailing "n") → kana, katakana → hiragana. */
export function normalizeReading(s: string): string {
  return toHiragana(toKana(s.replace(/\s/g, "")));
}

const READING_NAME = { onyomi: "on'yomi", kunyomi: "kun'yomi", nanori: "nanori" } as const;

export function checkReading(input: string, subject: Subject): CheckResult {
  const answer = normalizeReading(input);
  if (!answer) return { verdict: "retry", message: "Type an answer first." };
  if (!isKana(answer)) return { verdict: "retry", message: "Type the reading in kana." };

  const readings = subject.data.readings ?? [];
  const accepted = readings.filter((r) => r.accepted_answer);
  if (accepted.some((r) => toHiragana(r.reading) === answer)) return { verdict: "correct" };

  // Kanji: a real reading, just not the one being taught → ask again instead of failing.
  const other = readings.find((r) => !r.accepted_answer && toHiragana(r.reading) === answer);
  if (subject.object === "kanji" && other) {
    const wanted = accepted[0]?.type;
    return {
      verdict: "retry",
      message: wanted
        ? `That's a valid reading, but we're looking for the ${READING_NAME[wanted]}.`
        : "That's a valid reading, but not the one we're looking for.",
    };
  }

  return { verdict: "incorrect" };
}
