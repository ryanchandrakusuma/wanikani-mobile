import type {
  WKAssignment, WKCollectionItem, WKLevelProgression, WKReviewStatistic,
  WKSpacedRepetitionSystem, WKStudyMaterial, WKSubject,
} from "../api/types";
import type { Db, SqlValue } from "./types";

// ---------------------------------------------------------------------------
// Upserts: each WaniKani record becomes one row. A few fields get their own
// columns for fast queries; the full record is kept as JSON in `data`.
// ---------------------------------------------------------------------------

/** Rows per INSERT statement. Keeps bound parameters well under SQLite's limit. */
const CHUNK = 100;

async function upsertRows(db: Db, table: string, columns: string[], rows: SqlValue[][]) {
  if (rows.length === 0) return;
  const placeholders = `(${columns.map(() => "?").join(", ")})`;
  const updates = columns.filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ");
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    await db.runAsync(
      `INSERT INTO ${table} (${columns.join(", ")}) VALUES ${chunk.map(() => placeholders).join(", ")}
       ON CONFLICT(id) DO UPDATE SET ${updates}`,
      chunk.flat(),
    );
  }
}

const bool = (b: boolean) => (b ? 1 : 0);

export const upsert = {
  subjects: (db: Db, items: WKCollectionItem<WKSubject>[]) =>
    upsertRows(
      db, "subjects",
      ["id", "object", "level", "characters", "lesson_position", "hidden_at", "data_updated_at", "data"],
      items.map((s) => [
        s.id, s.object, s.data.level, s.data.characters, s.data.lesson_position,
        s.data.hidden_at, s.data_updated_at, JSON.stringify(s.data),
      ]),
    ),

  assignments: (db: Db, items: WKCollectionItem<WKAssignment>[]) =>
    upsertRows(
      db, "assignments",
      ["id", "subject_id", "subject_type", "srs_stage", "unlocked_at", "started_at", "passed_at",
        "burned_at", "available_at", "hidden", "data_updated_at", "data"],
      items.map((a) => [
        a.id, a.data.subject_id, a.data.subject_type, a.data.srs_stage, a.data.unlocked_at,
        a.data.started_at, a.data.passed_at, a.data.burned_at, a.data.available_at,
        bool(a.data.hidden), a.data_updated_at, JSON.stringify(a.data),
      ]),
    ),

  study_materials: (db: Db, items: WKCollectionItem<WKStudyMaterial>[]) =>
    upsertRows(
      db, "study_materials",
      ["id", "subject_id", "hidden", "data_updated_at", "data"],
      items.map((m) => [m.id, m.data.subject_id, bool(m.data.hidden), m.data_updated_at, JSON.stringify(m.data)]),
    ),

  review_statistics: (db: Db, items: WKCollectionItem<WKReviewStatistic>[]) =>
    upsertRows(
      db, "review_statistics",
      ["id", "subject_id", "percentage_correct", "hidden", "data_updated_at", "data"],
      items.map((r) => [
        r.id, r.data.subject_id, r.data.percentage_correct, bool(r.data.hidden),
        r.data_updated_at, JSON.stringify(r.data),
      ]),
    ),

  level_progressions: (db: Db, items: WKCollectionItem<WKLevelProgression>[]) =>
    upsertRows(
      db, "level_progressions",
      ["id", "level", "data_updated_at", "data"],
      items.map((l) => [l.id, l.data.level, l.data_updated_at, JSON.stringify(l.data)]),
    ),

  srs_systems: (db: Db, items: WKCollectionItem<WKSpacedRepetitionSystem>[]) =>
    upsertRows(
      db, "srs_systems",
      ["id", "data_updated_at", "data"],
      items.map((s) => [s.id, s.data_updated_at, JSON.stringify(s.data)]),
    ),
};

export type SyncResource = keyof typeof upsert;

// ---------------------------------------------------------------------------
// Sync cursors
// ---------------------------------------------------------------------------

export async function getUpdatedAfter(db: Db, resource: SyncResource): Promise<string | null> {
  const row = await db.getFirstAsync<{ updated_after: string | null }>(
    "SELECT updated_after FROM sync_state WHERE resource = ?", [resource],
  );
  return row?.updated_after ?? null;
}

export async function saveSyncState(db: Db, resource: SyncResource, updatedAfter: string | null, syncedAt: string) {
  await db.runAsync(
    `INSERT INTO sync_state (resource, updated_after, last_synced_at) VALUES (?, ?, ?)
     ON CONFLICT(resource) DO UPDATE SET
       updated_after = COALESCE(excluded.updated_after, sync_state.updated_after),
       last_synced_at = excluded.last_synced_at`,
    [resource, updatedAfter, syncedAt],
  );
}

/** Oldest last_synced_at across resources, or null if any was never synced. */
export async function getLastFullSync(db: Db, resources: readonly SyncResource[]): Promise<string | null> {
  const rows = await db.getAllAsync<{ resource: string; last_synced_at: string }>(
    "SELECT resource, last_synced_at FROM sync_state", [],
  );
  if (resources.some((r) => !rows.find((row) => row.resource === r))) return null;
  return rows
    .filter((row) => resources.includes(row.resource as SyncResource))
    .map((row) => row.last_synced_at)
    .sort()[0] ?? null;
}

// ---------------------------------------------------------------------------
// Ownership: the database belongs to one WaniKani account
// ---------------------------------------------------------------------------

const DATA_TABLES = [
  "sync_state", "subjects", "assignments", "study_materials", "review_statistics",
  "level_progressions", "srs_systems", "activity_log", "outbox",
] as const;

export async function wipeAllData(db: Db) {
  await db.withTransactionAsync(async () => {
    for (const table of DATA_TABLES) await db.execAsync(`DELETE FROM ${table}`);
    await db.execAsync("DELETE FROM meta");
  });
}

/**
 * Makes sure the local data belongs to `userId`. Same account → keep
 * everything. A different account → wipe first, so two accounts never mix.
 * Returns true if data was wiped.
 */
export async function claimForUser(db: Db, userId: string): Promise<boolean> {
  const row = await db.getFirstAsync<{ value: string | null }>("SELECT value FROM meta WHERE key = 'owner_user_id'", []);
  const owner = row?.value ?? null;
  if (owner === userId) return false;

  const wipe = owner !== null;
  if (wipe) await wipeAllData(db);
  await db.runAsync(
    "INSERT INTO meta (key, value) VALUES ('owner_user_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    [userId],
  );
  return wipe;
}

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export interface StoredCounts {
  subjects: number;
  assignments: number;
  study_materials: number;
  review_statistics: number;
  level_progressions: number;
  srs_systems: number;
}

export async function getStoredCounts(db: Db): Promise<StoredCounts> {
  const row = await db.getFirstAsync<StoredCounts>(
    `SELECT
       (SELECT COUNT(*) FROM subjects)           AS subjects,
       (SELECT COUNT(*) FROM assignments)        AS assignments,
       (SELECT COUNT(*) FROM study_materials)    AS study_materials,
       (SELECT COUNT(*) FROM review_statistics)  AS review_statistics,
       (SELECT COUNT(*) FROM level_progressions) AS level_progressions,
       (SELECT COUNT(*) FROM srs_systems)        AS srs_systems`,
    [],
  );
  return row!;
}

export async function countPendingOutbox(db: Db): Promise<number> {
  const row = await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox", []);
  return row?.n ?? 0;
}
