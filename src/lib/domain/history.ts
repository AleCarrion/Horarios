import type { Schedule, ShiftCode } from "./types";

export interface Change {
  staffId: string;
  date: string;
  from: ShiftCode | undefined;
  to: ShiftCode;
}

export interface History {
  past: Schedule[];
  present: Schedule;
  future: Schedule[];
  /** Net list of edits applied (for persistence / audit); undo removes the last one. */
  changes: Change[];
  undone: Change[];
}

export const createHistory = (present: Schedule): History => ({
  past: [],
  present,
  future: [],
  changes: [],
  undone: [],
});

export function applyEdit(h: History, staffId: string, date: string, to: ShiftCode): History {
  const from = h.present[staffId]?.[date];
  if (from === to) return h;
  const next: Schedule = { ...h.present, [staffId]: { ...h.present[staffId], [date]: to } };
  return {
    past: [...h.past, h.present],
    present: next,
    future: [],
    changes: [...h.changes, { staffId, date, from, to }],
    undone: [],
  };
}

export function undo(h: History): History {
  if (!h.past.length) return h;
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    changes: h.changes.slice(0, -1),
    undone: [h.changes[h.changes.length - 1], ...h.undone],
  };
}

export function redo(h: History): History {
  if (!h.future.length) return h;
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
    changes: [...h.changes, h.undone[0]],
    undone: h.undone.slice(1),
  };
}

/** Apply a change that came from another session: no undo entry, and it survives undo/redo. */
export function applyRemote(h: History, staffId: string, date: string, to: ShiftCode): History {
  const patch = (s: Schedule): Schedule => ({ ...s, [staffId]: { ...s[staffId], [date]: to } });
  return { ...h, past: h.past.map(patch), present: patch(h.present), future: h.future.map(patch) };
}
