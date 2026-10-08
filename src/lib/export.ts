import { monthDates, toISO } from "./domain/dates";
import { SHIFTS, displayCode, isOff, type Schedule, type ShiftCode, type Staff } from "./domain/types";

/** Semicolon-separated with BOM so Spanish-locale Excel opens it correctly. */
export function toCSV(schedule: Schedule, staff: Staff[], year: number, month: number): string {
  const dates = monthDates(year, month);
  const header = ["Persona", ...dates.map((d) => String(Number(d.slice(8)))), "M", "T", "N", "Descansos"];
  const rows = staff.map((s) => {
    const codes = dates.map((d) => schedule[s.id]?.[d] ?? "D");
    const count = (c: ShiftCode) => codes.filter((x) => x === c).length;
    return [s.name, ...codes.map(displayCode), count("M"), count("T"), count("N"), count("D")];
  });
  const esc = (v: string | number) => {
    const s = String(v);
    return /[;"\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + [header, ...rows].map((r) => r.map(esc).join(";")).join("\r\n");
}

const icsEsc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
const compact = (iso: string) => iso.replace(/-/g, "");
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

function nextDay(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const n = new Date(Date.UTC(y, m - 1, d + 1));
  return toISO(n.getUTCFullYear(), n.getUTCMonth() + 1, n.getUTCDate());
}

/** Floating local times (no TZID) so each device shows the hotel's wall-clock hours. */
export function toICS(schedule: Schedule, person: Staff, year: number, month: number, now = new Date()): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hotel Casa 1800//Horarios//ES",
    "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${icsEsc(`Horario ${person.name}`)}`,
  ];
  for (const d of monthDates(year, month)) {
    const code = schedule[person.id]?.[d];
    if (!code || isOff(code)) continue;
    const def = SHIFTS[code];
    const endDay = def.end < def.start ? nextDay(d) : d;
    lines.push(
      "BEGIN:VEVENT",
      `UID:${person.id}-${compact(d)}@horarios.casa1800`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART:${compact(d)}T${def.start.replace(":", "")}00`,
      `DTEND:${compact(endDay)}T${def.end.replace(":", "")}00`,
      `SUMMARY:${icsEsc(`${def.label} (${code})`)}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n") + "\r\n";
}
