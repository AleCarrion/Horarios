import { monthDates } from "./dates";
import { restBetween } from "./hours";
import { allowedShifts } from "./rules";
import { DEFAULT_RULES, type Rules } from "./ruleset";
import { isActive, isFixedCell, type Schedule, type Staff } from "./types";
import { validateSchedule, type Issue } from "./validate";

/** How bad each kind of problem is (coverage never changes here: a swap keeps every day's people per shift). */
const WEIGHT: Record<Issue["kind"], number> = {
  coverage: 10000,
  forbidden: 5000,
  streak: 400,
  rest: 400,
  weeklyRest: 200,
  restStreak: 120,
  monthlyRest: 100,
};
const MAX_SENIOR_COVERS = 6;

export interface ImproveOptions {
  rules?: Rules;
  history?: Schedule;
  /** Cells that must not move (pinned, locked, holidays, outside the roster…). */
  frozen?: (staffId: string, date: string) => boolean;
  /** Stop after checking this many candidate months (a count, not a clock, so the result is always the same). */
  maxChecks?: number;
}


/**
 * The greedy planner gets the month almost right; this pass removes what is left of the personal rules (days in a row, rest
 * between shifts, weekly rest, libres per month) by exchanging two people's shifts on the same day. Every day keeps exactly the
 * same shifts covered, so coverage never gets worse; a swap is kept only if the month as a whole gets better.
 */
export function improveSchedule(schedule: Schedule, staff: Staff[], year: number, month: number, opts: ImproveOptions = {}): Schedule {
  const rules = opts.rules ?? DEFAULT_RULES;
  const dates = monthDates(year, month);
  let checks = opts.maxChecks ?? 2500;
  const spent = () => checks <= 0;
  const cur: Schedule = Object.fromEntries(Object.entries(schedule).map(([id, row]) => [id, { ...row }]));
  // mozos keep their 5-5 cycle and the director her weekdays: only people who rotate shifts are exchanged
  const movable = staff.filter((s) => s.role !== "mozo" && s.role !== "director");
  const allowed = new Map(staff.map((s) => [s.id, new Set(allowedShifts(s))]));
  const byId = new Map(staff.map((s) => [s.id, s]));

  const issuesOf = (s: Schedule) => {
    checks--;
    return validateSchedule(s, staff, year, month, opts.history, rules).issues;
  };
  const costOf = (issues: Issue[], s: Schedule) => {
    let c = 0;
    for (const i of issues) {
      // libres over the monthly limit count one by one, so moving a single day already counts as progress
      if (i.kind === "monthlyRest") {
        const extra = dates.filter((d) => s[i.staffId!]?.[d] === "D").length - rules.maxMonthlyRest;
        c += WEIGHT.monthlyRest * Math.max(1, extra);
      } else c += WEIGHT[i.kind];
    }
    // a senior who covers too many mornings/afternoons is unfair on her (the generator's own cap)
    for (const p of staff)
      if (p.role === "senior") {
        const covers = dates.filter((d) => s[p.id]?.[d] === "M" || s[p.id]?.[d] === "T").length;
        c += Math.max(0, covers - (p.maxCovers ?? MAX_SENIOR_COVERS)) * 300;
      }
    // the two seniors never rest the same day (there is always someone on partido)
    const seniors = staff.filter((p) => p.role === "senior");
    if (seniors.length === 2)
      for (const d of dates) if (seniors.every((p) => s[p.id]?.[d] === "D")) c += 150;
    // the Estatuto's 12 h between shifts is what the planner aims for even when the hotel allows 10
    for (const p of staff) {
      const row = s[p.id] ?? {};
      for (let i = 1; i < dates.length; i++) {
        const gap = restBetween(row[dates[i - 1]], dates[i - 1], row[dates[i]], dates[i]);
        if (gap !== null && gap < 12 * 60) c += 30;
      }
    }
    return c;
  };

  const free = (p: Staff, d: string) => !opts.frozen?.(p.id, d) && isActive(p, d) && !isFixedCell(cur[p.id]?.[d]);
  const can = (p: Staff, code: string) => allowed.get(p.id)!.has(code);
  type Move = [string, string, string][]; // [staffId, date, new code]

  /** Changes that keep every day's covered shifts: exchanging two people's shifts, a senior taking or handing back a cover, a senior's partido/libre. */
  const movesFor = (p: Staff, d: string): Move[] => {
    if (!free(p, d)) return [];
    const a = cur[p.id][d];
    const out: Move[] = [];
    for (const q of movable) {
      if (q.id === p.id || !free(q, d)) continue;
      const b = cur[q.id][d];
      if (a !== b && can(p, b) && can(q, a)) out.push([[p.id, d, b], [q.id, d, a]]);
      // a senior hands her cover to p (who was resting) and goes back to partido, or takes p's cover instead of her partido
      if (q.role === "senior" && a === "D" && (b === "M" || b === "T") && can(p, b)) out.push([[p.id, d, b], [q.id, d, "P"]]);
      if (q.role === "senior" && b === "P" && (a === "M" || a === "T") && can(q, a)) out.push([[p.id, d, "D"], [q.id, d, a]]);
    }
    // a senior can work partido instead of resting, or rest instead of partido (nothing else depends on it)
    if (p.role === "senior" && (a === "D" || a === "P")) out.push([[p.id, d, a === "D" ? "P" : "D"]]);
    return out;
  };
  const apply = (m: Move) => {
    const before = m.map(([id, d]) => [id, d, cur[id][d]] as [string, string, string]);
    for (const [id, d, c] of m) cur[id][d] = c;
    return before;
  };

  let issues = issuesOf(cur);
  let cost = costOf(issues, cur);

  const twoSteps = (p: Staff): boolean => {
    for (const d1 of dates) {
      for (const m1 of movesFor(p, d1)) {
        const undo1 = apply(m1);
        const mid = costOf(issuesOf(cur), cur);
        if (mid <= cost) {
          // whoever got the extra day off passes one on
          for (const [qid] of m1) {
            if (qid === p.id) continue;
            const q = byId.get(qid)!;
            for (const d2 of dates) {
              if (d2 === d1) continue;
              for (const m2 of movesFor(q, d2)) {
                const undo2 = apply(m2);
                const nextIssues = issuesOf(cur);
                const next = costOf(nextIssues, cur);
                if (next < cost) {
                  issues = nextIssues;
                  cost = next;
                  return true;
                }
                apply(undo2);
                if (spent()) {
                  apply(undo1);
                  return false;
                }
              }
            }
          }
        }
        apply(undo1);
        if (spent()) return false;
      }
    }
    return false;
  };
  for (let round = 0; round < 80 && !spent(); round++) {
    const personal = issues
      .filter((i) => i.staffId && i.kind !== "coverage" && movable.some((s) => s.id === i.staffId))
      .sort((a, b) => WEIGHT[b.kind] - WEIGHT[a.kind]);
    if (!personal.length) break;
    let improved = false;
    search: for (const issue of personal) {
      const p = byId.get(issue.staffId!)!;
      const at = dates.indexOf(issue.date);
      // libres per month can be moved anywhere in the month; the rest are fixed near where they happen
      const days = issue.kind === "monthlyRest" ? dates : dates.slice(Math.max(0, at - 7), at + 6);
      for (const d of days) {
        for (const m of movesFor(p, d)) {
          const undo = apply(m);
          const nextIssues = issuesOf(cur);
          const next = costOf(nextIssues, cur);
          if (next < cost) {
            issues = nextIssues;
            cost = next;
            improved = true;
            break search;
          }
          apply(undo);
          if (spent()) break search;
        }
      }
    }
    if (!improved) {
      // Too many libres often needs two steps: p hands a day off to q (no better yet), then q hands one on to someone with room.
      const over = personal.find((i) => i.kind === "monthlyRest");
      if (over && twoSteps(byId.get(over.staffId!)!)) continue;
      break;
    }
  }
  return cur;
}
