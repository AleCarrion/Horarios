import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { planAbsence, type RepairContext } from "./repair";
import { validateSchedule } from "./validate";

const Y = 2026;
const M = 11;
const d = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const base = generateSchedule({ year: Y, month: M, staff: DEFAULT_STAFF }).schedule;
const ctx = (extra: Partial<RepairContext> = {}): RepairContext => ({ year: Y, month: M, staff: DEFAULT_STAFF, schedule: base, ...extra });
const working = (id: string, from: number) => {
  for (let n = from; n < 28; n++) if (!["D", "V", "A", "B"].includes(base[id][d(n)])) return n;
  throw new Error("nobody works");
};

describe("ausencia imprevista", () => {
  it("covers today itself (no protected days, no notice period) and leaves the month valid", () => {
    let ok = 0;
    for (const who of ["alberto-r", "alejandro", "marcos", "jc"]) {
      const day = working(who, 10);
      const plan = planAbsence(ctx({ today: d(day) }), who, d(day), d(day));
      expect(plan.urgent).toBe(true);
      expect(plan.schedule[who][d(day)]).toBe("A");
      if (plan.level === "red") {
        expect(plan.reason).toBeTruthy();
        continue;
      }
      ok++;
      expect(validateSchedule(plan.schedule, DEFAULT_STAFF, Y, M).issues.filter((i) => i.staffId !== who)).toEqual([]);
      expect(plan.notice).toBeUndefined();
    }
    expect(ok).toBeGreaterThanOrEqual(2);
  });

  it("never touches what already happened", () => {
    const day = working("marcos", 12);
    const plan = planAbsence(ctx({ today: d(day) }), "marcos", d(day - 3), d(day + 1));
    expect(plan.changes.every((c) => c.date >= d(day))).toBe(true);
  });

  it("several days: all of them become A", () => {
    const day = working("alejandro", 10);
    const plan = planAbsence(ctx({ today: d(day) }), "alejandro", d(day), d(day + 2));
    if (plan.level !== "red") for (let k = 0; k <= 2; k++) expect(plan.schedule.alejandro[d(day + k)]).toBe("A");
  });
});
