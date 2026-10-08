import type { MonthState } from "./domain/monthStatus";

const key = (y: number, m: number) => `horarios:status:${y}-${m}`;

export function readMonthState(y: number, m: number): MonthState | null {
  try {
    const v = JSON.parse(localStorage.getItem(key(y, m)) ?? "null") as MonthState | null;
    return v && (v.state === "published" || v.state === "reopened") ? v : null;
  } catch {
    return null;
  }
}

export function writeMonthState(y: number, m: number, s: MonthState | null) {
  try {
    if (s) localStorage.setItem(key(y, m), JSON.stringify(s));
    else localStorage.removeItem(key(y, m));
  } catch {}
}
