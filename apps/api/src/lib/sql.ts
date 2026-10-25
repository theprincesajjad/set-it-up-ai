/** Rows of a raw `db.execute(sql...)` result: postgres-js returns the rows array, PGlite wraps them in `{ rows }`. */
export function rowsOf<T = Record<string, unknown>>(res: unknown): T[] {
  return (Array.isArray(res) ? res : ((res as { rows?: unknown[] }).rows ?? [])) as T[];
}
