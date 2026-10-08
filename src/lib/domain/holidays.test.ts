import { describe, expect, it } from "vitest";
import { holidaysOf, isHoliday } from "./holidays";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates } from "./dates";
import { validateSchedule } from "./validate";

describe("national holidays", () => {
  it("fixed ones plus Good Friday", () => {
    const h = holidaysOf(2026);
    for (const d of ["2026-01-01", "2026-01-06", "2026-05-01", "2026-08-15", "2026-10-12", "2026-11-01", "2026-12-06", "2026-12-08", "2026-12-25"]) expect(h.has(d)).toBe(true);
    expect(h.has("2026-04-03")).toBe(true); // Viernes Santo 2026
    expect(h.has("2026-03-20")).toBe(false);
    expect(isHoliday("2027-03-26")).toBe(true); // Viernes Santo 2027
  });

  it("extra local holidays can be added", () => {
    expect(isHoliday("2026-06-24")).toBe(false);
    expect(isHoliday("2026-06-24", ["2026-06-24"])).toBe(true);
  });
});

describe("the director and holidays", () => {
  it("Marta rests on weekends and holidays (October 12th, as in the real rota)", () => {
    const { schedule } = generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF });
    expect(schedule.marta["2026-10-12"]).toBe("D");
    expect(schedule.marta["2026-10-13"]).toBe("S");
  });

  it("never more than 3 libre days in a row for her, even around long weekends, in any month", () => {
    for (let m = 1; m <= 12; m++) {
      const { schedule } = generateSchedule({ year: 2026, month: m, staff: DEFAULT_STAFF });
      expect(validateSchedule(schedule, DEFAULT_STAFF, 2026, m).issues.filter((i) => i.staffId === "marta")).toEqual([]);
      const days = monthDates(2026, m);
      let rest = 0;
      for (const d of days) {
        rest = schedule.marta[d] === "D" ? rest + 1 : 0;
        expect(rest).toBeLessThanOrEqual(3);
      }
    }
  });
});
