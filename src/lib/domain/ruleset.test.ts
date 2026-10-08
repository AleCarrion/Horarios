import { describe, expect, it } from "vitest";
import { DEFAULT_RULES, localHolidaysOf, normalizeRules } from "./ruleset";

describe("reglas editables", () => {
  it("empty or broken input gives the hotel's defaults", () => {
    expect(normalizeRules(null)).toEqual(DEFAULT_RULES);
    expect(normalizeRules({ maxWorkRun: "x" as unknown as number })).toEqual(DEFAULT_RULES);
  });

  it("numbers are clamped and the preferred run never exceeds the maximum", () => {
    const r = normalizeRules({ maxWorkRun: 4, preferredWorkRun: 9, maxRestRun: 99 });
    expect(r.maxWorkRun).toBe(4);
    expect(r.preferredWorkRun).toBe(4);
    expect(r.maxRestRun).toBe(7);
  });

  it("local holidays: valid entries only, sorted, no duplicates; MM-DD repeats every year", () => {
    const r = normalizeRules({ localHolidays: ["2026-09-08", "03-19", "03-19", "nope", "13-40"] });
    expect(r.localHolidays).toEqual(["03-19", "2026-09-08"]);
    expect(localHolidaysOf(r, 2026)).toEqual(["2026-03-19", "2026-09-08"]);
    expect(localHolidaysOf(r, 2027)).toEqual(["2027-03-19"]);
  });
});

import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { validateSchedule } from "./validate";

describe("las reglas cambian lo que hace el motor", () => {
  it("a local holiday makes the director rest, like a national one", () => {
    const rules = normalizeRules({ localHolidays: ["2026-11-10"] });
    const { schedule } = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF, rules });
    expect(schedule.marta["2026-11-10"]).toBe("D");
  });

  it("the validator uses the configured limits", () => {
    const { schedule } = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF });
    const s = JSON.parse(JSON.stringify(schedule));
    for (const d of ["10", "11", "12", "13"]) s.alejandro[`2026-11-${d}`] = "D";
    expect(validateSchedule(s, DEFAULT_STAFF, 2026, 11).issues.some((i) => i.kind === "restStreak")).toBe(true);
    expect(validateSchedule(s, DEFAULT_STAFF, 2026, 11, undefined, normalizeRules({ maxRestRun: 4 })).issues.some((i) => i.kind === "restStreak")).toBe(false);
  });

  it("two partidos are fine when the rule is off", () => {
    const { schedule } = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF });
    const s = JSON.parse(JSON.stringify(schedule));
    const day = Object.keys(s.ana).find((d) => s.ana[d] === "D" && s.julio[d] === "P")!;
    s.ana[day] = "P";
    const off = normalizeRules({ onePartido: false });
    expect(validateSchedule(s, DEFAULT_STAFF, 2026, 11).issues.some((i) => i.message.includes("partido"))).toBe(true);
    expect(validateSchedule(s, DEFAULT_STAFF, 2026, 11, undefined, off).issues.some((i) => i.message.includes("partido"))).toBe(false);
  });

  it("a shorter work run is respected by the planner when it can be", () => {
    const rules = normalizeRules({ maxWorkRun: 6, preferredWorkRun: 4 });
    const { schedule } = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF, rules });
    expect(validateSchedule(schedule, DEFAULT_STAFF, 2026, 11, undefined, rules).issues.filter((i) => i.kind === "streak")).toEqual([]);
  });
});
