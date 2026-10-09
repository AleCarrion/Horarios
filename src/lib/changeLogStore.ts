import type { LogEntry } from "./domain/changeLog";

const key = (y: number, m: number) => `horarios:log:${y}-${m}`;

export function readLog(y: number, m: number): LogEntry[] {
  try {
    const v = JSON.parse(localStorage.getItem(key(y, m)) ?? "[]");
    return Array.isArray(v) ? (v as LogEntry[]) : [];
  } catch {
    return [];
  }
}

export function writeLog(y: number, m: number, log: LogEntry[]) {
  try {
    localStorage.setItem(key(y, m), JSON.stringify(log));
  } catch {}
}
