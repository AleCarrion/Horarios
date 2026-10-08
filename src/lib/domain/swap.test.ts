import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates } from "./dates";
import { planDayOff, planShiftSwap, type RepairContext } from "./repair";
import { isOff } from "./types";
import { validateSchedule } from "./validate";

const Y = 2026;
const M = 11;
const dates = monthDates(Y, M);
const d = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const base = generateSchedule({ year: Y, month: M, staff: DEFAULT_STAFF }).schedule;
const ctx = (extra: Partial<RepairContext> = {}): RepairContext => ({ year: Y, month: M, staff: DEFAULT_STAFF, schedule: base, ...extra });
const recs = DEFAULT_STAFF.filter((s) => s.role === "receptionist").map((s) => s.id);

/** Two receptionists working different shifts on `day`. */
const pair = (day: string) => {
  for (const a of recs) for (const b of recs) if (a < b && !isOff(base[a][day]) && !isOff(base[b][day]) && base[a][day] !== base[b][day]) return [a, b] as const;
  return null;
};

describe("cambio de turno entre dos personas", () => {
  it("exchanges their shifts on the day: the same two cells swap places", () => {
    for (let n = 3; n <= 28; n++) {
      const p = pair(d(n));
      if (!p) continue;
      const plan = planShiftSwap(ctx(), p[0], p[1], d(n));
      expect(plan.schedule[p[0]][d(n)]).toBe(plan.level === "red" || plan.strategy !== "swap" ? plan.schedule[p[0]][d(n)] : base[p[1]][d(n)]);
      expect(plan.level === "red" ? true : validateSchedule(plan.schedule, DEFAULT_STAFF, Y, M).issues.length === 0).toBe(true);
    }
  });

  it("when nothing else is affected it is exactly 2 cells (strategy swap)", () => {
    let simple = 0;
    let total = 0;
    for (let n = 3; n <= 28; n++) {
      const p = pair(d(n));
      if (!p) continue;
      total++;
      const plan = planShiftSwap(ctx(), p[0], p[1], d(n));
      if (plan.strategy === "swap") {
        simple++;
        expect(plan.changes).toHaveLength(2);
        expect(plan.schedule[p[0]][d(n)]).toBe(base[p[1]][d(n)]);
        expect(plan.schedule[p[1]][d(n)]).toBe(base[p[0]][d(n)]);
      }
    }
    expect(total).toBeGreaterThan(5);
    expect(simple).toBeGreaterThan(0);
  });

  it("covering someone who rests: one works, the other rests (a favour, two cells)", () => {
    for (let n = 3; n <= 28; n++)
      for (const a of recs)
        for (const b of recs) {
          if (a === b || isOff(base[a][d(n)]) || base[b][d(n)] !== "D") continue;
          const plan = planShiftSwap(ctx(), a, b, d(n));
          if (plan.level === "red") continue;
          expect(plan.schedule[a][d(n)]).toBe("D");
          expect(plan.schedule[b][d(n)]).toBe(base[a][d(n)]);
          return;
        }
    throw new Error("no covering case found");
  });

  it("a swap and its return day: both exchanges are applied and the month stays valid", () => {
    const p = pair(d(10));
    if (!p) return;
    const back = dates.find((x) => x > d(14) && !isOff(base[p[0]][x]) && base[p[1]][x] === "D");
    if (!back) return;
    const plan = planShiftSwap(ctx(), p[0], p[1], d(10), back);
    if (plan.level !== "red") expect(plan.schedule[p[1]][back]).toBe(base[p[0]][back]);
  });

  it("refuses what the roles do not allow (night auditor cannot take a morning) and holiday days", () => {
    const plan = planShiftSwap(ctx(), "jc", "marcos", d(5));
    expect(plan.level).toBe("red");
    expect(plan.changes).toEqual([]);
    expect(plan.reason).toMatch(/permit|no puede|turno/i);
    const vac = { ...base, marcos: { ...base.marcos, [d(6)]: "V" as const } };
    const onVac = planShiftSwap(ctx({ schedule: vac }), "alejandro", "marcos", d(6));
    expect(onVac.level).toBe("red");
  });

  it("never touches protected days", () => {
    const day = dates.slice(2, 20).find((x) => pair(x))!; // any day where two receptionists work different shifts
    const p = pair(day)!;
    const today = dates[dates.indexOf(day) - 1]; // yesterday: today + 2 protected days covers `day`
    const plan = planShiftSwap(ctx({ today, protectedDays: 2 }), p[0], p[1], day);
    expect(plan.level).toBe("red");
    expect(plan.reason).toMatch(/protegid/i);
  });
});

describe("antelación de la solicitud", () => {
  it("reports how many days ahead the request is and flags short notice (recommended: 30 days)", () => {
    const who = recs.find((r) => !isOff(base[r][d(28)]))!;
    const early = planDayOff(ctx({ today: "2026-10-01" }), who, d(28));
    expect(early.notice).toEqual({ daysAhead: 58, short: false });
    const late = planDayOff(ctx({ today: "2026-11-15" }), who, d(28));
    expect(late.notice).toEqual({ daysAhead: 13, short: true });
  });

  it("short notice is information only: the request is still planned", () => {
    const who = recs.find((r) => !isOff(base[r][d(28)]))!;
    const late = planDayOff(ctx({ today: "2026-11-15" }), who, d(28));
    expect(late.level).not.toBe("red");
    expect(late.changes.length).toBeGreaterThan(0);
  });

  it("a custom notice period can be configured", () => {
    const who = recs.find((r) => !isOff(base[r][d(28)]))!;
    expect(planDayOff(ctx({ today: "2026-11-15", noticeDays: 7 }), who, d(28)).notice?.short).toBe(false);
  });
});
