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

  it("respects rest: no T->M, only N or rest the day after N", () => {
    for (let i = 1; i < dates.length; i++)
      for (const id of recepIds) {
        const prev = at(id, dates[i - 1]);
        const cur = at(id, dates[i]);
        if (prev === "T") expect(cur).not.toBe("M");
        if (prev === "N") expect(["N", "D"]).toContain(cur);
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

describe.each([10, 11, 2, 12])("block rotation, month %i", (month) => {
  const { schedule, stats } = gen(month);
  const dates = monthDates(2026, month);

  /** Lengths of runs of the same shift on consecutive days (rest days excluded). */
  const runs = (id: string, only: string[] = ["M", "T", "N"]) => {
    const out: number[] = [];
    let prev = "D";
    for (const d of dates) {
      const c = schedule[id][d];
      if (c === "D" || !only.includes(c)) prev = "D";
      else if (c === prev) out[out.length - 1]++;
      else {
        out.push(1);
        prev = c;
      }
    }
    return out;
  };

  it("M/T blocks average >= 2.5 days (night blocks follow JC's rest, so they are excluded)", () => {
    for (const id of recepIds) {
      const r = runs(id, ["M", "T"]);
      expect(r.reduce((a, b) => a + b, 0) / r.length).toBeGreaterThanOrEqual(2.5);
    }
  });

  it("no receptionist block lasts more than 7 days", () => {
    for (const id of recepIds) expect(Math.max(...runs(id))).toBeLessThanOrEqual(7);
  });

  it("Julio's M/T cover blocks stay under 6 days", () => {
    let run = 0;
    for (const d of dates) {
      run = ["M", "T"].includes(schedule.julio[d]) ? run + 1 : 0;
      expect(run).toBeLessThanOrEqual(5);
    }
  });

  it("receptionists have few single-day blocks (<= 3) and few direct shift switches (<= 3)", () => {
    for (const id of recepIds) {
      expect(runs(id).filter((n) => n === 1).length).toBeLessThanOrEqual(3);
      let switches = 0;
      for (let i = 1; i < dates.length; i++) {
        const a = schedule[id][dates[i - 1]];
        const b = schedule[id][dates[i]];
        if (a !== "D" && b !== "D" && a !== b) switches++;
      }
      expect(switches).toBeLessThanOrEqual(3);
    }
  });

  it("rests come in runs: no more than 3 isolated single rest days per receptionist", () => {
    for (const id of recepIds) {
      let single = 0;
      for (let i = 1; i < dates.length - 1; i++)
        if (schedule[id][dates[i]] === "D" && schedule[id][dates[i - 1]] !== "D" && schedule[id][dates[i + 1]] !== "D")
          single++;
      expect(single).toBeLessThanOrEqual(3);
    }
  });

  it("still covers every shift and balances work (spread <= 4)", () => {
    const { warnings } = gen(month);
    expect(warnings.filter((w) => w.kind === "coverage")).toEqual([]);
    const worked = recepIds.map((id) => stats[id].worked);
    expect(Math.max(...worked) - Math.min(...worked)).toBeLessThanOrEqual(4);
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
    expect(["N", "D"]).toContain(schedule.marcos["2026-11-01"]);
    expect(schedule.marcos["2026-11-01"]).not.toBe("M");
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
