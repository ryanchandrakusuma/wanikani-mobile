import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getDatabase } from "../db/database";
import {
  clampDailyLessonLimit, DEFAULT_DAILY_LESSON_LIMIT, getDailyLessonLimit,
  setDailyLessonLimit as saveDailyLessonLimit,
} from "../db/settings";

interface SettingsState {
  dailyLessonLimit: number;
  setDailyLessonLimit: (n: number) => Promise<void>;
}

const SettingsContext = createContext<SettingsState | null>(null);

/** Device preferences, stored in SQLite so they survive restarts and account switches. */
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [dailyLessonLimit, setLimit] = useState(DEFAULT_DAILY_LESSON_LIMIT);

  useEffect(() => {
    let cancelled = false;
    getDatabase()
      .then((db) => getDailyLessonLimit(db))
      .then((value) => { if (!cancelled) setLimit(value); })
      .catch(() => { /* keep the default */ });
    return () => { cancelled = true; };
  }, []);

  const setDailyLessonLimit = useCallback(async (n: number) => {
    setLimit(clampDailyLessonLimit(n)); // update the UI immediately
    const db = await getDatabase();
    setLimit(await saveDailyLessonLimit(db, n));
  }, []);

  const value = useMemo(() => ({ dailyLessonLimit, setDailyLessonLimit }), [dailyLessonLimit, setDailyLessonLimit]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used inside SettingsProvider");
  return ctx;
}
