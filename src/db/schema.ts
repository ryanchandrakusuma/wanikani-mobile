import type { Db } from "./types";

/**
 * Database migrations. Each entry upgrades the schema by one version;
 * SQLite's `PRAGMA user_version` remembers which ones already ran.
 * Never edit a shipped migration — add a new one instead, so existing
 * data on the phone is upgraded rather than wiped.
 */
export const MIGRATIONS: string[] = [
  // v1 — Step 2: WaniKani cache, sync cursors, activity log, outbox
  `
  CREATE TABLE meta (
    key   TEXT PRIMARY KEY NOT NULL,
    value TEXT
  );

  -- Last data_updated_at seen per endpoint; sent back as updated_after.
  CREATE TABLE sync_state (
    resource        TEXT PRIMARY KEY NOT NULL,
    updated_after   TEXT,
    last_synced_at  TEXT NOT NULL
  );

  CREATE TABLE subjects (
    id               INTEGER PRIMARY KEY NOT NULL,
    object           TEXT NOT NULL,
    level            INTEGER NOT NULL,
    characters       TEXT,
    lesson_position  INTEGER NOT NULL,
    hidden_at        TEXT,
    data_updated_at  TEXT,
    data             TEXT NOT NULL
  );
  CREATE INDEX subjects_level ON subjects(level);

  CREATE TABLE assignments (
    id               INTEGER PRIMARY KEY NOT NULL,
    subject_id       INTEGER NOT NULL,
    subject_type     TEXT NOT NULL,
    srs_stage        INTEGER NOT NULL,
    unlocked_at      TEXT,
    started_at       TEXT,
    passed_at        TEXT,
    burned_at        TEXT,
    available_at     TEXT,
    hidden           INTEGER NOT NULL DEFAULT 0,
    data_updated_at  TEXT,
    data             TEXT NOT NULL
  );
  CREATE INDEX assignments_subject ON assignments(subject_id);
  CREATE INDEX assignments_available ON assignments(available_at);
  CREATE INDEX assignments_stage ON assignments(srs_stage);

  CREATE TABLE study_materials (
    id               INTEGER PRIMARY KEY NOT NULL,
    subject_id       INTEGER NOT NULL,
    hidden           INTEGER NOT NULL DEFAULT 0,
    data_updated_at  TEXT,
    data             TEXT NOT NULL
  );
  CREATE INDEX study_materials_subject ON study_materials(subject_id);

  CREATE TABLE review_statistics (
    id                  INTEGER PRIMARY KEY NOT NULL,
    subject_id          INTEGER NOT NULL,
    percentage_correct  INTEGER NOT NULL,
    hidden              INTEGER NOT NULL DEFAULT 0,
    data_updated_at     TEXT,
    data                TEXT NOT NULL
  );
  CREATE INDEX review_statistics_subject ON review_statistics(subject_id);

  CREATE TABLE level_progressions (
    id               INTEGER PRIMARY KEY NOT NULL,
    level            INTEGER NOT NULL,
    data_updated_at  TEXT,
    data             TEXT NOT NULL
  );

  CREATE TABLE srs_systems (
    id               INTEGER PRIMARY KEY NOT NULL,
    data_updated_at  TEXT,
    data             TEXT NOT NULL
  );

  -- One row per answer/lesson done in this app. Text ids (UUIDs) let
  -- backups from the phone and the iPad be merged without duplicates.
  CREATE TABLE activity_log (
    id                 TEXT PRIMARY KEY NOT NULL,
    kind               TEXT NOT NULL CHECK (kind IN ('lesson', 'review')),
    subject_id         INTEGER NOT NULL,
    meaning_incorrect  INTEGER NOT NULL DEFAULT 0,
    reading_incorrect  INTEGER NOT NULL DEFAULT 0,
    created_at         TEXT NOT NULL
  );
  CREATE INDEX activity_log_created ON activity_log(created_at);

  -- Results waiting to be sent to WaniKani (used from Step 5).
  CREATE TABLE outbox (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    kind        TEXT NOT NULL CHECK (kind IN ('start_assignment', 'review')),
    payload     TEXT NOT NULL,
    created_at  TEXT NOT NULL,
    attempts    INTEGER NOT NULL DEFAULT 0,
    last_error  TEXT
  );
  `,
];

export const SCHEMA_VERSION = MIGRATIONS.length;

export async function migrate(db: Db): Promise<void> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version", []);
  const current = row?.user_version ?? 0;
  if (current > SCHEMA_VERSION) {
    throw new Error(`Database is newer (v${current}) than this app (v${SCHEMA_VERSION}).`);
  }
  for (let v = current; v < SCHEMA_VERSION; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`PRAGMA user_version = ${v + 1}`);
    });
  }
}
