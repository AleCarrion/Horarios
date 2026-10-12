import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates } from "./dates";
import { compareMonths, layPattern, planCopyPattern } from "./pattern";
import { validateSchedule } from "./validate";
import type { RepairContext } from "./repair";

const oct = generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF }).schedule;
const nov = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF, history: oct }).schedule;
const ctx = (extra: Partial<RepairContext> = {}): RepairContext => ({ year: 2026, month: 11, staff: DEFAULT_STAFF, schedule: nov, history: oct, ...extra });
const d = (n: number) => `2026-11-${String(n).padStart(2, "0")}`;

describe("copiar el patrón del mes anterior", () => {
  it("lays last month's cell from exactly four weeks earlier (the weekday is kept)", () => {
    const laid = layPattern(ctx(), oct);
    expect(laid.alberto_r?.[d(10)] ?? laid["alberto-r"][d(10)]).toBe(oct["alberto-r"]["2026-10-13"]); // Nov 10 - 28 days = Oct 13
    expect(laid.marta[d(5)]).toBe(oct.marta["2026-10-08"]);
  });

  it("leaves holidays, absences, locked cells and days that already happened untouched", () => {
    const s = JSON.parse(JSON.stringify(nov));
    s.marcos[d(12)] = "V";
    s.alejandro[d(14)] = "A";
    const locked = { "alberto-r": { [d(20)]: true } };
    const laid = layPattern(ctx({ schedule: s, locked, today: d(8) }), oct);
    expect(laid.marcos[d(12)]).toBe("V");
    expect(laid.alejandro[d(14)]).toBe("A");
    expect(laid["alberto-r"][d(20)]).toBe(nov["alberto-r"][d(20)]);
    expect(laid.marta[d(9)]).toBe(nov.marta[d(9)]); // before the first editable day (today + 3)
  });

  it("the mozos keep their own 5/5 cycle", () => {
    const laid = layPattern(ctx(), oct);
    expect(laid["alberto-m"]).toEqual(nov["alberto-m"]);
  });

  it("the result is repaired: a valid month, with every change listed against the current one", () => {
    const plan = planCopyPattern(ctx(), oct);
    if (plan.level !== "red") expect(validateSchedule(plan.schedule, DEFAULT_STAFF, 2026, 11, oct).issues).toEqual([]);
    else expect(plan.reason).toBeTruthy();
    for (const c of plan.changes) expect(nov[c.staffId][c.date]).toBe(c.from);
  });

  it("never changes what must not change", () => {
    const locked = { "alberto-r": { [d(20)]: true, [d(21)]: true } };
    const plan = planCopyPattern(ctx({ locked, today: d(8) }), oct);
    expect(plan.schedule["alberto-r"][d(20)]).toBe(nov["alberto-r"][d(20)]);
    expect(plan.changes.every((c) => c.date >= d(11))).toBe(true); // first editable day = today + 3
  });
});

describe("comparar meses", () => {
  it("lines up the same person in both months with their numbers", () => {
    const rows = compareMonths(DEFAULT_STAFF, { schedule: oct, year: 2026, month: 10 }, { schedule: nov, year: 2026, month: 11 });
    expect(rows).toHaveLength(DEFAULT_STAFF.length);
    const jc = rows.find((r) => r.staffId === "jc")!;
    expect(jc.a.N).toBe(monthDates(2026, 10).filter((x) => oct.jc[x] === "N").length);
    expect(jc.b.N).toBe(monthDates(2026, 11).filter((x) => nov.jc[x] === "N").length);
  });
});
