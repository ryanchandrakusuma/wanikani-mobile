import type {
  WKAssignment, WKCollection, WKCollectionItem, WKSubject,
} from "../../src/api/types";

export function subject(id: number, overrides: Partial<WKSubject> = {}, updatedAt = "2026-01-01T00:00:00.000000Z"): WKCollectionItem<WKSubject> {
  return {
    id,
    object: "kanji",
    url: `https://api.wanikani.com/v2/subjects/${id}`,
    data_updated_at: updatedAt,
    data: {
      level: 1,
      slug: `s${id}`,
      characters: "一",
      hidden_at: null,
      lesson_position: id,
      spaced_repetition_system_id: 1,
      meanings: [{ meaning: "One", primary: true, accepted_answer: true }],
      ...overrides,
    },
  };
}

export function assignment(id: number, overrides: Partial<WKAssignment> = {}, updatedAt = "2026-01-01T00:00:00.000000Z"): WKCollectionItem<WKAssignment> {
  return {
    id,
    object: "assignment",
    url: `https://api.wanikani.com/v2/assignments/${id}`,
    data_updated_at: updatedAt,
    data: {
      subject_id: id,
      subject_type: "kanji",
      srs_stage: 1,
      unlocked_at: "2026-01-01T00:00:00.000000Z",
      started_at: "2026-01-01T00:00:00.000000Z",
      passed_at: null,
      burned_at: null,
      available_at: "2026-01-02T00:00:00.000000Z",
      resurrected_at: null,
      hidden: false,
      ...overrides,
    },
  };
}

export function collection<T>(
  data: WKCollectionItem<T>[],
  opts: { next?: string | null; total?: number; updatedAt?: string | null } = {},
): WKCollection<T> {
  return {
    object: "collection",
    url: "https://api.wanikani.com/v2/x",
    pages: { next_url: opts.next ?? null, previous_url: null, per_page: 1000 },
    total_count: opts.total ?? data.length,
    data_updated_at: opts.updatedAt === undefined ? (data.at(-1)?.data_updated_at ?? null) : opts.updatedAt,
    data,
  };
}
