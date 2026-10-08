import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates, toISO } from "./dates";
import type { GeneratorConfig, ShiftCode, Staff } from "./types";
import { validateSchedule } from "./validate";

/** A temporary 4th receptionist hired to cover holidays (not part of the default roster). */
const EXTRA_RECEPTIONIST: Staff = { id: "temp", name: "Refuerzo", role: "receptionist" };
const Y = 2026;
const M = 9;
const dates = monthDates(Y, M);
const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => toISO(Y, M, a + i));
const mark = (code: "V" | "B", days: string[]) => Object.fromEntries(days.map((d) => [d, code]));

// September 2026, like the real one: staggered receptionist holidays covered by a temporary 4th receptionist.
const unavailable: GeneratorConfig["unavailable"] = {
  alejandro: mark("V", range(1, 14)),
  "alberto-r": mark("V", range(14, 19)),
  marcos: mark("V", range(20, 22)),
  [EXTRA_RECEPTIONIST.id]: mark("B", range(21, 30)),
  "alberto-m": mark("B", range(1, 6)),
  arturo: mark("B", range(1, 6)),
};
const staff = [...DEFAULT_STAFF, EXTRA_RECEPTIONIST];
const gen = (extra: Partial<GeneratorConfig> = {}) => generateSchedule({ year: Y, month: M, staff, unavailable, ...extra });

describe("vacations and inactive days", () => {
  const { schedule, warnings } = gen();

  it("keeps V and B exactly where they were marked", () => {
    for (const [id, days] of Object.entries(unavailable!))
      for (const [d, code] of Object.entries(days)) expect(schedule[id][d]).toBe(code);
  });

  it("covers every shift every day when a temporary receptionist fills in", () => {
    expect(warnings.filter((w) => w.kind === "coverage")).toEqual([]);
    const v = validateSchedule(schedule, staff, Y, M);
    expect(v.issues).toEqual([]);
  });

  it("nobody works on a V/B day and no one works more than 6 days in a row across a vacation", () => {
    for (const s of staff) {
      let run = 0;
      for (const d of dates) {
        const c = schedule[s.id][d];
        run = c === "D" || c === "V" || c === "B" ? 0 : run + 1;
        expect(run).toBeLessThanOrEqual(6);
      }
    }
  });

  it("nobody but mozos rests more than 3 days in a row (holidays and out-of-roster days excluded)", () => {
    for (const st of staff.filter((x) => x.role !== "mozo")) {
      let run = 0;
      for (const d of dates) {
        run = schedule[st.id][d] === "D" ? run + 1 : 0;
        expect(run).toBeLessThanOrEqual(3);
      }
    }
  });

  it("the temporary receptionist works while the others are away and is not scheduled after leaving", () => {
    const worked = (id: string, ds: string[]) => ds.filter((d) => ["M", "T", "N"].includes(schedule[id][d])).length;
    expect(worked(EXTRA_RECEPTIONIST.id, range(1, 20))).toBeGreaterThan(8);
    expect(worked(EXTRA_RECEPTIONIST.id, range(21, 30))).toBe(0);
  });

  it("without the temporary receptionist the gaps are reported, not hidden", () => {
    const r = generateSchedule({ year: Y, month: M, staff: DEFAULT_STAFF, unavailable });
    expect(r.warnings.length).toBeGreaterThan(0);
  });
});

describe("holidays of the night auditor and the seniors", () => {
  it("receptionists cover JC's holiday nights", () => {
    const r = generateSchedule({ year: Y, month: M, staff, unavailable: { jc: mark("V", range(10, 16)) } });
    for (const d of range(10, 16)) {
      expect(r.schedule.jc[d]).toBe("V");
      expect(Object.keys(r.schedule).filter((id) => r.schedule[id][d] === "N")).toHaveLength(1);
    }
    expect(r.warnings.filter((w) => w.kind === "coverage")).toEqual([]);
  });

  it("a senior on holiday works no partido or cover", () => {
    const r = generateSchedule({ year: Y, month: M, staff, unavailable: { julio: mark("V", range(8, 14)) } });
    for (const d of range(8, 14)) expect(r.schedule.julio[d]).toBe("V");
    expect(r.warnings.filter((w) => w.kind === "coverage")).toEqual([]);
  });

  it("types: V and B are valid codes for every role", () => {
    const codes: ShiftCode[] = ["V", "B"];
    expect(codes).toHaveLength(2);
  });
});
