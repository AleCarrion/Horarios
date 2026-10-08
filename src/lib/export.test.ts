import { describe, expect, it } from "vitest";
import { toCSV, toICS } from "./export";
import { DEFAULT_STAFF } from "./domain/roster";

const jc = DEFAULT_STAFF.find((x) => x.id === "jc")!;
import { generateSchedule } from "./domain/generator";

const { schedule } = generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF });
const NOW = new Date(Date.UTC(2026, 9, 5, 12, 0, 0));

describe("toCSV", () => {
  const csv = toCSV(schedule, DEFAULT_STAFF, 2026, 10);
  const rows = csv.replace(/^\uFEFF/, "").split("\r\n");

  it("starts with BOM and uses ; for Excel (es)", () => {
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(rows[0].startsWith("Persona;1;2;3")).toBe(true);
  });

  it("has one row per person with 31 days + totals", () => {
    expect(rows).toHaveLength(1 + DEFAULT_STAFF.length);
    expect(rows[0].split(";")).toHaveLength(1 + 31 + 4);
    expect(rows[1].split(";")[0]).toBe("Marta");
  });

  it("uses the Excel letters: L for libre, P for the mozo shift", () => {
    expect(rows[7].split(";").slice(1, 32).every((c) => ["N", "L"].includes(c))).toBe(true);
    expect(rows[9].split(";").slice(1, 32).every((c) => ["P", "L"].includes(c))).toBe(true);
  });
});

describe("toICS", () => {
  const ics = toICS(schedule, jc, 2026, 10, NOW);

  it("is a valid VCALENDAR with CRLF lines", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.trimEnd().endsWith("END:VCALENDAR")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
  });

  it("emits one event per working day and none for rest days", () => {
    const work = Object.values(schedule.jc).filter((c) => c !== "D").length;
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(work);
  });

  it("night events end the next day at 07:00", () => {
    const e = toICS({ jc: { "2026-10-31": "N" } }, jc, 2026, 10, NOW);
    expect(e).toContain("DTSTART:20261031T230000");
    expect(e).toContain("DTEND:20261101T070000");
    expect(e).toContain("UID:jc-20261031@horarios.casa1800");
  });
});
