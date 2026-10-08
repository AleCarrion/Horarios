import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates } from "./dates";
import { planShiftPref, type RepairContext } from "./repair";
import { validateSchedule } from "./validate";

const Y = 2026;
const M = 11;
const d = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const base = generateSchedule({ year: Y, month: M, staff: DEFAULT_STAFF }).schedule;
const ctx = (extra: Partial<RepairContext> = {}): RepairContext => ({ year: Y, month: M, staff: DEFAULT_STAFF, schedule: base, ...extra });

describe("turno solicitado (p. ej. mañanas esos días)", () => {
  it("gives the person the shift on the days asked and keeps the month valid", () => {
    let ok = 0;
    for (const who of ["alberto-r", "alejandro", "marcos"]) for (const code of ["M", "T"] as const) for (const day of [10, 15, 21]) {
      const plan = planShiftPref(ctx(), who, d(day), d(day + 1), code);
      if (plan.level === "red") continue;
      ok++;
      expect(plan.schedule[who][d(day)]).toBe(code);
      expect(plan.schedule[who][d(day + 1)]).toBe(code);
      expect(validateSchedule(plan.schedule, DEFAULT_STAFF, Y, M).issues).toEqual([]);
      if (plan.changes.length) expect(plan.pins).toContainEqual({ staffId: who, date: d(day) });
    }
    expect(ok).toBeGreaterThan(10);
  });

  it("asking for what they already have changes nothing", () => {
    const who = "alberto-r";
    const day = monthDates(Y, M).find((x) => base[who][x] === "M")!;
    const plan = planShiftPref(ctx(), who, day, day, "M");
    expect(plan.changes).toEqual([]);
    expect(plan.level).toBe("green");
  });

  it("refuses shifts the role cannot do, and protected days", () => {
    expect(planShiftPref(ctx(), "jc", d(10), d(10), "M").level).toBe("red");
    const plan = planShiftPref(ctx({ today: d(9) }), "marcos", d(10), d(10), "M");
    expect(plan.level).toBe("red");
    expect(plan.changes).toEqual([]);
  });
});

describe("turno solicitado en un mes con historial real", () => {
  it("is feasible most of the time (and always explains the rest)", () => {
    const sept = generateSchedule({ year: Y, month: 9, staff: DEFAULT_STAFF }).schedule;
    const oct = generateSchedule({ year: Y, month: 10, staff: DEFAULT_STAFF, history: sept }).schedule;
    let ok = 0;
    let total = 0;
    for (const who of ["alberto-r", "alejandro", "marcos"]) for (const code of ["M", "T"] as const) for (let day = 12; day <= 27; day += 3) {
      total++;
      const plan = planShiftPref({ year: Y, month: 10, staff: DEFAULT_STAFF, schedule: oct, history: sept, today: "2026-10-08" }, who, `2026-10-${day}`, `2026-10-${day + 1}`, code);
      if (plan.level === "red") expect(plan.reason).toBeTruthy();
      else ok++;
    }
    expect(ok / total).toBeGreaterThan(0.7);
  });
});
