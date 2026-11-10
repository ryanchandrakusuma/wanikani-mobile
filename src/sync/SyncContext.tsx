import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AppState } from "react-native";
import { WKApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";
import { getDatabase } from "../db/database";
import {
  claimForUser, countPendingOutbox, getLastFullSync, getStoredCounts, type StoredCounts,
} from "../db/repository";
import type { Db } from "../db/types";
import { flushOutbox } from "../outbox/sender";
import { SYNC_RESOURCE_NAMES, syncAll, type SyncProgress } from "./syncEngine";

/** Coming back to the app re-syncs at most this often. */
export const FOREGROUND_SYNC_INTERVAL_MS = 60_000;

export type SyncPhase = "idle" | "syncing" | "error";

interface SyncState {
  phase: SyncPhase;
  progress: SyncProgress | null;
  /** When every endpoint last finished syncing (null = never). */
  lastSyncedAt: string | null;
  error: string | null;
  counts: StoredCounts | null;
  /** Starts a sync, or joins the one already running. */
  sync: () => Promise<void>;
  pendingOutboxCount: () => Promise<number>;
}

const SyncContext = createContext<SyncState | null>(null);

export function SyncProvider({ children }: { children: ReactNode }) {
  const { token, user, signOut } = useAuth();
  const userId = user?.id ?? null;

  const [db, setDb] = useState<Db | null>(null);
  const [phase, setPhase] = useState<SyncPhase>("idle");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [counts, setCounts] = useState<StoredCounts | null>(null);

  const inFlight = useRef<Promise<void> | null>(null);
  const lastAttemptAt = useRef(0);

  const refreshLocal = useCallback(async (database: Db) => {
    setCounts(await getStoredCounts(database));
    setLastSyncedAt(await getLastFullSync(database, SYNC_RESOURCE_NAMES));
  }, []);

  // Open the database once and show what's already stored (works offline).
  useEffect(() => {
    let cancelled = false;
    getDatabase()
      .then(async (database) => {
        if (cancelled) return;
        setDb(database);
        await refreshLocal(database);
      })
      .catch(() => {
        if (!cancelled) {
          setPhase("error");
          setError("Couldn't open the local database.");
        }
      });
    return () => { cancelled = true; };
  }, [refreshLocal]);

  const sync = useCallback((): Promise<void> => {
    if (inFlight.current) return inFlight.current;
    if (!db || !token || !userId) return Promise.resolve();

    lastAttemptAt.current = Date.now();
    const run = (async () => {
      setPhase("syncing");
      setError(null);
      try {
        // Different account than last time → wipe before downloading.
        await claimForUser(db, userId);
        // Send finished lessons first, so the download below brings back WaniKani's view of them.
        await flushOutbox(db, token);
        await syncAll(db, token, { onProgress: setProgress });
        setPhase("idle");
      } catch (e) {
        setPhase("error");
        setError(e instanceof WKApiError ? e.message : "Sync failed. Pull down to try again.");
        if (e instanceof WKApiError && e.kind === "unauthorized") await signOut();
      } finally {
        setProgress(null);
        await refreshLocal(db).catch(() => {});
        inFlight.current = null;
      }
    })();
    inFlight.current = run;
    return run;
  }, [db, token, userId, signOut, refreshLocal]);

  // Sync as soon as we know who is signed in (app start or fresh sign-in).
  useEffect(() => {
    if (db && token && userId) void sync();
  }, [db, token, userId, sync]);

  // Sync again when the app returns to the foreground.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && Date.now() - lastAttemptAt.current >= FOREGROUND_SYNC_INTERVAL_MS) {
        void sync();
      }
    });
    return () => sub.remove();
  }, [sync]);

  const pendingOutboxCount = useCallback(
    async () => (db ? countPendingOutbox(db) : 0),
    [db],
  );

  const value = useMemo(
    () => ({ phase, progress, lastSyncedAt, error, counts, sync, pendingOutboxCount }),
    [phase, progress, lastSyncedAt, error, counts, sync, pendingOutboxCount],
  );

  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync() {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}
