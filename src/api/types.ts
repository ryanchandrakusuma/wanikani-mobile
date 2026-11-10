// Types for the WaniKani API v2 (revision 20170710).
// Only the fields the app reads are typed; the full JSON of every record is
// stored in SQLite anyway, so later steps can type more fields as needed.

export interface WKResource<T> {
  object: string;
  url: string;
  data_updated_at: string | null;
  data: T;
}

/** A record inside a collection response carries a numeric id. */
export interface WKCollectionItem<T> extends WKResource<T> {
  id: number;
}

export interface WKCollection<T> {
  object: "collection";
  url: string;
  pages: { next_url: string | null; previous_url: string | null; per_page: number };
  total_count: number;
  /** Latest update time among all records matching the filter (null if none). */
  data_updated_at: string | null;
  data: WKCollectionItem<T>[];
}

export interface WKSubscription {
  active: boolean;
  type: "free" | "recurring" | "lifetime" | "unknown";
  max_level_granted: number;
  period_ends_at: string | null;
}

export interface WKUser {
  id: string;
  username: string;
  level: number;
  profile_url: string;
  started_at: string;
  current_vacation_started_at: string | null;
  subscription: WKSubscription;
}

export type WKSubjectType = "radical" | "kanji" | "vocabulary" | "kana_vocabulary";

export interface WKSubject {
  level: number;
  slug: string;
  characters: string | null;
  hidden_at: string | null;
  lesson_position: number;
  spaced_repetition_system_id: number;
  // Meanings, readings, mnemonics, etc. are kept in the stored JSON.
  [key: string]: unknown;
}

export interface WKAssignment {
  subject_id: number;
  subject_type: WKSubjectType;
  srs_stage: number;
  unlocked_at: string | null;
  started_at: string | null;
  passed_at: string | null;
  burned_at: string | null;
  available_at: string | null;
  resurrected_at: string | null;
  hidden: boolean;
}

export interface WKStudyMaterial {
  subject_id: number;
  subject_type: WKSubjectType;
  meaning_note: string | null;
  reading_note: string | null;
  meaning_synonyms: string[];
  hidden: boolean;
}

export interface WKReviewStatistic {
  subject_id: number;
  subject_type: WKSubjectType;
  meaning_correct: number;
  meaning_incorrect: number;
  reading_correct: number;
  reading_incorrect: number;
  percentage_correct: number;
  hidden: boolean;
  [key: string]: unknown;
}

export interface WKLevelProgression {
  level: number;
  unlocked_at: string | null;
  started_at: string | null;
  passed_at: string | null;
  completed_at: string | null;
  abandoned_at: string | null;
}

export interface WKSpacedRepetitionSystem {
  name: string;
  starting_stage_position: number;
  passing_stage_position: number;
  burning_stage_position: number;
  unlocking_stage_position: number;
  stages: { position: number; interval: number | null; interval_unit: string | null }[];
}
