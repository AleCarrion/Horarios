import { monthDates } from "./dates";
import { allowedShifts } from "./rules";
import { isActive, isOff, type Schedule, type ShiftCode, type Staff } from "./types";

export interface Coverage {
  M: number;
  T: number;
  N: number;
  ok: boolean;
}

export interface Issue {
  kind: "coverage" | "forbidden" | "rest" | "streak" | "restStreak";
  date: string;
  staffId?: string;
  message: string;
}

/** Maximum consecutive working days before the schedule is flagged. */
export const MAX_CONSECUTIVE_DAYS = 6;
/** Maximum consecutive libre days (D) for everyone except mozos. Vacations (V) and out-of-roster days (B) are not counted. */
export const MAX_REST_RUN = 3;

export interface Validation {
  coverage: Record<string, Coverage>;
  issues: Issue[];
}

/** Each of M/T/N needs exactly one person per day; extra people are flagged as over-coverage. */
export function validateSchedule(schedule: Schedule, staff: Staff[], year: number, month: number, history?: Schedule): Validation {
  const dates = monthDates(year, month);
  const coverage: Record<string, Coverage> = {};
  const issues: Issue[] = [];

  for (const d of dates) {
    const c = { M: 0, T: 0, N: 0, ok: true };
    for (const s of staff) {
      const code = schedule[s.id]?.[d];
      if (code === "M" || code === "T" || code === "N") c[code]++;
    }
    c.ok = c.M === 1 && c.T === 1 && c.N === 1;
    coverage[d] = c;
    for (const k of ["M", "T", "N"] as const) {
      if (c[k] === 0) issues.push({ kind: "coverage", date: d, message: `Falta cobertura de ${k} el ${d}` });
      if (c[k] > 1) issues.push({ kind: "coverage", date: d, message: `Exceso de cobertura de ${k} el ${d}` });
    }
  }

  // What each person was doing right before the 1st (the previous month), so streaks and rest runs carry over.
  const before = (id: string): { streak: number; restRun: number; prev: ShiftCode | undefined } => {
    const row = history?.[id];
    if (!row) return { streak: 0, restRun: 0, prev: undefined };
    const days = Object.keys(row).filter((d) => d < dates[0]).sort();
    let streak = 0;
    let restRun = 0;
    for (let i = days.length - 1; i >= 0 && !isOff(row[days[i]]); i--) streak++;
    for (let i = days.length - 1; i >= 0 && row[days[i]] === "D"; i--) restRun++;
    return { streak, restRun, prev: days.length ? row[days[days.length - 1]] : undefined };
  };

  for (const s of staff) {
    const start = before(s.id);
    let streak = start.streak;
    let restRun = start.restRun;
    dates.forEach((d, i) => {
      restRun = schedule[s.id]?.[d] === "D" ? restRun + 1 : 0;
      if (s.role !== "mozo" && (restRun === MAX_REST_RUN + 1 || (i === 0 && restRun > MAX_REST_RUN + 1)))
        issues.push({ kind: "restStreak", date: d, staffId: s.id, message: `${s.name}: más de ${MAX_REST_RUN} días libres seguidos (hasta el ${d})` });
      streak = isOff(schedule[s.id]?.[d]) ? 0 : streak + 1;
      if (streak === MAX_CONSECUTIVE_DAYS + 1 || (i === 0 && streak > MAX_CONSECUTIVE_DAYS))
        issues.push({ kind: "streak", date: d, staffId: s.id, message: `${s.name}: más de ${MAX_CONSECUTIVE_DAYS} días seguidos trabajando (hasta el ${d})` });
      const code = schedule[s.id]?.[d];
      if (!code) return;
      if (!isActive(s, d) && !isOff(code))
        issues.push({ kind: "forbidden", date: d, staffId: s.id, message: `${s.name} no está en plantilla el ${d}` });
      if (!allowedShifts(s).includes(code))
        issues.push({ kind: "forbidden", date: d, staffId: s.id, message: `${s.name} no puede hacer ${code}` });
      if ((i > 0 || start.prev) && (s.role === "receptionist" || s.extraShifts)) {
        const prev = i > 0 ? schedule[s.id][dates[i - 1]] : start.prev;
        if ((prev === "T" && code === "M") || (s.role === "receptionist" && prev === "N" && !isOff(code) && code !== "N"))
          issues.push({ kind: "rest", date: d, staffId: s.id, message: `${s.name}: descanso insuficiente el ${d}` });
      }
    });
  }
  return { coverage, issues };
}
