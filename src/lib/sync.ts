import type { Schedule, ShiftCode } from "./domain/types";

export interface Row {
  staff_id: string;
  day: string;
  shift_code: ShiftCode;
  /** When the cell was edited on this device (ISO). The server keeps a newer value written meanwhile by another device. */
  at?: string;
}

export function rowsToSchedule(rows: Row[]): Schedule {
  const s: Schedule = {};
  for (const r of rows) (s[r.staff_id] ??= {})[r.day] = r.shift_code;
  return s;
}

export function scheduleToRows(s: Schedule): Row[] {
  return Object.entries(s).flatMap(([staff_id, days]) =>
    Object.entries(days).map(([day, shift_code]) => ({ staff_id, day, shift_code })),
  );
}

/** Cells in `next` that differ from (or are missing in) `base`. */
export function diffSchedules(base: Schedule, next: Schedule): Row[] {
  return scheduleToRows(next).filter((r) => base[r.staff_id]?.[r.day] !== r.shift_code);
}

/** Last write wins per (staff, day); order of first appearance is kept. */
export function coalesce(rows: Row[]): Row[] {
  const m = new Map<string, Row>();
  for (const r of rows) m.set(`${r.staff_id}|${r.day}`, r);
  return [...m.values()];
}

/** The server does not know `apply_cells` yet (migration 0006 not applied): fall back to the plain upsert. */
export const isMissingFunction = (e: { code?: string; message?: string } | null) =>
  !!e && (e.code === "PGRST202" || e.code === "42883" || /could not find the function/i.test(e.message ?? ""));

/** Rows without the client-only timestamp, for tables that have no such column. */
export const withoutAt = (rows: Row[]): { staff_id: string; day: string; shift_code: ShiftCode }[] => rows.map(({ staff_id, day, shift_code }) => ({ staff_id, day, shift_code }));
