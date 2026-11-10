import { formatCount } from "../utils/format";
import { formatRelative } from "../utils/time";
import type { SyncPhase } from "./SyncContext";
import type { SyncProgress } from "./syncEngine";

/** One-line sync status: "Syncing items… 4,000 / 9,321", "Synced 2 min ago", or the error. */
export function syncLabel(
  phase: SyncPhase,
  progress: SyncProgress | null,
  lastSyncedAt: string | null,
  error: string | null,
  now: Date = new Date(),
): string {
  if (phase === "syncing") {
    if (!progress) return "Syncing…";
    return progress.total > 0
      ? `Syncing ${progress.label}… ${formatCount(progress.fetched)} / ${formatCount(progress.total)}`
      : `Syncing ${progress.label}…`;
  }
  if (phase === "error") return error ?? "Sync failed.";
  return lastSyncedAt ? `Synced ${formatRelative(lastSyncedAt, now)}` : "Not synced yet";
}
