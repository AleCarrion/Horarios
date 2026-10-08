import { describe, expect, it } from "vitest";
import { OCTOBER_2026_REAL } from "./fixtures/october-2026";
import { generateSchedule } from "./generator";
import { monthDates } from "./dates";
import { DEFAULT_STAFF } from "./roster";
import type { Schedule, ShiftCode } from "./types";
import { validateSchedule } from "./validate";

const POSITION_TO_ID: Record<string, string> = {
  director: "marta",
  senior_a: "ana",
  senior_b: "julio",
  recep_1: "alberto-r",
  recep_2: "marcos",
  recep_3: "alejandro",
  night_auditor: "jc",
  mozo_1: "alberto-m",
  mozo_2: "arturo",
};
const CODE: Record<string, ShiftCode> = { ".": "D", z: "MZ" };

const real: Schedule = {};
const dates = monthDates(2026, 10);
for (const [pos, row] of Object.entries(OCTOBER_2026_REAL))
  real[POSITION_TO_ID[pos]] = Object.fromEntries([...row].map((c, i) => [dates[i], CODE[c] ?? (c as ShiftCode)]));

const maxStreak = (row: Record<string, ShiftCode>, ds: string[]) => {
  let cur = 0;
  let max = 0;
  for (const d of ds) {
    cur = row[d] === "D" ? 0 : cur + 1;
    max = Math.max(max, cur);
  }
  return max;
};
/** Longest run of libre (D) days; holidays (V) and out-of-roster days (B) break the run. */
const maxRestRun = (row: Record<string, ShiftCode>, ds: string[]) => {
  let cur = 0;
  let max = 0;
  for (const d of ds) {
    cur = row[d] === "D" ? cur + 1 : 0;
    max = Math.max(max, cur);
  }
  return max;
};
const count = (row: Record<string, ShiftCode>, ds: string[], c: ShiftCode) => ds.filter((d) => row[d] === c).length;

describe("real October 2026 schedule (calibration)", () => {
  it("has full coverage and breaks none of our rules (JC's 4-day rest was a course)", () => {
    const issues = validateSchedule(real, DEFAULT_STAFF, 2026, 10).issues.filter(
      (i) => !(i.kind === "restStreak" && i.staffId === "jc"),
    );
    expect(issues).toEqual([]);
  });

  it("everyone rests 10-11 days (mozos excluded) and the two seniors never rest the same day", () => {
    for (const id of ["marta", "ana", "julio", "alberto-r", "marcos", "alejandro", "jc"]) {
      const rest = count(real[id], dates, "D");
      expect(rest).toBeGreaterThanOrEqual(10);
      expect(rest).toBeLessThanOrEqual(11);
    }
    expect(dates.filter((d) => real.ana[d] === "D" && real.julio[d] === "D")).toEqual([]);
  });

  it("nobody works more than 6 days in a row", () => {
    for (const id of Object.keys(real)) expect(maxStreak(real[id], dates)).toBeLessThanOrEqual(6);
  });

  it("nobody but mozos (and JC that month, who had a course) rests more than 3 days in a row", () => {
    for (const id of Object.keys(real).filter((x) => !["alberto-m", "arturo", "jc"].includes(x)))
      expect(maxRestRun(real[id], dates)).toBeLessThanOrEqual(3);
  });
});

describe.each([1, 2, 4, 6, 9, 10, 11, 12])("generator vs real figures, month %i", (month) => {
  const ds = monthDates(2026, month);
  const { schedule: s, warnings } = generateSchedule({ year: 2026, month, staff: DEFAULT_STAFF });
  const recep = ["alberto-r", "alejandro", "marcos"];

  it("both partido positions rest 9-11 days, never on the same day, never > 6 days in a row", () => {
    for (const id of ["ana", "julio"]) {
      const rest = count(s[id], ds, "D");
      expect(rest).toBeGreaterThanOrEqual(9);
      expect(rest).toBeLessThanOrEqual(11);
      expect(maxStreak(s[id], ds)).toBeLessThanOrEqual(6);
    }
    expect(ds.filter((d) => s.ana[d] === "D" && s.julio[d] === "D")).toEqual([]);
  });

  it("nobody but mozos rests more than 3 days in a row", () => {
    for (const id of Object.keys(s).filter((x) => !["alberto-m", "arturo"].includes(x)))
      expect(maxRestRun(s[id], ds)).toBeLessThanOrEqual(3);
  });

  it("nobody exceeds 6 consecutive working days", () => {
    for (const id of Object.keys(s)) expect(maxStreak(s[id], ds)).toBeLessThanOrEqual(6);
  });

  it("night cover is shared: each receptionist 2-4 nights, spread <= 2", () => {
    const nights = recep.map((id) => count(s[id], ds, "N"));
    for (const n of nights) {
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(4);
    }
    expect(Math.max(...nights) - Math.min(...nights)).toBeLessThanOrEqual(2);
  });

  it("receptionists rest 9-13 days and no coverage gap", () => {
    for (const id of recep) {
      const rest = count(s[id], ds, "D");
      expect(rest).toBeGreaterThanOrEqual(9);
      expect(rest).toBeLessThanOrEqual(13);
    }
    expect(warnings.filter((w) => w.kind === "coverage")).toEqual([]);
  });
});

describe("month with extra JC rest (course): real October JC rests", () => {
  const jcRest = dates.filter((d) => real.jc[d] === "D");
  const { schedule: s, warnings } = generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF, jcRestDays: jcRest });

  it("covers every shift without anyone exceeding 6 days in a row", () => {
    expect(warnings.filter((w) => w.kind === "coverage")).toEqual([]);
    for (const id of Object.keys(s)) expect(maxStreak(s[id], dates)).toBeLessThanOrEqual(6);
  });

  it("keeps JC's rests as given and shares the nights", () => {
    expect(dates.filter((d) => s.jc[d] === "D")).toEqual(jcRest);
    for (const id of ["alberto-r", "alejandro", "marcos"]) expect(count(s[id], dates, "N")).toBeLessThanOrEqual(4);
  });
});
