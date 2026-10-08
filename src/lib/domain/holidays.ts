import { toISO } from "./dates";

/** Easter Sunday (Meeus/Jones/Butcher algorithm). */
function easter(year: number): { m: number; d: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { m: month, d: day };
}

/** National (Spain) holidays that every year falls on the same date, plus Viernes Santo. Local ones can be added by the caller. */
export function holidaysOf(year: number, extra: string[] = []): Set<string> {
  const fixed: [number, number][] = [[1, 1], [1, 6], [5, 1], [8, 15], [10, 12], [11, 1], [12, 6], [12, 8], [12, 25]];
  const set = new Set(fixed.map(([m, d]) => toISO(year, m, d)));
  const e = easter(year);
  const goodFriday = new Date(Date.UTC(year, e.m - 1, e.d - 2));
  set.add(toISO(year, goodFriday.getUTCMonth() + 1, goodFriday.getUTCDate()));
  for (const x of extra) set.add(x);
  return set;
}

export const isHoliday = (iso: string, extra: string[] = []) => holidaysOf(Number(iso.slice(0, 4)), extra).has(iso);
