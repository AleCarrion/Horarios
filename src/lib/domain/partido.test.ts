import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates } from "./dates";
import { validateSchedule } from "./validate";

const partidos = (s: Record<string, Record<string, string>>, y: number, m: number) =>
  monthDates(y, m).filter((d) => Object.values(s).filter((row) => row[d] === "P").length > 1);

describe("solo una persona de partido al día", () => {
  it("the validator flags two partidos on the same day", () => {
    const g = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF });
    const s = JSON.parse(JSON.stringify(g.schedule));
    const seniors = DEFAULT_STAFF.filter((x) => x.role === "senior");
    const day = monthDates(2026, 11).find((d) => seniors.every((x) => s[x.id][d] === "D" || s[x.id][d] === "P"))!;
    for (const x of seniors) s[x.id][day] = "P";
    const issues = validateSchedule(s, DEFAULT_STAFF, 2026, 11).issues;
    expect(issues.some((i) => i.message.includes("partido") && i.date === day)).toBe(true);
  });

  it("the generator never plans two partidos on one day, and still covers everything", () => {
    for (let m = 1; m <= 12; m++) {
      const g = generateSchedule({ year: 2026, month: m, staff: DEFAULT_STAFF });
      expect(partidos(g.schedule, 2026, m), `mes ${m}`).toEqual([]);
      const issues = validateSchedule(g.schedule, DEFAULT_STAFF, 2026, m).issues;
      expect(issues, `mes ${m}`).toEqual([]);
    }
  });
});
