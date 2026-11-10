import { getAssignment, startAssignment, WKApiError } from "../api/client";
import { upsert } from "../db/repository";
import type { Db } from "../db/types";

export interface FlushResult {
  /** Accepted by WaniKani. */
  sent: number;
  /** Refused by WaniKani (e.g. already done on the website); the server's version is kept. */
  dropped: number;
  /** Still waiting (offline, or not handled yet). */
  pending: number;
}

interface OutboxRow {
  id: number;
  kind: "start_assignment" | "review";
  payload: string;
}

async function countPending(db: Db) {
  return (await db.getFirstAsync<{ n: number }>("SELECT COUNT(*) AS n FROM outbox", []))?.n ?? 0;
}

/**
 * Sends queued results to WaniKani, oldest first.
 * - success → remove from the outbox and store the server's updated assignment
 * - refused (4xx) → remove, and take the server's version of that assignment
 * - offline / server trouble → stop; everything stays queued for the next sync
 * - token rejected (401) → thrown, so the caller can sign out
 * Reviews are sent from Step 5 on; they stay queued until then.
 */
export async function flushOutbox(db: Db, token: string): Promise<FlushResult> {
  const rows = await db.getAllAsync<OutboxRow>("SELECT id, kind, payload FROM outbox ORDER BY id", []);
  let sent = 0;
  let dropped = 0;

  for (const row of rows) {
    if (row.kind !== "start_assignment") continue;
    const { assignment_id: assignmentId, started_at: startedAt } = JSON.parse(row.payload) as {
      assignment_id: number; started_at: string;
    };

    try {
      const updated = await startAssignment(token, assignmentId, startedAt);
      await db.withTransactionAsync(async () => {
        await db.runAsync("DELETE FROM outbox WHERE id = ?", [row.id]);
        await upsert.assignments(db, [updated]);
      });
      sent++;
    } catch (e) {
      if (!(e instanceof WKApiError) || e.kind === "unauthorized") throw e;

      if (e.kind === "client") {
        await db.runAsync("DELETE FROM outbox WHERE id = ?", [row.id]);
        dropped++;
        await refreshAssignment(db, token, assignmentId);
        continue;
      }

      // network, server error or rate limit: keep it and try again later
      await db.runAsync(
        "UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?",
        [e.message, row.id],
      );
      break;
    }
  }

  return { sent, dropped, pending: await countPending(db) };
}

/**
 * Replaces the local copy of one assignment with WaniKani's. If that fails,
 * the next sync re-downloads all assignments so the phone can't stay wrong.
 */
async function refreshAssignment(db: Db, token: string, assignmentId: number) {
  try {
    await upsert.assignments(db, [await getAssignment(token, assignmentId)]);
  } catch {
    await db.runAsync("UPDATE sync_state SET updated_after = NULL WHERE resource = 'assignments'", []);
  }
}
