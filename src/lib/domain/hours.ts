import { SHIFTS, isOff, type Schedule, type ShiftCode } from "./types";

const DAY = 1440;
const dayIndex = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10))) / 60000;
const minutes = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

/** When a shift on `iso` starts and ends, in minutes on one common clock (a night ends the next morning). Null for days without work or without hours. */
export function shiftSpan(code: ShiftCode | undefined, iso: string): { start: number; end: number } | null {
  if (!code || isOff(code)) return null;
  const def = SHIFTS[code];
  if (!def.start || !def.end) return null;
  const start = dayIndex(iso) + minutes(def.start);
  let end = dayIndex(iso) + minutes(def.end);
  if (end <= start) end += DAY;
  return { start, end };
}

/** Minutes between the end of the shift on `prevIso` and the start of the one on `iso` (null when either has no hours). */
export function restBetween(prev: ShiftCode | undefined, prevIso: string, next: ShiftCode | undefined, iso: string): number | null {
  const a = shiftSpan(prev, prevIso);
  const b = shiftSpan(next, iso);
  return a && b ? b.start - a.end : null;
}

export const isoMinutes = dayIndex;

/**
 * The person's rest periods (gaps between shifts) over `dates`, as [from, to] minutes. The edges of the period count as rest
 * only up to the first/last shift, so a period that starts or ends with days off gives a block that is at least that long.
 */
export function restBlocks(row: Schedule[string] | undefined, dates: string[]): [number, number][] {
  const spans = dates.map((d) => shiftSpan(row?.[d], d)).filter((x): x is { start: number; end: number } => Boolean(x));
  const from = dayIndex(dates[0]);
  const to = dayIndex(dates[dates.length - 1]) + DAY;
  const blocks: [number, number][] = [];
  let cursor = from;
  for (const s of spans) {
    if (s.start > cursor) blocks.push([cursor, s.start]);
    cursor = Math.max(cursor, s.end);
  }
  if (to > cursor) blocks.push([cursor, to]);
  return blocks;
}
