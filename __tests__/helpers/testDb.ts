/// <reference types="node" />
import { DatabaseSync } from "node:sqlite";
import type { Db, SqlValue } from "../../src/db/types";
import { migrate } from "../../src/db/schema";

/**
 * A real SQLite database in memory (Node's built-in sqlite), wrapped in the
 * same async interface the app gets from expo-sqlite.
 */
export function createTestDb(): Db & { raw: DatabaseSync } {
  const raw = new DatabaseSync(":memory:");
  let depth = 0;
  return {
    raw,
    async execAsync(sql: string) {
      raw.exec(sql);
    },
    async runAsync(sql: string, params: SqlValue[]) {
      return { changes: Number(raw.prepare(sql).run(...params).changes) };
    },
    async getAllAsync<T>(sql: string, params: SqlValue[]) {
      return raw.prepare(sql).all(...params) as T[];
    },
    async getFirstAsync<T>(sql: string, params: SqlValue[]) {
      return (raw.prepare(sql).get(...params) as T | undefined) ?? null;
    },
    async withTransactionAsync(task: () => Promise<void>) {
      // Mirrors expo-sqlite: BEGIN/COMMIT, ROLLBACK on error.
      if (depth > 0) throw new Error("Nested transactions are not supported");
      depth++;
      raw.exec("BEGIN");
      try {
        await task();
        raw.exec("COMMIT");
      } catch (e) {
        raw.exec("ROLLBACK");
        throw e;
      } finally {
        depth--;
      }
    },
  };
}

export async function createMigratedTestDb() {
  const db = createTestDb();
  await migrate(db);
  return db;
}
