const pad = (n: number) => String(n).padStart(2, "0");

export const toISO = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthDates(year: number, month: number): string[] {
  return Array.from({ length: daysInMonth(year, month) }, (_, i) => toISO(year, month, i + 1));
}

const toUTC = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
};

export function diffDays(a: string, b: string): number {
  return Math.round((toUTC(a) - toUTC(b)) / 86400000);
}

/** 0 = Sunday ... 6 = Saturday */
export function weekday(iso: string): number {
  return new Date(toUTC(iso)).getUTCDay();
}

export const isWeekend = (iso: string) => weekday(iso) === 0 || weekday(iso) === 6;

/** Splits a month's dates into weeks that start on Monday (the first and last ones may be partial). */
export function weeksOf(dates: string[]): string[][] {
  const weeks: string[][] = [];
  for (const d of dates) {
    if (!weeks.length || weekday(d) === 1) weeks.push([]);
    weeks[weeks.length - 1].push(d);
  }
  return weeks;
}
