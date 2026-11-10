import type { Subject } from "../subjects/model";

export type LessonPage = "composition" | "meaning" | "reading" | "context";

/** The pages shown when learning an item, in order (follows WaniKani's lessons). */
export function lessonPages(s: Subject): LessonPage[] {
  const hasComponents = (s.data.component_subject_ids?.length ?? 0) > 0;
  switch (s.object) {
    case "radical":
      return ["meaning"];
    case "kanji":
      return [...(hasComponents ? ["composition" as const] : []), "meaning", "reading"];
    case "vocabulary":
      return [...(hasComponents ? ["composition" as const] : []), "meaning", "reading", "context"];
    case "kana_vocabulary":
      return ["meaning", "context"];
  }
}

export function pageLabel(page: LessonPage, s: Subject): string {
  switch (page) {
    case "composition": return s.object === "kanji" ? "Radicals" : "Kanji";
    case "meaning": return s.object === "radical" ? "Name" : "Meaning";
    case "reading": return s.object === "kanji" ? "Readings" : "Reading";
    case "context": return "Context";
  }
}
