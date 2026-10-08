import { generateSchedule } from "./domain/generator";
import type { Schedule, Staff } from "./domain/types";

/** Months before this one are generated without history. */
const ANCHOR = { y: 2026, m: 1 };

export const storageKey = (y: number, m: number) => `horarios:${y}-${m}`;

export function readStored(y: number, m: number): Schedule | null {
  try {
    const raw = localStorage.getItem(storageKey(y, m));
    return raw ? (JSON.parse(raw) as Schedule) : null;
  } catch {
    return null;
  }
}

export const prevMonth = (y: number, m: number) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
export const nextMonth = (y: number, m: number) => (m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 });
const beforeAnchor = (y: number, m: number) => y < ANCHOR.y || (y === ANCHOR.y && m <= ANCHOR.m);

const cache = new Map<string, Schedule>();

/** Call after saving a month: the automatic plans chained after it may change. */
export const clearScheduleCache = () => cache.clear();

/**
 * The schedule of a month: what the user saved, or the automatic plan chained from the previous month
 * (so streaks and rest runs carry over month boundaries and the automatic plans are deterministic).
 */
export function scheduleFor(y: number, m: number, staff: Staff[]): Schedule {
  const stored = readStored(y, m);
  if (stored) return stored;
  const key = `${y}-${m}|${JSON.stringify(staff)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const result = generateSchedule({ year: y, month: m, staff, history: historyFor(y, m, staff) }).schedule;
  cache.set(key, result);
  return result;
}

/** The previous month's schedule, used as history. */
export function historyFor(y: number, m: number, staff: Staff[]): Schedule | undefined {
  if (beforeAnchor(y, m)) return undefined;
  const p = prevMonth(y, m);
  return scheduleFor(p.y, p.m, staff);
}

/** The next month, only if the user already saved it (we never invent a "next" to protect). */
export function nextStored(y: number, m: number): Schedule | undefined {
  const n = nextMonth(y, m);
  return readStored(n.y, n.m) ?? undefined;
}

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** The schedule if it costs nothing to know it: saved by the user, or already planned in this session. */
export function peekFor(y: number, m: number, staff: Staff[]): Schedule | undefined {
  return readStored(y, m) ?? cache.get(`${y}-${m}|${JSON.stringify(staff)}`);
}

/**
 * Same result as `scheduleFor`, but plans the chain one month per turn of the event loop,
 * so a cold start never blocks the page for long.
 */
export async function scheduleForAsync(y: number, m: number, staff: Staff[], alive: () => boolean = () => true): Promise<Schedule | null> {
  const chain: { y: number; m: number }[] = [];
  for (let c = { y, m }; ; c = prevMonth(c.y, c.m)) {
    chain.unshift(c);
    if (peekFor(c.y, c.m, staff) || beforeAnchor(c.y, c.m)) break;
  }
  for (const c of chain) {
    if (!alive()) return null;
    if (!peekFor(c.y, c.m, staff)) {
      scheduleFor(c.y, c.m, staff); // its history is already cached (previous iteration) so this plans just one month
      await tick();
    }
  }
  return scheduleFor(y, m, staff);
}

/** Cells the manager locked ("this stays as I put it"): staffId -> date -> true. Kept on this device. */
export type Locks = Record<string, Record<string, boolean>>;
const locksKey = (y: number, m: number) => `horarios:locks:${y}-${m}`;

export function readLocks(y: number, m: number): Locks {
  try {
    return JSON.parse(localStorage.getItem(locksKey(y, m)) ?? "{}") as Locks;
  } catch {
    return {};
  }
}

export function writeLocks(y: number, m: number, locks: Locks) {
  try {
    localStorage.setItem(locksKey(y, m), JSON.stringify(locks));
  } catch {}
}

export function setLocked(locks: Locks, cells: { staffId: string; date: string }[], on: boolean): Locks {
  const next: Locks = { ...locks };
  for (const { staffId, date } of cells) {
    const row = { ...next[staffId] };
    if (on) row[date] = true;
    else delete row[date];
    next[staffId] = row;
  }
  return next;
}

export const lockedCount = (locks: Locks) => Object.values(locks).reduce((n, row) => n + Object.keys(row).length, 0);
