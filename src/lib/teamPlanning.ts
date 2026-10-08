import { readRules } from "./rulesStore";
import type { Rules } from "./domain/ruleset";
import { monthDates } from "./domain/dates";
import { planRestructure, type Plan } from "./domain/repair";
import type { Schedule, Staff } from "./domain/types";
import { sortBySections } from "./domain/team";
import { readQueue, writeQueue } from "./useRemoteSchedule";
import { clearScheduleCache, historyFor, nextStored, readLocks, readStored, scheduleFor, storageKey, type Locks } from "./monthStore";
import { remoteConfigured } from "./supabase";
import { coalesce, diffSchedules } from "./sync";
import { writeRoster } from "./staffStore";

/** Where the planner gets its data from (the real stores by default; tests inject their own). */
export interface PlanningDeps {
  /** Months the user has saved. */
  storedMonths: () => { y: number; m: number }[];
  scheduleFor: (y: number, m: number, staff: Staff[]) => Schedule;
  historyFor: (y: number, m: number, staff: Staff[]) => Schedule | undefined;
  nextStored: (y: number, m: number) => Schedule | undefined;
  locksFor: (y: number, m: number) => Locks;
  rules?: () => Rules;
}

const storedMonthsFromStorage = (): { y: number; m: number }[] => {
  const out: { y: number; m: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const hit = /^horarios:(\d{4})-(\d{1,2})$/.exec(localStorage.key(i) ?? "");
      if (hit) out.push({ y: Number(hit[1]), m: Number(hit[2]) });
    }
  } catch {}
  return out;
};

export const realDeps: PlanningDeps = { storedMonths: storedMonthsFromStorage, scheduleFor, historyFor, nextStored, locksFor: readLocks, rules: readRules };

const keyOf = (c: { y: number; m: number }) => c.y * 100 + c.m;

/** The month of `today` plus every month saved after it: those are the ones a team change can affect. */
export function monthsToReplan(today: string, deps: PlanningDeps = realDeps): { y: number; m: number }[] {
  const cur = { y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) };
  const later = deps.storedMonths().filter((c) => keyOf(c) > keyOf(cur));
  return [cur, ...later].sort((a, b) => keyOf(a) - keyOf(b));
}

export interface MonthPlan {
  y: number;
  m: number;
  plan: Plan;
}

/** Plans a change of team over every affected month; each month continues from the previous plan. */
export function planTeamChange(oldStaff: Staff[], newStaff: Staff[], today: string, deps: PlanningDeps = realDeps): MonthPlan[] {
  const out: MonthPlan[] = [];
  let previous: Schedule | undefined;
  for (const { y, m } of monthsToReplan(today, deps)) {
    const plan = planRestructure(
      {
        year: y,
        month: m,
        staff: oldStaff,
        schedule: deps.scheduleFor(y, m, oldStaff),
        today,
        history: previous ?? deps.historyFor(y, m, oldStaff),
        next: deps.nextStored(y, m),
        locked: deps.locksFor(y, m),
        rules: deps.rules?.(),
      },
      newStaff,
      `${y}-${String(m).padStart(2, "0")}-01`,
    );
    out.push({ y, m, plan });
    previous = plan.schedule;
  }
  return out;
}

/** Saves the new team and the re-planned months on this device (and queues them for Supabase). */
export function applyTeamChange(newStaff: Staff[], plans: MonthPlan[]) {
  writeRoster(sortBySections(newStaff));
  for (const { y, m, plan } of plans) {
    const before = readStored(y, m);
    try {
      localStorage.setItem(storageKey(y, m), JSON.stringify(plan.schedule));
    } catch {}
    if (remoteConfigured) {
      const rows = diffSchedules(before ?? {}, plan.schedule).filter((r) => monthDates(y, m).includes(r.day));
      if (rows.length) writeQueue(coalesce([...readQueue(), ...rows]));
    }
  }
  clearScheduleCache();
}
