import * as SQLite from "expo-sqlite";
import { migrate } from "./schema";
import type { Db } from "./types";

const DB_NAME = "wanikani.db";

let opening: Promise<Db> | null = null;

/**
 * Opens the app's database once and reuses it. The file lives in the app's
 * private storage; it survives sign-out but not uninstalling the app.
 */
export function getDatabase(): Promise<Db> {
  if (!opening) {
    opening = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      // WAL lets the UI read while a sync is writing.
      await db.execAsync("PRAGMA journal_mode = WAL;");
      await migrate(db);
      return db;
    })().catch((e) => {
      opening = null; // allow a retry on the next call
      throw e;
    });
  }
  return opening;
}
