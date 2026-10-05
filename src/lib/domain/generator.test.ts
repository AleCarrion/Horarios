import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { diffDays, isWeekend, monthDates } from "./dates";
import type { ShiftCode } from "./types";

const recepIds = ["alberto-r", "alejandro", "marcos"];
const gen = (month: number, extra = {}) =>
  generateSchedule({ year: 2026, month, staff: DEFAULT_STAFF, ...extra });

describe.each([10, 2, 12])("month %i", (month) => {
  const { schedule, warnings } = gen(month);
  const dates = monthDates(2026, month);
  const at = (id: string, d: string) => schedule[id][d];

  it("covers M and T with exactly one person each (receptionist or covering senior)", () => {
    expect(warnings.filter((w) => w.kind === "coverage")).toEqual([]);
    for (const d of dates) {
      const t = Object.keys(schedule).filter((id) => at(id, d) === "T");
      expect(t).toHaveLength(1);
      const m = Object.keys(schedule).filter((id) => at(id, d) === "M");
      expect(m).toHaveLength(1);
    }
  });

  it("JC works only nights; rests ~10 days; a receptionist covers each rest night", () => {
    const rests = dates.filter((d) => at("jc", d) === "D");
    expect(rests.length).toBe(10);
    for (const d of dates) {
      expect(["N", "D"]).toContain(at("jc", d));
      const nights = Object.keys(schedule).filter((id) => at(id, d) === "N");
      expect(nights).toHaveLength(1);
      if (at("jc", d) === "D") expect(recepIds).toContain(nights[0]);
    }
  });

  it("Marta: S Mon-Fri, never nights, off weekends", () => {
    for (const d of dates) expect(at("marta", d)).toBe(isWeekend(d) ? "D" : "S");
  });

  it("only receptionists work nights besides JC", () => {
    for (const d of dates)
      for (const id of ["marta", "ana", "julio", "alberto-m", "arturo"]) expect(at(id, d)).not.toBe("N");
  });

  it("respects 12h rest: no T->M, no shift the day after N", () => {
    for (let i = 1; i < dates.length; i++)
      for (const id of recepIds) {
        const prev = at(id, dates[i - 1]);
        const cur = at(id, dates[i]);
        if (prev === "T") expect(cur).not.toBe("M");
        if (prev === "N") expect(cur).toBe("D");
      }
  });

  it("mozos follow the 5-5 cycle and exactly one works each day", () => {
    for (const d of dates) {
      const working = ["alberto-m", "arturo"].filter((id) => at(id, d) === "MZ");
      expect(working).toHaveLength(1);
    }
    const anchor = "2026-01-01";
    for (const d of dates) {
      const expected: ShiftCode = ((diffDays(d, anchor) % 10) + 10) % 10 < 5 ? "MZ" : "D";
      expect(at("alberto-m", d)).toBe(expected);
    }
  });

  it("seniors do P on weekdays, alternate weekends, M only as cover", () => {
    for (const d of dates) {
      for (const id of ["ana", "julio"]) {
        const s = at(id, d);
        const allowed = id === "julio" ? ["P", "M", "T"] : ["P", "M"];
        if (!isWeekend(d)) expect(allowed).toContain(s);
        else expect([...allowed, "D"]).toContain(s);
      }
      if (isWeekend(d)) {
        const both = ["ana", "julio"].filter((id) => at(id, d) === "P");
        expect(both.length).toBeLessThanOrEqual(1);
      }
    }
  });

  it("receptionists never exceed 6 consecutive working days", () => {
    for (const id of recepIds) {
      let streak = 0;
      for (const d of dates) {
        streak = at(id, d) === "D" ? 0 : streak + 1;
        expect(streak).toBeLessThanOrEqual(6);
      }
    }
  });
});

describe("seniors as cover", () => {
  const { schedule, stats } = gen(10);
  const dates = monthDates(2026, 10);

  it("Julio covers both mornings and afternoons; Ana never covers T", () => {
    expect(stats.julio.M).toBeGreaterThan(0);
    expect(stats.julio.T).toBeGreaterThan(0);
    expect(stats.ana.T).toBe(0);
  });

  it("nobody who covers works M the day after T", () => {
    for (const id of ["julio", "ana", ...recepIds])
      for (let i = 1; i < dates.length; i++)
        if (schedule[id][dates[i - 1]] === "T") expect(schedule[id][dates[i]]).not.toBe("M");
  });

  it("receptionists keep a realistic share of rest days (>= 10)", () => {
    for (const id of recepIds) expect(stats[id].rest).toBeGreaterThanOrEqual(10);
  });

  it("reports a cap warning instead of leaving a gap when seniors are stretched", () => {
    const staff = DEFAULT_STAFF.map((x) => (x.role === "senior" ? { ...x, maxCovers: 0 } : x));
    const r = generateSchedule({ year: 2026, month: 10, staff });
    expect(r.warnings.filter((w) => w.kind === "coverage")).toEqual([]);
    expect(r.warnings.some((w) => w.kind === "cap")).toBe(true);
  });
});

describe("options", () => {
  it("uses manual JC rest days", () => {
    const { schedule } = gen(10, { jcRestDays: ["2026-10-03", "2026-10-04"] });
    expect(schedule.jc["2026-10-03"]).toBe("D");
    expect(schedule.jc["2026-10-05"]).toBe("N");
    expect(Object.values(schedule.jc).filter((s) => s === "D")).toHaveLength(2);
  });

  it("is deterministic per seed", () => {
    expect(gen(10, { seed: 3 }).schedule).toEqual(gen(10, { seed: 3 }).schedule);
  });

  it("carries rest rules over from the previous month", () => {
    const { schedule } = gen(11, { prevDay: { marcos: "N", alberto_r: "T" } });
    expect(schedule.marcos["2026-11-01"]).toBe("D");
  });

  it("balances workload across receptionists (spread <= 3 days)", () => {
    const { stats } = gen(10);
    const worked = recepIds.map((id) => stats[id].worked);
    expect(Math.max(...worked) - Math.min(...worked)).toBeLessThanOrEqual(3);
  });

  it("warns when a shift cannot be covered", () => {
    const staff = DEFAULT_STAFF.filter((s) => s.id !== "marcos" && s.id !== "alejandro");
    const { warnings } = generateSchedule({ year: 2026, month: 10, staff });
    expect(warnings.length).toBeGreaterThan(0);
  });
});
