import { getCollectionPage } from "../api/client";
import type { WKCollection } from "../api/types";
import { getUpdatedAfter, saveSyncState, upsert, type SyncResource } from "../db/repository";
import type { Db } from "../db/types";

/** Endpoints mirrored into SQLite, in sync order (small ones first). */
export const SYNC_RESOURCES: readonly { name: SyncResource; path: string; label: string }[] = [
  { name: "srs_systems", path: "/spaced_repetition_systems", label: "spaced repetition stages" },
  { name: "level_progressions", path: "/level_progressions", label: "levels" },
  { name: "study_materials", path: "/study_materials", label: "your notes" },
  { name: "subjects", path: "/subjects", label: "items" },
  { name: "assignments", path: "/assignments", label: "your progress" },
  { name: "review_statistics", path: "/review_statistics", label: "review stats" },
];

export const SYNC_RESOURCE_NAMES = SYNC_RESOURCES.map((r) => r.name);

export interface SyncProgress {
  resource: SyncResource;
  label: string;
  fetched: number;
  total: number;
}

export interface SyncOptions {
  onProgress?: (p: SyncProgress) => void;
  now?: () => Date;
}

/**
 * Downloads one endpoint into SQLite.
 *
 * First run: no cursor, so every record is fetched page by page.
 * Later runs: `updated_after` = the cursor, so only changed records come back.
 *
 * The cursor is the collection's `data_updated_at` from the FIRST page, saved
 * only after the LAST page is stored. If the app is closed or goes offline
 * halfway, the cursor stays where it was and the next sync simply re-fetches
 * (upserts are idempotent), so nothing is ever skipped.
 */
async function syncResource(
  db: Db, token: string, resource: (typeof SYNC_RESOURCES)[number], opts: SyncOptions,
): Promise<number> {
  const now = opts.now ?? (() => new Date());
  const startedAt = now().toISOString();
  const after = await getUpdatedAfter(db, resource.name);

  let url: string | null = after
    ? `${resource.path}?updated_after=${encodeURIComponent(after)}`
    : resource.path;
  let cursor: string | null = null;
  let fetched = 0;
  let firstPage = true;

  while (url) {
    const page: WKCollection<unknown> = await getCollectionPage<unknown>(token, url);
    if (firstPage) {
      cursor = page.data_updated_at;
      firstPage = false;
    }
    if (page.data.length > 0) {
      await db.withTransactionAsync(() => upsert[resource.name](db, page.data as never));
    }
    fetched += page.data.length;
    opts.onProgress?.({ resource: resource.name, label: resource.label, fetched, total: page.total_count });
    url = page.pages.next_url;
  }

  await saveSyncState(db, resource.name, cursor, startedAt);
  return fetched;
}

export type SyncSummary = Record<SyncResource, number>;

/** Syncs every endpoint in order. Throws the first error (WKApiError for API problems). */
export async function syncAll(db: Db, token: string, opts: SyncOptions = {}): Promise<SyncSummary> {
  const summary = {} as SyncSummary;
  for (const resource of SYNC_RESOURCES) {
    summary[resource.name] = await syncResource(db, token, resource, opts);
  }
  return summary;
}
