import { generateOnce } from "./generator";
import { monthDates, toISO } from "./dates";
import { allowedShifts } from "./rules";
import { isActive, isOff, type Schedule, type ShiftCode, type Staff, type Warning } from "./types";
import { validateSchedule, type Issue } from "./validate";

export interface RepairContext {
  year: number;
  month: number;
  staff: Staff[];
  /** The schedule being changed. */
  schedule: Schedule;
  /** Today (YYYY-MM-DD). Days before today + protectedDays are never changed automatically. */
  today?: string;
  protectedDays?: number;
  /** Cells the manager locked: staffId -> date -> true. */
  locked?: Record<string, Record<string, boolean>>;
}

export interface CellChange {
  staffId: string;
  date: string;
  from: ShiftCode | undefined;
  to: ShiftCode;
}

export type Level = "green" | "amber" | "red";

export interface Plan {
  /** green: valid and clean · amber: valid but needs a 6th day / senior over cap · red: some rule still broken */
  level: Level;
  strategy: "none" | "swap" | "window" | "restructure";
  schedule: Schedule;
  changes: CellChange[];
  issues: Issue[];
  warnings: Warning[];
  reason?: string;
}

const HARD: Issue["kind"][] = ["coverage", "forbidden", "rest", "streak", "restStreak"];
const issueKey = (i: Issue) => `${i.kind}|${i.staffId ?? ""}|${i.date}|${i.message}`;
const SEEDS = 8;
/** From "keep the rotation pattern" to "change as few cells as possible". */
const KEEP_LEVELS = [80, 250, 1000];
const RADII = [3, 7, 14, Infinity];

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

/** First day that may still be changed automatically (null = all of them). */
export function firstEditable(ctx: Pick<RepairContext, "today" | "protectedDays">): string | null {
  return ctx.today ? addDays(ctx.today, (ctx.protectedDays ?? 2) + 1) : null;
}

function diff(ctx: RepairContext, next: Schedule): CellChange[] {
  const out: CellChange[] = [];
  for (const s of ctx.staff) {
    if (!ctx.schedule[s.id]) continue; // a new person has no "before": listing their whole month would only be noise
    for (const date of monthDates(ctx.year, ctx.month)) {
      const to = next[s.id]?.[date];
      const from = ctx.schedule[s.id]?.[date];
      if (to && to !== from) out.push({ staffId: s.id, date, from, to });
    }
  }
  return out;
}

const baseIssueKeys = (ctx: RepairContext) =>
  new Set(validateSchedule(ctx.schedule, ctx.staff, ctx.year, ctx.month).issues.map(issueKey));

/** Hard issues that did not exist before the change (so pre-existing manual quirks don't block it). */
function newHard(ctx: RepairContext, next: Schedule, known: Set<string> | null): Issue[] {
  return validateSchedule(next, ctx.staff, ctx.year, ctx.month).issues.filter(
    (i) => HARD.includes(i.kind) && (!known || !known.has(issueKey(i))),
  );
}

function levelOf(hard: Issue[], soft: Warning[]): Level {
  return hard.length ? "red" : soft.some((w) => w.kind !== "coverage") ? "amber" : "green";
}

function reasonFor(hard: Issue[]): string | undefined {
  if (!hard.length) return undefined;
  const first = hard.slice(0, 2).map((i) => i.message).join(" · ");
  return `No se puede cuadrar sin romper reglas: ${first}${hard.length > 2 ? ` (+${hard.length - 2} más)` : ""}`;
}

/** Cells to freeze: everything outside [from, to] (and before the editable day, and locked cells). */
function freeze(ctx: RepairContext, staff: Staff[], from: string, to: string): Record<string, Record<string, ShiftCode>> {
  const first = firstEditable(ctx);
  const pinned: Record<string, Record<string, ShiftCode>> = {};
  for (const s of staff)
    for (const date of monthDates(ctx.year, ctx.month)) {
      const code = ctx.schedule[s.id]?.[date];
      if (!code) continue;
      const inside = date >= from && date <= to && (!first || date >= first);
      if (!inside || ctx.locked?.[s.id]?.[date]) (pinned[s.id] ??= {})[date] = code;
    }
  return pinned;
}

interface Candidate {
  schedule: Schedule;
  warnings: Warning[];
  hard: Issue[];
  changes: number;
}

/** Plans the month again with `pinned` fixed, trying a few seeds and keeping the one that disturbs the least. */
function replan(ctx: RepairContext, staff: Staff[], pinned: Record<string, Record<string, ShiftCode>>, known: Set<string> | null): Candidate | null {
  const night = staff.find((s) => s.role === "night_auditor");
  let best: Candidate | null = null;
  for (const keep of KEEP_LEVELS)
  for (let seed = 0; seed < SEEDS; seed++) {
    const r = generateOnce({
      baselineKeep: keep,
      year: ctx.year,
      month: ctx.month,
      staff,
      seed,
      pinned,
      baseline: ctx.schedule,
      jcRestDays: night
        ? monthDates(ctx.year, ctx.month).filter((x) => ctx.schedule[night.id]?.[x] === "D")
        : undefined,
    });
    const cand: Candidate = {
      schedule: r.schedule,
      warnings: r.warnings,
      hard: newHard({ ...ctx, staff }, r.schedule, known),
      changes: diff({ ...ctx, staff }, r.schedule).length,
    };
    const soft = (c: Candidate) => c.warnings.filter((w) => w.kind !== "coverage").length;
    if (
      !best ||
      cand.hard.length < best.hard.length ||
      (cand.hard.length === best.hard.length && (soft(cand) < soft(best) || (soft(cand) === soft(best) && cand.changes < best.changes)))
    )
      best = cand;
  }
  return best;
}

/**
 * The re-plan often changes more than it needs to. Try to put cells back to how they were, a whole day at a
 * time (and then pair by pair), keeping every change that still leaves the month valid.
 */
function shrink(ctx: RepairContext, staff: Staff[], schedule: Schedule, known: Set<string> | null, fixed: Set<string>): Schedule {
  let current = schedule;
  const ok = (cand: Schedule) => newHard({ ...ctx, staff }, cand, known).length === 0;
  const withBack = (s: Schedule, cells: CellChange[]) => {
    const next: Schedule = { ...s };
    for (const c of cells) next[c.staffId] = { ...next[c.staffId], [c.date]: c.from! };
    return next;
  };
  if (!ok(current)) return current; // only shrink valid plans
  for (let pass = 0; pass < 3; pass++) {
    let improved = false;
    const changes = diff({ ...ctx, staff }, current).filter((c) => c.from && !fixed.has(`${c.staffId}|${c.date}`));
    const byDate = new Map<string, CellChange[]>();
    for (const c of changes) byDate.set(c.date, [...(byDate.get(c.date) ?? []), c]);
    for (const [, group] of byDate) {
      const whole = withBack(current, group);
      if (ok(whole)) {
        current = whole;
        improved = true;
        continue;
      }
      for (let i = 0; i < group.length; i++)
        for (let j = i + 1; j < group.length; j++) {
          const pair = withBack(current, [group[i], group[j]]);
          if (ok(pair)) {
            current = pair;
            improved = true;
          }
        }
    }
    if (!improved) break;
  }
  return current;
}

/**
 * Two people swap a working day for a day off: the requester gets `date` free and works one of their own
 * rest days instead; the partner does the opposite. Only 4 cells change and everyone's rest total stays the same.
 */
function trySwap(ctx: RepairContext, who: string, date: string, known: Set<string>): Plan | null {
  const first = firstEditable(ctx);
  const editable = (id: string, x: string) => (!first || x >= first) && !ctx.locked?.[id]?.[x];
  const dates = monthDates(ctx.year, ctx.month);
  const mine = ctx.schedule[who]?.[date];
  const me = ctx.staff.find((s) => s.id === who);
  if (!me || !mine || isOff(mine) || !editable(who, date)) return null;
  const myRests = dates.filter((x) => ctx.schedule[who][x] === "D" && editable(who, x) && isActive(me, x));
  let best: { plan: Plan; dist: number } | null = null;

  for (const partner of ctx.staff) {
    if (partner.id === who || !isActive(partner, date)) continue;
    if (ctx.schedule[partner.id]?.[date] !== "D" || !editable(partner.id, date)) continue;
    if (!allowedShifts(partner).includes(mine)) continue;
    for (const r of myRests) {
      const theirs = ctx.schedule[partner.id]?.[r];
      if (!theirs || isOff(theirs) || !editable(partner.id, r) || !isActive(partner, r)) continue;
      if (!allowedShifts(me).includes(theirs)) continue;
      const next: Schedule = { ...ctx.schedule };
      next[who] = { ...next[who], [date]: "D", [r]: theirs };
      next[partner.id] = { ...next[partner.id], [date]: mine, [r]: "D" };
      if (newHard(ctx, next, known).length) continue;
      const dist = Math.abs(dates.indexOf(r) - dates.indexOf(date));
      if (!best || dist < best.dist)
        best = { dist, plan: { level: "green", strategy: "swap", schedule: next, changes: diff(ctx, next), issues: [], warnings: [] } };
    }
  }
  return best?.plan ?? null;
}

/**
 * A day off (D) or a range of holidays (V) for one person, planned with the fewest changes.
 * A single libre day is first tried as a swap; otherwise a growing window around it is re-planned.
 */
export function planDayOff(ctx: RepairContext, staffId: string, from: string, kind: "D" | "V" = "D", to: string = from): Plan {
  const person = ctx.staff.find((s) => s.id === staffId);
  const days = monthDates(ctx.year, ctx.month).filter((x) => x >= from && x <= to);
  const none = (level: Level, reason?: string): Plan => ({ level, strategy: "none", schedule: ctx.schedule, changes: [], issues: [], warnings: [], reason });
  if (!person || !days.length) return none("red", "Persona o fechas no válidas");

  const first = firstEditable(ctx);
  const alreadyOff = days.every((x) => isOff(ctx.schedule[staffId]?.[x]) && (kind === "D" || ctx.schedule[staffId][x] === "V"));
  if (alreadyOff) return none("green");
  if (first && days.some((x) => x < first && !isOff(ctx.schedule[staffId]?.[x])))
    return none("red", `Esos días están protegidos (pasados o de los próximos ${ctx.protectedDays ?? 2} días); no se cambian solos.`);
  if (days.some((x) => ctx.locked?.[staffId]?.[x])) return none("red", "Alguno de esos días está bloqueado.");

  const known = baseIssueKeys(ctx);
  if (kind === "D" && days.length === 1) {
    const swap = trySwap(ctx, staffId, from, known);
    if (swap) return swap;
  }

  let best: Candidate | null = null;
  for (const radius of RADII) {
    const a = radius === Infinity ? days[0] : addDays(days[0], -radius);
    const b = radius === Infinity ? "9999-12-31" : addDays(days.at(-1)!, radius);
    const pinned = freeze(ctx, ctx.staff, a, b);
    for (const x of days) (pinned[staffId] ??= {})[x] = kind;
    const cand = replan(ctx, ctx.staff, pinned, known);
    if (cand && (!best || cand.hard.length < best.hard.length)) best = cand;
    if (best && best.hard.length === 0) break;
  }
  const cand = best!;
  const requested = new Set(days.map((x) => `${staffId}|${x}`));
  const lean = shrink(ctx, ctx.staff, cand.schedule, known, requested);
  const level = levelOf(cand.hard, cand.warnings);
  return {
    level,
    strategy: "window",
    schedule: lean,
    changes: diff(ctx, lean),
    issues: cand.hard,
    warnings: cand.warnings,
    reason: reasonFor(cand.hard),
  };
}

/**
 * The team changed (someone left, joined, changed puesto or dates): re-plan from `from` onwards,
 * keeping everything before it exactly as it was.
 */
export function planRestructure(ctx: RepairContext, newStaff: Staff[], from: string): Plan {
  const first = firstEditable(ctx);
  const start = first && first > from ? first : from;
  const pinned = freeze({ ...ctx, staff: newStaff }, newStaff, start, "9999-12-31");
  const cand = replan({ ...ctx, staff: newStaff }, newStaff, pinned, null)!;
  const lean = shrink({ ...ctx, staff: newStaff }, newStaff, cand.schedule, null, new Set());
  return {
    level: levelOf(cand.hard, cand.warnings),
    strategy: "restructure",
    schedule: lean,
    changes: diff({ ...ctx, staff: newStaff }, lean),
    issues: cand.hard,
    warnings: cand.warnings,
    reason: reasonFor(cand.hard),
  };
}
