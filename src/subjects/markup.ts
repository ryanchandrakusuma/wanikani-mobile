/**
 * WaniKani mnemonics and hints contain simple tags, e.g.
 *   "The <radical>ground</radical> is <reading>big</reading>"
 * This turns them into plain segments the UI can colour.
 */
export type MarkupTag = "radical" | "kanji" | "vocabulary" | "reading" | "ja" | "meaning";

export interface MarkupSegment {
  text: string;
  tag: MarkupTag | null;
}

const KNOWN = new Set<MarkupTag>(["radical", "kanji", "vocabulary", "reading", "ja", "meaning"]);
const TAG = /<(\/?)([a-z_]+)[^>]*>/gi;

export function parseMarkup(input: string | null | undefined): MarkupSegment[] {
  if (!input) return [];
  const segments: MarkupSegment[] = [];
  const stack: MarkupTag[] = [];
  let last = 0;

  const push = (text: string) => {
    if (!text) return;
    const tag = stack.at(-1) ?? null;
    const prev = segments.at(-1);
    if (prev && prev.tag === tag) prev.text += text;
    else segments.push({ text, tag });
  };

  for (const match of input.matchAll(TAG)) {
    push(input.slice(last, match.index));
    last = match.index! + match[0].length;
    const closing = match[1] === "/";
    const name = match[2].toLowerCase() as MarkupTag;
    if (!KNOWN.has(name)) continue; // unknown tags are dropped, their text kept
    if (closing) {
      const at = stack.lastIndexOf(name);
      if (at !== -1) stack.splice(at, 1);
    } else {
      stack.push(name);
    }
  }
  push(input.slice(last));
  return segments;
}

/** Text with all tags removed. */
export function stripMarkup(input: string | null | undefined): string {
  return parseMarkup(input).map((s) => s.text).join("");
}
