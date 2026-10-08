import { describe, expect, it } from "vitest";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF, EXTRA_RECEPTIONIST } from "./roster";
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
    for (const d of range(21, 30)) expect(schedule.angela[d]).toBe("B");
    expect(schedule.angela["2026-09-20"]).not.toBe("B");
    expect(["MZ", "D"]).toContain(schedule.arturo["2026-09-07"]);
  });

  it("never schedules anyone outside their dates and still covers everything", () => {
    for (const s of staff)
      for (const d of dates) if (!isActive(s, d)) expect(schedule[s.id][d]).toBe("B");
    expect(warnings.filter((w) => w.kind === "coverage")).toEqual([]);
    expect(validateSchedule(schedule, staff, 2026, 9).issues).toEqual([]);
  });

  it("a mozo's days before alta do not count towards the 5-5 cycle gap checks", () => {
    // exactly one mozo works every day once both have started, as before
    for (const d of range(7, 30)) {
      const working = ["alberto-m", "arturo"].filter((id) => schedule[id][d] === "MZ").length;
      expect(working).toBe(1);
    }
  });
});
