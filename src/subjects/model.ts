// Typed view of a WaniKani subject as stored in SQLite (subjects.data JSON).
// https://docs.api.wanikani.com/20170710/#subjects

export type SubjectObject = "radical" | "kanji" | "vocabulary" | "kana_vocabulary";

export interface Meaning { meaning: string; primary: boolean; accepted_answer: boolean }
export interface AuxiliaryMeaning { meaning: string; type: "whitelist" | "blacklist" }
export interface Reading {
  reading: string;
  primary: boolean;
  accepted_answer: boolean;
  /** Kanji only. */
  type?: "onyomi" | "kunyomi" | "nanori";
}
export interface ContextSentence { en: string; ja: string }
export interface PronunciationAudio {
  url: string;
  content_type: string;
  metadata: { gender?: string; voice_actor_name?: string };
}
export interface CharacterImage {
  url: string;
  content_type: string;
  metadata: { inline_styles?: boolean };
}

export interface SubjectData {
  level: number;
  slug: string;
  characters: string | null;
  meanings: Meaning[];
  auxiliary_meanings?: AuxiliaryMeaning[];
  readings?: Reading[];
  meaning_mnemonic: string;
  meaning_hint?: string | null;
  reading_mnemonic?: string | null;
  reading_hint?: string | null;
  component_subject_ids?: number[];
  parts_of_speech?: string[];
  context_sentences?: ContextSentence[];
  pronunciation_audios?: PronunciationAudio[];
  character_images?: CharacterImage[];
  lesson_position: number;
  spaced_repetition_system_id: number;
  hidden_at: string | null;
}

export interface Subject {
  id: number;
  object: SubjectObject;
  data: SubjectData;
}

/** Your own synonyms and notes from study_materials. */
export interface StudyMaterial {
  meaningSynonyms: string[];
  meaningNote: string | null;
  readingNote: string | null;
}

export const EMPTY_STUDY: StudyMaterial = { meaningSynonyms: [], meaningNote: null, readingNote: null };

export function primaryMeaning(s: Subject): string {
  return (s.data.meanings.find((m) => m.primary) ?? s.data.meanings[0])?.meaning ?? s.data.slug;
}

export function primaryReading(s: Subject): string | null {
  const readings = s.data.readings ?? [];
  return (readings.find((r) => r.primary) ?? readings[0])?.reading ?? null;
}

/** Radicals and kanji need their reading asked about only for kanji and (kanji-)vocabulary. */
export function hasReading(s: Subject): boolean {
  return (s.object === "kanji" || s.object === "vocabulary") && (s.data.readings?.length ?? 0) > 0;
}

/** Image for radicals that have no Unicode character. PNG preferred (renders everywhere). */
export function radicalImageUrl(s: Subject): string | null {
  if (s.data.characters) return null;
  const images = s.data.character_images ?? [];
  const png = images.find((i) => i.content_type === "image/png");
  return (png ?? images.find((i) => i.content_type === "image/svg+xml"))?.url ?? null;
}

/** First pronunciation audio, MP3 preferred (plays on Android and iOS). */
export function pronunciationUrl(s: Subject): string | null {
  const audios = s.data.pronunciation_audios ?? [];
  return (audios.find((a) => a.content_type === "audio/mpeg") ?? audios[0])?.url ?? null;
}

export const SUBJECT_LABEL: Record<SubjectObject, string> = {
  radical: "Radical",
  kanji: "Kanji",
  vocabulary: "Vocabulary",
  kana_vocabulary: "Vocabulary",
};
