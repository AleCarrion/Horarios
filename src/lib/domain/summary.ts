import { isHoliday } from "./holidays";
import { isWeekend, monthDates } from "./dates";
import { SHIFTS, isOff, type Schedule, type Staff } from "./types";

export interface PersonSummary {
  staffId: string;
  /** Days with a shift. */
  worked: number;
  M: number;
  T: number;
  N: number;
  /** Supervisión, partido and mozo shifts (the day shifts of the other roles). */
  other: number;
  libres: number;
  vacaciones: number;
  ausencias: number;
  /** Saturdays and Sundays worked. */
  weekends: number;
  /** National or local holidays worked. */
  holidays: number;
  /** Hours worked in the month (night shifts count their full 8 h on the day they start). */
  hours: number;
}

const hoursOf = (code: keyof typeof SHIFTS) => {
  const { start, end } = SHIFTS[code];
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm);
  return (mins <= 0 ? mins + 24 * 60 : mins) / 60;
};

/** What each person has done in the month: the numbers a manager looks at to see that the work is shared fairly. */
export function summarizeMonth(schedule: Schedule, staff: Staff[], year: number, month: number, extraHolidays: string[] = []): PersonSummary[] {
  const dates = monthDates(year, month);
  return staff.map((s) => {
    const r: PersonSummary = { staffId: s.id, worked: 0, M: 0, T: 0, N: 0, other: 0, libres: 0, vacaciones: 0, ausencias: 0, weekends: 0, holidays: 0, hours: 0 };
    for (const d of dates) {
      const c = schedule[s.id]?.[d];
      if (!c || c === "B") continue;
      if (c === "D") r.libres++;
      else if (c === "V") r.vacaciones++;
      else if (c === "A") r.ausencias++;
      if (isOff(c)) continue;
      r.worked++;
      if (c === "M" || c === "T" || c === "N") r[c]++;
      else r.other++;
      if (isWeekend(d)) r.weekends++;
      if (isHoliday(d, extraHolidays)) r.holidays++;
      r.hours += hoursOf(c);
    }
    return r;
  });
}
