import type { Rules } from "./domain/ruleset";
import type { ShiftRequest } from "./domain/requests";
import type { MonthState } from "./domain/monthStatus";
import { toMonthRow } from "./monthStateSync";
import { toRequestRow, type RequestRow } from "./requestsSync";
import { locksToRows, type LockRow } from "./locksSync";
import { scheduleToRows, type Row } from "./sync";
import { toRulesRow } from "./rulesSync";
import type { Schedule, Staff } from "./domain/types";
import { toStaffRows } from "./staffSync";
import type { Locks } from "./monthStore";

type Store = Pick<Storage, "getItem" | "key" | "length">;

export interface LocalData {
  months: { y: number; m: number; schedule: Schedule }[];
  locks: { y: number; m: number; locks: Locks }[];
  states: { y: number; m: number; state: MonthState }[];
  requests: ShiftRequest[];
  rules: Rules | null;
  /** The team edited on this device (people must exist on the server before their cells). */
  team: Staff[] | null;
}

const parse = <T,>(raw: string | null): T | null => {
  try {
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
};

/** Everything this device holds that the server may not have yet. */
export function collectLocal(store: Store): LocalData {
  const out: LocalData = { months: [], locks: [], states: [], requests: [], rules: null, team: null };
  for (let i = 0; i < store.length; i++) {
    const k = store.key(i) ?? "";
    let hit = /^horarios:(\d{4})-(\d{1,2})$/.exec(k);
    if (hit) {
      const schedule = parse<Schedule>(store.getItem(k));
      if (schedule) out.months.push({ y: Number(hit[1]), m: Number(hit[2]), schedule });
      continue;
    }
    hit = /^horarios:locks:(\d{4})-(\d{1,2})$/.exec(k);
    if (hit) {
      const locks = parse<Locks>(store.getItem(k));
      if (locks && locksToRows(locks).length) out.locks.push({ y: Number(hit[1]), m: Number(hit[2]), locks });
      continue;
    }
    hit = /^horarios:status:(\d{4})-(\d{1,2})$/.exec(k);
    if (hit) {
      const state = parse<MonthState>(store.getItem(k));
      if (state) out.states.push({ y: Number(hit[1]), m: Number(hit[2]), state });
    }
  }
  out.requests = parse<ShiftRequest[]>(store.getItem("horarios:requests")) ?? [];
  out.rules = parse<Rules>(store.getItem("horarios:rules"));
  out.team = parse<Staff[]>(store.getItem("horarios:team"));
  out.months.sort((a, b) => a.y * 100 + a.m - (b.y * 100 + b.m));
  return out;
}

export const hasLocalData = (d: LocalData) => d.months.length + d.requests.length + d.locks.length + d.states.length > 0 || d.rules !== null;

export function describeLocal(d: LocalData) {
  return { months: d.months.length, requests: d.requests.length, locks: d.locks.reduce((n, l) => n + locksToRows(l.locks).length, 0) };
}

/** Rows to send, table by table. */
export function buildUploads(d: LocalData) {
  return {
    team: d.team ? toStaffRows(d.team) : [],
    cells: d.months.flatMap((x): Row[] => scheduleToRows(x.schedule)),
    requests: d.requests.map((r): RequestRow => toRequestRow(r)),
    locks: d.locks.flatMap((x): LockRow[] => locksToRows(x.locks)),
    months: d.states.map((x) => toMonthRow(x.y, x.m, x.state)),
    rules: d.rules ? toRulesRow(d.rules) : null,
  };
}

interface Client {
  from: (table: string) => { upsert: (rows: never, opts?: { onConflict?: string }) => PromiseLike<{ error: { message: string } | null }> };
}

const chunks = <T,>(xs: T[], n: number) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

/**
 * Sends the local data to the server, table by table (people before cells, because cells point at people).
 * Stops at the first error and says where, so nothing is silently half-uploaded.
 */
export async function uploadAll(sb: Client, d: LocalData): Promise<{ ok: true; counts: { cells: number; requests: number; locks: number } } | { ok: false; error: string }> {
  const u = buildUploads(d);
  const steps: { table: string; rows: unknown[]; onConflict: string }[] = [
    { table: "staff", rows: u.team, onConflict: "id" },
    { table: "monthly_schedule", rows: u.cells, onConflict: "staff_id,day" },
    { table: "requests", rows: u.requests, onConflict: "id" },
    { table: "locked_cells", rows: u.locks, onConflict: "staff_id,day" },
    { table: "schedule_months", rows: u.months, onConflict: "year,month" },
    ...(u.rules ? [{ table: "app_rules", rows: [u.rules], onConflict: "id" }] : []),
  ];
  for (const step of steps)
    for (const part of chunks(step.rows, 500)) {
      const { error } = await sb.from(step.table).upsert(part as never, { onConflict: step.onConflict });
      if (error) return { ok: false, error: `${step.table}: ${error.message}` };
    }
  return { ok: true, counts: { cells: u.cells.length, requests: u.requests.length, locks: u.locks.length } };
}

/** Which keys "discard what is on this device" removes (everything of the app except the pending-upload queue and the link flag). */
export const isLocalDataKey = (k: string) => k.startsWith("horarios:") && k !== "horarios:queue" && !k.startsWith("horarios:linked");
