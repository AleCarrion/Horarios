import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { monthDates, toISO } from "./dates";
import { isActive } from "./types";
import type { Staff } from "./types";
import { validateSchedule } from "./validate";

describe("isActive", () => {
  it("is inclusive on both ends and open when unset", () => {
    const s = { activeFrom: "2026-09-07", activeTo: "2026-09-20" };
    expect(isActive(s, "2026-09-06")).toBe(false);
    expect(isActive(s, "2026-09-07")).toBe(true);
    expect(isActive(s, "2026-09-20")).toBe(true);
    expect(isActive(s, "2026-09-21")).toBe(false);
    expect(isActive({}, "2030-01-01")).toBe(true);
  });
});

describe("alta/baja dates generate B automatically (September 2026)", () => {
  const EXTRA_RECEPTIONIST: Staff = { id: "temp", name: "Refuerzo", role: "receptionist" };
  const dates = monthDates(2026, 9);
  const staff: Staff[] = [
    ...DEFAULT_STAFF.map((s) => (s.role === "mozo" ? { ...s, activeFrom: "2026-09-07" } : s)),
    { ...EXTRA_RECEPTIONIST, activeTo: "2026-09-20" },
  ];
  const range = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => toISO(2026, 9, a + i));
  const unavailable = {
    alejandro: Object.fromEntries(range(1, 14).map((d) => [d, "V" as const])),
    "alberto-r": Object.fromEntries(range(14, 19).map((d) => [d, "V" as const])),
    marcos: Object.fromEntries(range(20, 22).map((d) => [d, "V" as const])),
  };
  const { schedule, warnings } = generateSchedule({ year: 2026, month: 9, staff, unavailable });

  it("marks days before alta and after baja as B", () => {
    for (const d of range(1, 6)) {
      expect(schedule["alberto-m"][d]).toBe("B");
      expect(schedule.arturo[d]).toBe("B");
    }
    for (const d of range(21, 30)) expect(schedule.temp[d]).toBe("B");
    expect(schedule.temp["2026-09-20"]).not.toBe("B");
    expect(["MZ", "D"]).toContain(schedule.arturo["2026-09-07"]);
  });

  it("never schedules anyone outside their dates and still covers everything", () => {
    for (const s of staff)
      for (const d of dates) if (!isActive(s, d)) expect(schedule[s.id][d]).toBe("B");
    expect(warnings.filter((w) => w.kind === "coverage")).toEqual([]);
    expect(validateSchedule(schedule, staff, 2026, 9).issues).toEqual([]);
  });

  it("mozos start their 5-5 cycle on their alta date: one works 7-11, the other 12-16, and so on", () => {
    // exactly one mozo works every day once both have started
    for (const d of range(7, 30)) {
      const working = ["alberto-m", "arturo"].filter((id) => schedule[id][d] === "MZ").length;
      expect(working).toBe(1);
    }
    for (const d of range(7, 11)) expect(schedule["alberto-m"][d]).toBe("MZ");
    for (const d of range(12, 16)) expect(schedule.arturo[d]).toBe("MZ");
    for (const d of range(17, 21)) expect(schedule["alberto-m"][d]).toBe("MZ");
  });

  it("without an alta date the fixed anchors keep working as before", () => {
    const r = generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF });
    for (const d of monthDates(2026, 10)) expect(["alberto-m", "arturo"].filter((id) => r.schedule[id][d] === "MZ")).toHaveLength(1);
  });
});
