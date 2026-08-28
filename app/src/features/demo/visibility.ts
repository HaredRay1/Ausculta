import type { Collection, Table } from 'dexie'
import type { DemoFlag } from '../../db/types'

/**
 * Demo-data visibility: the one place that decides whether a row is shown.
 *
 * Seeded fictional records live in the same tables as real clinical records,
 * separated only by `isDemo`. Every list, count, search and export in the app
 * must route through this module — a query that talks to `db.patients`
 * directly will happily hand a validator's fictional patient to a health
 * worker who has demo mode switched off.
 *
 * ## Why the two directions are not symmetrical
 *
 * There are two questions to ask about `isDemo`, and they need opposite
 * failure modes:
 *
 * - **"Hide the demo rows"** (`visibleRows`) uses a predicate, `isDemo !== 1`,
 *   not the index. Dexie leaves a row out of an index entirely when the
 *   indexed property is `undefined`, so `where('isDemo').equals(0)` would
 *   silently hide any row whose flag is missing or malformed. Those rows are
 *   overwhelmingly likely to be *real* patients written by some earlier or
 *   buggier code path, and hiding a real patient from a clinician is the worst
 *   outcome available here. So anything not explicitly marked demo stays
 *   visible.
 *
 * - **"Select the demo rows"** (`demoRowsOnly`) does use the index,
 *   `equals(1)`, because it feeds deletion. Here the same quirk works in our
 *   favour: a row with a missing flag is not in the index, so it cannot be
 *   selected, and `resetDemoData` cannot reach a record that never announced
 *   itself as fictional.
 *
 * Both directions err towards protecting real data. The cost is a table scan
 * on the hide path, which is the right trade for a clinic-sized offline
 * database of at most a few thousand rows.
 */

/** Any row that can be seeded fictional data. */
export interface DemoScoped {
  isDemo: DemoFlag
}

export const REAL: DemoFlag = 0
export const DEMO: DemoFlag = 1

/**
 * `true` when this row must be hidden with demo mode off.
 *
 * Deliberately `=== DEMO` rather than `!== REAL`: only an explicit demo flag
 * hides a row.
 */
export function isDemoRow(row: DemoScoped): boolean {
  return row.isDemo === DEMO
}

/** `true` when this row should be shown at the given demo-mode setting. */
export function isVisible(row: DemoScoped, demoEnabled: boolean): boolean {
  return demoEnabled || !isDemoRow(row)
}

/**
 * **The query helper every feature should use.**
 *
 * Replaces `db.patients.toCollection()` / `db.patients.toArray()` and friends:
 *
 * ```ts
 * const { enabled } = useDemoMode()
 * const patients = await visibleRows(db.patients, enabled).toArray()
 * const total = await visibleRows(db.assessments, enabled).count()
 * ```
 *
 * Returns a normal Dexie `Collection`, so `.count()`, `.sortBy()`, `.offset()`,
 * `.limit()`, a further `.filter()` and `.each()` all work downstream. Reach
 * for `.and(...)` to add your own criteria rather than starting a fresh query
 * off the table.
 */
export function visibleRows<T extends DemoScoped, TKey, TInsert>(
  table: Table<T, TKey, TInsert>,
  demoEnabled: boolean,
): Collection<T, TKey, TInsert> {
  if (demoEnabled) return table.toCollection()
  return table.filter((row) => !isDemoRow(row))
}

/**
 * Every seeded row in this table and nothing else.
 *
 * Only `resetDemoData` and the demo screens have any business calling this.
 */
export function demoRowsOnly<T extends DemoScoped, TKey, TInsert>(
  table: Table<T, TKey, TInsert>,
): Collection<T, TKey, TInsert> {
  return table.where('isDemo').equals(DEMO)
}

/** In-memory equivalent of `visibleRows`, for arrays already loaded. */
export function keepVisible<T extends DemoScoped>(rows: readonly T[], demoEnabled: boolean): T[] {
  return rows.filter((row) => isVisible(row, demoEnabled))
}
