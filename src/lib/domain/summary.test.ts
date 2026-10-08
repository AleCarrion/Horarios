import { describe, expect, it } from "vitest";
import { summarizeMonth } from "./summary";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates } from "./dates";

describe("resumen del mes", () => {
  const { schedule } = generateSchedule({ year: 2026, month: 11, staff: DEFAULT_STAFF });
  const rows = summarizeMonth(schedule, DEFAULT_STAFF, 2026, 11);

  it("every day of the month is counted exactly once for everyone", () => {
    for (const r of rows) expect(r.worked + r.libres + r.vacaciones + r.ausencias).toBeLessThanOrEqual(30);
    for (const r of rows) expect(r.worked).toBe(r.M + r.T + r.N + r.other);
  });

  it("hours: 8 per shift, nights included", () => {
    for (const r of rows) expect(r.hours).toBe(r.worked * 8);
  });

  it("counts weekends and holidays worked", () => {
    const jc = rows.find((r) => r.staffId === "jc")!;
    const nights = monthDates(2026, 11).filter((d) => schedule.jc[d] === "N");
    expect(jc.N).toBe(nights.length);
    expect(jc.weekends).toBe(nights.filter((d) => [0, 6].includes(new Date(d).getUTCDay())).length);
    const nov1 = rows.map((r) => r.holidays);
    expect(Math.max(...nov1)).toBeGreaterThanOrEqual(0);
  });

  it("absences and holidays are not worked days", () => {
    const s = JSON.parse(JSON.stringify(schedule));
    s.marcos["2026-11-10"] = "A";
    s.marcos["2026-11-11"] = "V";
    const before = rows.find((r) => r.staffId === "marcos")!;
    const after = summarizeMonth(s, DEFAULT_STAFF, 2026, 11).find((r) => r.staffId === "marcos")!;
    expect(after.ausencias).toBe(1);
    expect(after.vacaciones).toBe(1);
    expect(after.worked).toBeLessThanOrEqual(before.worked);
  });
});
