import { describe, expect, it } from "vitest";
import { monthsToReplan, planTeamChange, type PlanningDeps } from "./teamPlanning";
import { DEFAULT_STAFF } from "./domain/roster";
import { generateSchedule } from "./domain/generator";
import type { Schedule, Staff } from "./domain/types";

const mk = (y: number, m: number, history?: Schedule) => generateSchedule({ year: y, month: m, staff: DEFAULT_STAFF, history }).schedule;
const oct = mk(2026, 10);
const nov = mk(2026, 11, oct);
const dec = mk(2026, 12, nov);

function deps(stored: Record<string, Schedule>): PlanningDeps {
  const key = (y: number, m: number) => `${y}-${m}`;
  return {
    storedMonths: () => Object.keys(stored).map((k) => ({ y: Number(k.split("-")[0]), m: Number(k.split("-")[1]) })),
    scheduleFor: (y, m) => stored[key(y, m)] ?? mk(y, m),
    historyFor: (y, m) => stored[key(y === 2026 && m === 1 ? 2025 : y, m === 1 ? 12 : m - 1)],
    nextStored: (y, m) => stored[key(m === 12 ? y + 1 : y, m === 12 ? 1 : m + 1)],
    locksFor: () => ({}),
  };
}

describe("which months a team change touches", () => {
  it("the current month plus the months the user has saved after it (never earlier ones)", () => {
    const d = deps({ "2026-09": mk(2026, 9), "2026-10": oct, "2026-12": dec });
    expect(monthsToReplan("2026-10-08", d)).toEqual([{ y: 2026, m: 10 }, { y: 2026, m: 12 }]);
  });

  it("just the current month when nothing later is saved", () => {
    expect(monthsToReplan("2026-10-08", deps({}))).toEqual([{ y: 2026, m: 10 }]);
  });
});

describe("planTeamChange", () => {
  const d = deps({ "2026-10": oct, "2026-11": nov });
  const marcosLeaves = (from: string): Staff[] => DEFAULT_STAFF.map((s) => (s.id === "marcos" ? { ...s, activeTo: from } : s));

  it("re-plans every affected month, in order, each continuing from the previous one", () => {
    const plans = planTeamChange(DEFAULT_STAFF, marcosLeaves("2026-10-20"), "2026-10-08", d);
    expect(plans.map((p) => `${p.y}-${p.m}`)).toEqual(["2026-10", "2026-11"]);
    // after his baja he is "B" in both months
    expect(plans[0].plan.schedule.marcos["2026-10-25"]).toBe("B");
    expect(plans[1].plan.schedule.marcos["2026-11-10"]).toBe("B");
    // October before the first editable day is untouched
    for (const day of ["2026-10-01", "2026-10-09", "2026-10-11"]) expect(plans[0].plan.schedule.marta[day]).toBe(oct.marta[day]);
  });

  it("an added person starts on the first editable day and is not listed as a change", () => {
    const temp: Staff = { id: "temp", name: "Refuerzo", role: "receptionist", activeFrom: "2026-10-11" };
    const plans = planTeamChange(DEFAULT_STAFF, [...DEFAULT_STAFF, temp], "2026-10-08", d);
    expect(plans[0].plan.changes.some((c) => c.staffId === "temp")).toBe(false);
    expect(plans[0].plan.schedule.temp["2026-10-05"]).toBe("B");
  });
});
