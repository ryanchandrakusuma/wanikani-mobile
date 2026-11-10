/**
 * The subset of expo-sqlite's SQLiteDatabase that the app uses.
 * Keeping it this small lets tests run the same code against Node's
 * built-in SQLite (see __tests__/helpers/testDb.ts).
 */
export type SqlValue = string | number | null;

export interface Db {
  execAsync(sql: string): Promise<void>;
  runAsync(sql: string, params: SqlValue[]): Promise<unknown>;
  getAllAsync<T>(sql: string, params: SqlValue[]): Promise<T[]>;
  getFirstAsync<T>(sql: string, params: SqlValue[]): Promise<T | null>;
  withTransactionAsync(task: () => Promise<void>): Promise<void>;
}
