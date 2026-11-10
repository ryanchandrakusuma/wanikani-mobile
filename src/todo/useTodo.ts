import { useCallback, useEffect, useState } from "react";
import { AppState } from "react-native";
import { getDatabase } from "../db/database";
import { getForecast, getTodoCounts, type ForecastHour, type TodoCounts } from "../db/queries";
import { useSync } from "../sync/SyncContext";
import { startOfLocalDay } from "../utils/time";

export interface Todo extends TodoCounts {
  forecast: ForecastHour[];
}

/** Reviews unlock as time passes, so the counts are re-read this often. */
export const TODO_REFRESH_MS = 60_000;

/**
 * The lesson/review to-do list, read from the local database (works offline).
 * Re-reads after every sync, every minute, and when the app comes back.
 */
async function loadTodo(): Promise<Todo> {
  const db = await getDatabase();
  const now = new Date();
  const counts = await getTodoCounts(db, now, startOfLocalDay(now));
  const forecast = await getForecast(db, now, counts.reviewsAvailable);
  return { ...counts, forecast };
}

export function useTodo(): { todo: Todo | null; refresh: () => Promise<void> } {
  const { phase, lastSyncedAt } = useSync();
  const [todo, setTodo] = useState<Todo | null>(null);

  const refresh = useCallback(async () => {
    setTodo(await loadTodo());
  }, []);

  // Initial read, then again whenever a sync starts/finishes.
  useEffect(() => {
    let cancelled = false;
    loadTodo()
      .then((t) => { if (!cancelled) setTodo(t); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [phase, lastSyncedAt]);

  useEffect(() => {
    const id = setInterval(() => { refresh().catch(() => {}); }, TODO_REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh().catch(() => {});
    });
    return () => sub.remove();
  }, [refresh]);

  return { todo, refresh };
}
