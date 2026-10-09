import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { planDayOff, type RepairContext } from "./repair";
import { suggestFor } from "./suggest";
import { validateSchedule } from "./validate";

const Y = 2026;
const M = 11;
const d = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const base = generateSchedule({ year: Y, month: M, staff: DEFAULT_STAFF }).schedule;

/** Everyone's cells locked, so nothing can move to cover a day off. */
const allLocked = Object.fromEntries(DEFAULT_STAFF.map((s) => [s.id, Object.fromEntries(Object.keys(base[s.id]).map((x) => [x, true]))]));
const ctx = (extra: Partial<RepairContext> = {}): RepairContext => ({ year: Y, month: M, staff: DEFAULT_STAFF, schedule: base, ...extra });
const who = DEFAULT_STAFF.find((s) => s.role === "receptionist" && !["D", "V", "B"].includes(base[s.id][d(14)]))!;

describe("qué hacer cuando no cuadra", () => {
  it("a green plan needs no suggestions", () => {
    const c = ctx();
    expect(suggestFor(c, planDayOff(c, who.id, d(14)), (x) => planDayOff(x, who.id, d(14)))).toEqual([]);
  });

  it("locks in the way: says which cells to release, and releasing them really works", () => {
    // the asked day is the only thing unlocked
    const locked = JSON.parse(JSON.stringify(allLocked));
    delete locked[who.id][d(14)];
    const c = ctx({ locked });
    const run = (x: RepairContext) => planDayOff(x, who.id, d(14));
    const plan = run(c);
    expect(plan.level).toBe("red");
    const tips = suggestFor(c, plan, run);
    const unlock = tips.find((t) => t.kind === "unlock");
    expect(unlock).toBeTruthy();
    expect(unlock!.cells!.length).toBeGreaterThan(0);
    // verified: with exactly those cells released the plan is not red and the month stays valid
    const freed = JSON.parse(JSON.stringify(locked));
    for (const cell of unlock!.cells!) delete freed[cell.staffId][cell.date];
    const after = run(ctx({ locked: freed }));
    expect(after.level).not.toBe("red");
    expect(validateSchedule(after.schedule, DEFAULT_STAFF, Y, M).issues).toEqual([]);
  });

  it("a rule that gives a little: only offered when planning with it really works", () => {
    const c = ctx();
    const tips = suggestFor(c, { level: "red", strategy: "none", schedule: base, changes: [], issues: [], warnings: [], pins: [] }, (x) => ({
      level: x.rules?.maxRestRun === 4 ? "green" : "red",
      strategy: "none",
      schedule: base,
      changes: [],
      issues: [],
      warnings: [],
      pins: [],
    }));
    expect(tips).toHaveLength(1);
    expect(tips[0]).toMatchObject({ kind: "rule", rule: { maxRestRun: 4 } });
  });
});
