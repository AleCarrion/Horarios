import type { Locks } from "./monthStore";

export interface LockRow {
  staff_id: string;
  day: string;
}

export function locksToRows(locks: Locks): LockRow[] {
  return Object.entries(locks).flatMap(([staff_id, days]) => Object.entries(days).filter(([, on]) => on).map(([day]) => ({ staff_id, day })));
}

export function locksFromRows(rows: LockRow[]): Locks {
  const out: Locks = {};
  for (const r of rows) (out[r.staff_id] ??= {})[r.day] = true;
  return out;
}

const keyOf = (r: LockRow) => `${r.staff_id}|${r.day}`;

/** What must be inserted / deleted on the server so it matches `now`. */
export function diffLocks(server: Locks, now: Locks): { add: LockRow[]; remove: LockRow[] } {
  const a = locksToRows(server);
  const b = locksToRows(now);
  const inServer = new Set(a.map(keyOf));
  const inNow = new Set(b.map(keyOf));
  return { add: b.filter((r) => !inServer.has(keyOf(r))), remove: a.filter((r) => !inNow.has(keyOf(r))) };
}

export function unionLocks(a: Locks, b: Locks): Locks {
  const out: Locks = {};
  for (const src of [a, b]) for (const [id, days] of Object.entries(src)) out[id] = { ...out[id], ...days };
  return out;
}
