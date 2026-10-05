import type { Schedule, ShiftCode } from "./domain/types";

export interface Row {
  staff_id: string;
  day: string;
  shift_code: ShiftCode;
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
