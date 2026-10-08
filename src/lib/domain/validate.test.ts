import { describe, expect, it } from "vitest";
import { validateSchedule } from "./validate";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";

const base = () => generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF });

describe("validateSchedule", () => {
  it("generated schedule has full coverage and no issues", () => {
    const { schedule } = base();
    const v = validateSchedule(schedule, DEFAULT_STAFF, 2026, 10);
    expect(v.issues).toEqual([]);
    expect(v.coverage["2026-10-01"]).toEqual({ M: 1, T: 1, N: 1, ok: true });
  });

  it("flags uncovered shifts", () => {
    const { schedule } = base();
    const m = Object.keys(schedule).find((id) => schedule[id]["2026-10-07"] === "M")!;
    schedule[m]["2026-10-07"] = "D";
    const v = validateSchedule(schedule, DEFAULT_STAFF, 2026, 10);
    expect(v.coverage["2026-10-07"].ok).toBe(false);
    expect(v.issues.some((i) => i.kind === "coverage" && i.date === "2026-10-07")).toBe(true);
  });

  it("allows Julio to cover T but not Ana", () => {
    const { schedule } = base();
    schedule.julio["2026-10-07"] = "T";
    schedule.ana["2026-10-08"] = "T";
    const v = validateSchedule(schedule, DEFAULT_STAFF, 2026, 10);
    const forbidden = v.issues.filter((i) => i.kind === "forbidden");
    expect(forbidden.map((i) => i.staffId)).toEqual(["ana"]);
  });

  it("flags more than 6 consecutive working days", () => {
    const { schedule } = base();
    for (const d of ["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11", "2026-10-12"])
      schedule.ana[d] = "P";
    const v = validateSchedule(schedule, DEFAULT_STAFF, 2026, 10);
    expect(v.issues.filter((i) => i.kind === "streak" && i.staffId === "ana")).toHaveLength(1);
  });

  it("flags forbidden assignments (Marta night, senior night)", () => {
    const { schedule } = base();
    schedule.marta["2026-10-07"] = "N";
    schedule.ana["2026-10-08"] = "N";
    const v = validateSchedule(schedule, DEFAULT_STAFF, 2026, 10);
    expect(v.issues.filter((i) => i.kind === "forbidden").length).toBe(2);
  });

  it("flags rest violations (T then M, shift after N)", () => {
    const { schedule } = base();
    schedule["alberto-r"]["2026-10-10"] = "T";
    schedule["alberto-r"]["2026-10-11"] = "M";
    schedule["alejandro"]["2026-10-12"] = "N";
    schedule["alejandro"]["2026-10-13"] = "M";
    const v = validateSchedule(schedule, DEFAULT_STAFF, 2026, 10);
    expect(v.issues.filter((i) => i.kind === "rest").length).toBe(2);
  });
});
