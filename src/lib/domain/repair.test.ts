import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates } from "./dates";
import { planDayOff, planRestructure, type RepairContext } from "./repair";
import { isOff, type Schedule, type Staff } from "./types";
import { validateSchedule } from "./validate";

const Y = 2026;
const M = 11; // November: the user's example is "14 de noviembre"
const dates = monthDates(Y, M);
const d = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const base = generateSchedule({ year: Y, month: M, staff: DEFAULT_STAFF }).schedule;
const ctx = (extra: Partial<RepairContext> = {}): RepairContext => ({ year: Y, month: M, staff: DEFAULT_STAFF, schedule: base, ...extra });
const receptionists = DEFAULT_STAFF.filter((s) => s.role === "receptionist");
const changedCells = (a: Schedule, b: Schedule) =>
  Object.keys(a).flatMap((id) => dates.filter((x) => a[id][x] !== b[id]?.[x]).map((x) => `${id}|${x}`));

describe("libre solicitado = mover el descanso (swap)", () => {
  it("the user's example: a receptionist asks for 14 November", () => {
    // pick someone who works that day
    const who = receptionists.find((r) => !isOff(base[r.id][d(14)]))!;
    const plan = planDayOff(ctx(), who.id, d(14));
    expect(plan.level).toBe("green");
    expect(plan.schedule[who.id][d(14)]).toBe("D");
    expect(validateSchedule(plan.schedule, DEFAULT_STAFF, Y, M).issues).toEqual([]);
  });

  it("is resolved by swapping two people's day on/day off: exactly 4 cells change", () => {
    const who = receptionists.find((r) => !isOff(base[r.id][d(14)]))!;
    const plan = planDayOff(ctx(), who.id, d(14));
    expect(plan.strategy).toBe("swap");
    expect(plan.changes).toHaveLength(4);
    // the requester gains the day and loses one of their own rest days (rest total unchanged)
    const rest = (s: Schedule) => dates.filter((x) => s[who.id][x] === "D").length;
    expect(rest(plan.schedule)).toBe(rest(base));
    expect(changedCells(base, plan.schedule)).toHaveLength(4);
  });

  it("asking for a day you already have off changes nothing", () => {
    const who = receptionists.find((r) => base[r.id][d(14)] === "D");
    if (!who) return; // nobody rests that day in this seed
    const plan = planDayOff(ctx(), who.id, d(14));
    expect(plan.strategy).toBe("none");
    expect(plan.changes).toEqual([]);
  });

  it("works for every receptionist and every day of the month (never an unexplained red)", () => {
    let green = 0;
    let total = 0;
    for (const r of receptionists)
      for (const date of dates) {
        if (isOff(base[r.id][date])) continue;
        const plan = planDayOff(ctx(), r.id, date);
        total++;
        if (plan.level === "green") green++;
        else expect(plan.reason).toBeTruthy();
        // whatever the level, the requested day is respected
        expect(plan.schedule[r.id][date]).toBe("D");
      }
    expect(green / total).toBeGreaterThan(0.85);
  });
});

describe("protected days and locked cells", () => {
  it("refuses days that are in the past or too close, and never touches them", () => {
    const today = d(10);
    const who = receptionists.find((r) => !isOff(base[r.id][d(11)]))!;
    const tooSoon = planDayOff(ctx({ today, protectedDays: 2 }), who.id, d(11));
    expect(tooSoon.level).toBe("red");
    expect(tooSoon.reason).toMatch(/protegid|pasado|pronto/i);
    expect(tooSoon.changes).toEqual([]);
  });

  it("changes nothing before the first editable day, whatever the strategy", () => {
    const today = d(10);
    const who = receptionists.find((r) => !isOff(base[r.id][d(20)]))!;
    const plan = planDayOff(ctx({ today, protectedDays: 2 }), who.id, d(20));
    for (const c of plan.changes) expect(c.date >= d(12)).toBe(true);
  });

  it("keeps locked cells exactly as they are", () => {
    const who = receptionists.find((r) => !isOff(base[r.id][d(14)]))!;
    const other = receptionists.find((r) => r.id !== who.id)!;
    const locked = Object.fromEntries(dates.map((x) => [other.id, { [x]: true }]).slice(0, 0));
    const lockMap: Record<string, Record<string, boolean>> = { [other.id]: Object.fromEntries(dates.map((x) => [x, true])) };
    void locked;
    const plan = planDayOff(ctx({ locked: lockMap }), who.id, d(14));
    expect(changedCells(base, plan.schedule).filter((c) => c.startsWith(`${other.id}|`))).toEqual([]);
  });
});

describe("vacation ranges (window repair)", () => {
  it("3 days of holiday for a receptionist: V is pinned, changes stay near the window, rules hold", () => {
    const who = receptionists[1];
    const plan = planDayOff(ctx(), who.id, d(12), "V", d(14));
    for (const x of [d(12), d(13), d(14)]) expect(plan.schedule[who.id][x]).toBe("V");
    expect(plan.level).not.toBe("red");
    expect(validateSchedule(plan.schedule, DEFAULT_STAFF, Y, M).issues.filter((i) => i.kind === "coverage")).toEqual([]);
    // minimal change: nothing far from the request moves (window radius <= 14 days)
    const far = plan.changes.filter((c) => c.date < d(1) || c.date > d(28));
    expect(far).toEqual([]);
    expect(plan.changes.length).toBeLessThan(60);
  });

  it("is deterministic", () => {
    const a = planDayOff(ctx(), "marcos", d(18), "V", d(20));
    const b = planDayOff(ctx(), "marcos", d(18), "V", d(20));
    expect(a.schedule).toEqual(b.schedule);
  });
});

describe("restructuring the team", () => {
  // "Marcos leaves": he stays on the roster until the 14th (baja date), so the days before are untouched
  const marcosLeaves = DEFAULT_STAFF.map((s) => (s.id === "marcos" ? { ...s, activeTo: d(14) } : s));

  it("keeps the days before the effective date untouched", () => {
    const staff = marcosLeaves;
    const plan = planRestructure(ctx(), staff, d(15));
    for (const x of dates.filter((x) => x < d(15)))
      for (const s of staff) expect(plan.schedule[s.id][x]).toBe(base[s.id][x]);
  });

  it("adding a receptionist from a date lets the month balance again", () => {
    const temp: Staff = { id: "temp", name: "Refuerzo", role: "receptionist", activeFrom: d(15) };
    const without = planRestructure(ctx(), marcosLeaves, d(15));
    const withTemp = planRestructure(ctx(), [...marcosLeaves, temp], d(15));
    expect(without.level).not.toBe("green"); // two receptionists cannot cover the month
    expect(withTemp.level).not.toBe("red");
    expect(dates.some((x) => withTemp.schedule.temp[x] === "M" || withTemp.schedule.temp[x] === "T")).toBe(true);
  });

  it("does not list the new person's own cells as changes, and shrinks the plan to what is needed", () => {
    const temp: Staff = { id: "temp", name: "Refuerzo", role: "receptionist", activeFrom: d(15) };
    const plan = planRestructure(ctx(), [...DEFAULT_STAFF, temp], d(15));
    expect(plan.changes.some((c) => c.staffId === "temp")).toBe(false);
    expect(plan.changes.length).toBeLessThan(45);
  });

  it("someone leaving changes far fewer cells than re-planning the whole month", () => {
    const plan = planRestructure(ctx({ today: d(8) }), DEFAULT_STAFF.map((s) => (s.id === "marcos" ? { ...s, activeTo: d(10) } : s)), d(1));
    // with two receptionists left (and only one partido a day) the month may not be coverable: then it says why
    if (plan.level === "red") expect(plan.reason).toBeTruthy();
    // his own days after the baja all become "B"; the rest of the changes is what is needed to cover them
    expect(plan.changes.filter((c) => c.to !== "B").length).toBeLessThan(40);
  });
});

describe("approved requests stay approved", () => {
  it("pins the requested cells, and a later request never undoes an earlier one", () => {
    const [a, b] = receptionists.filter((r) => !isOff(base[r.id][d(14)]));
    const first = planDayOff(ctx(), a.id, d(14));
    expect(first.pins).toContainEqual({ staffId: a.id, date: d(14) });
    const locked: Record<string, Record<string, boolean>> = {};
    for (const p of first.pins) (locked[p.staffId] ??= {})[p.date] = true;
    // a second person asks for the same day: the first one's day off must survive whatever it takes
    const second = planDayOff(ctx({ schedule: first.schedule, locked }), b.id, d(14));
    expect(second.schedule[a.id][d(14)]).toBe("D");
    expect(second.schedule[b.id][d(14)]).toBe("D");
  });

  it("locked cells survive a restructure too", () => {
    const who = receptionists.find((r) => !isOff(base[r.id][d(20)]))!;
    const locked = { [who.id]: { [d(20)]: true } };
    const temp: Staff = { id: "temp", name: "Refuerzo", role: "receptionist", activeFrom: d(15) };
    const plan = planRestructure(ctx({ locked }), [...DEFAULT_STAFF, temp], d(15));
    expect(plan.schedule[who.id][d(20)]).toBe(base[who.id][d(20)]);
  });
});
