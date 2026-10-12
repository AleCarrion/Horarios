import { textOn } from "./catalog";
import { monthDates, weekday } from "./dates";
import { isHoliday } from "./holidays";
import { summarizeMonth, type PersonSummary } from "./summary";
import { SECTIONS, sectionIdOf, type Section } from "./team";
import { displayCode, SHIFTS, type Schedule, type ShiftCode, type Staff } from "./types";
import { validateSchedule } from "./validate";

export const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const WEEKDAY_LETTER = ["D", "L", "M", "X", "J", "V", "S"];

export interface ReportCell {
  code: ShiftCode;
  letter: string;
  /** Hex colours of the cell and of its letter. */
  fill: string;
  ink: string;
}
export interface ReportRow {
  staff: Staff;
  cells: ReportCell[];
  summary: PersonSummary;
}
export interface ReportDay {
  date: string;
  day: number;
  /** L M X J V S D */
  weekday: string;
  weekend: boolean;
  holiday: boolean;
  /** People on each shift that has to be covered, and whether the day is exactly covered. */
  cover: { M: number; T: number; N: number; ok: boolean };
}
export interface LegendItem {
  code: ShiftCode;
  letter: string;
  label: string;
  hours: string;
  fill: string;
  ink: string;
}
export interface MonthReport {
  year: number;
  month: number;
  /** "Octubre 2026" */
  title: string;
  hotel: string;
  days: ReportDay[];
  groups: { section: Section; rows: ReportRow[] }[];
  legend: LegendItem[];
}

const cellOf = (code: ShiftCode): ReportCell => {
  const fill = SHIFTS[code].color ?? "#a3a3a3";
  return { code, letter: displayCode(code), fill, ink: code === "B" ? fill : textOn(fill) };
};

/** Everything an export needs about one month, already in the hotel's names, letters and colours (one source for Excel and PDF). */
export function buildMonthReport(schedule: Schedule, staff: Staff[], year: number, month: number, opts: { holidays?: string[]; hotel?: string } = {}): MonthReport {
  const dates = monthDates(year, month);
  const extra = opts.holidays ?? [];
  const validation = validateSchedule(schedule, staff, year, month);
  const summaries = new Map(summarizeMonth(schedule, staff, year, month, extra).map((s) => [s.staffId, s]));
  const days: ReportDay[] = dates.map((date) => {
    const c = validation.coverage[date] ?? { M: 0, T: 0, N: 0, ok: false };
    const wd = weekday(date);
    return { date, day: Number(date.slice(8)), weekday: WEEKDAY_LETTER[wd], weekend: wd === 0 || wd === 6, holiday: isHoliday(date, extra), cover: { M: c.M, T: c.T, N: c.N, ok: c.ok } };
  });
  const groups = SECTIONS.map((section) => ({
    section,
    rows: staff
      .filter((s) => sectionIdOf(s) === section.id)
      .map((s) => ({ staff: s, cells: dates.map((d) => cellOf(schedule[s.id]?.[d] ?? "D")), summary: summaries.get(s.id)! })),
  })).filter((g) => g.rows.length > 0);
  // the legend lists the shifts that actually appear this month, in the usual order
  const used = new Set(groups.flatMap((g) => g.rows.flatMap((r) => r.cells.map((c) => c.code))));
  const order = Object.keys(SHIFTS);
  const legend = [...used]
    .filter((c) => c !== "B")
    .sort((a, b) => order.indexOf(a) - order.indexOf(b))
    .map((code) => {
      const c = cellOf(code);
      const def = SHIFTS[code];
      return { code, letter: c.letter, label: def.label, hours: def.start ? `${def.start}–${def.end}` : "", fill: c.fill, ink: c.ink };
    });
  return { year, month, title: `${MONTH_NAMES[month - 1]} ${year}`, hotel: opts.hotel ?? "Hotel Casa 1800", days, groups, legend };
}

/** Totals shown at the end of each row, in this order (Excel and PDF). */
export const TOTALS: { key: string; label: string; value: (s: PersonSummary) => number }[] = [
  { key: "M", label: "M", value: (s) => s.M },
  { key: "T", label: "T", value: (s) => s.T },
  { key: "N", label: "N", value: (s) => s.N },
  { key: "h", label: "Horas", value: (s) => Math.round(s.hours * 10) / 10 },
  { key: "L", label: "Libres", value: (s) => s.libres },
  { key: "V", label: "Vac.", value: (s) => s.vacaciones },
  { key: "F", label: "Findes", value: (s) => s.weekends },
];

export const fileStem = (r: Pick<MonthReport, "year" | "month">) => `horario-${r.year}-${String(r.month).padStart(2, "0")}`;
/** "12/10/2026 09:41" */
export const stampOf = (d: Date) =>
  `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
