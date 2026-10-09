import { displayCode, SHIFTS, type Schedule, type ShiftCode } from "./types";

export interface LoggedCell {
  staffId: string;
  date: string;
  from: ShiftCode | undefined;
  to: ShiftCode;
}

export interface LogEntry {
  /** ISO timestamp. */
  at: string;
  /** What the manager did ("Edición manual", "Generar automático", a request title…). */
  label: string;
  cells: LoggedCell[];
}

/** Cells that differ between two schedules (only people and days that exist in `next`). */
export function diffCells(prev: Schedule, next: Schedule): LoggedCell[] {
  const out: LoggedCell[] = [];
  for (const id of Object.keys(next))
    for (const [date, to] of Object.entries(next[id])) {
      const from = prev[id]?.[date];
      if (from !== to) out.push({ staffId: id, date, from, to });
    }
  return out;
}

/** The newest entries first, never more than `max` (the oldest drop off). */
export function appendEntry(log: LogEntry[], entry: LogEntry, max = 300): LogEntry[] {
  if (!entry.cells.length) return log;
  return [entry, ...log].slice(0, max);
}

export const shiftName = (c: ShiftCode | undefined) => (c ? `${SHIFTS[c].label} (${displayCode(c) || "—"})` : "sin turno");

/** How many people and days an entry touches: "3 casillas · 2 personas". */
export function entrySummary(e: LogEntry): string {
  const people = new Set(e.cells.map((c) => c.staffId)).size;
  return `${e.cells.length} casilla${e.cells.length === 1 ? "" : "s"} · ${people} persona${people === 1 ? "" : "s"}`;
}

/** Can this cell go back to what it was? Only while it still holds what the entry set (otherwise a later edit would be overwritten). */
export const canRestore = (c: LoggedCell, current: Schedule) => c.from !== undefined && current[c.staffId]?.[c.date] === c.to;
