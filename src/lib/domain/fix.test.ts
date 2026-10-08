import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { planFix, type RepairContext } from "./repair";
import { validateSchedule } from "./validate";

const Y = 2026;
const M = 11;
const d = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;
const base = generateSchedule({ year: Y, month: M, staff: DEFAULT_STAFF }).schedule;
const recs = DEFAULT_STAFF.filter((s) => s.role === "receptionist");
const issues = (s: typeof base) => validateSchedule(s, DEFAULT_STAFF, Y, M).issues;

/** Break the month by hand: wipe a morning shift and force a night nobody covers. */
function broken() {
  const s = JSON.parse(JSON.stringify(base)) as typeof base;
  for (const r of recs) for (const day of [d(10), d(20)]) if (s[r.id][day] === "M") s[r.id][day] = "D";
  return s;
}
const ctx = (schedule: typeof base, extra: Partial<RepairContext> = {}): RepairContext => ({ year: Y, month: M, staff: DEFAULT_STAFF, schedule, ...extra });

describe("arreglar avisos", () => {
  it("a clean month needs no changes", () => {
    const plan = planFix(ctx(base));
    expect(plan.changes).toEqual([]);
    expect(plan.level).toBe("green");
  });

  it("fixes holes with a plan that leaves the month valid and changes few cells", () => {
    const s = broken();
    expect(issues(s).length).toBeGreaterThan(0);
    const plan = planFix(ctx(s));
    expect(issues(plan.schedule)).toEqual([]);
    expect(plan.changes.length).toBeGreaterThan(0);
    expect(plan.changes.length).toBeLessThan(40);
  });

  it("never touches days that are already past", () => {
    const s = broken();
    const plan = planFix(ctx(s, { today: d(15), protectedDays: 2 }));
    expect(plan.changes.every((c) => c.date >= d(17))).toBe(true);
  });
});
