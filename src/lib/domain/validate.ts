import { monthDates } from "./dates";
import { allowedShifts } from "./rules";
import { DEFAULT_RULES, type Rules } from "./ruleset";
import { isoMinutes, restBetween, restBlocks } from "./hours";
import { isActive, isCoverShift, isOff, type Schedule, type ShiftCode, type Staff } from "./types";

export interface Coverage {
  M: number;
  T: number;
  N: number;
  ok: boolean;
}

export interface Issue {
  kind: "coverage" | "forbidden" | "rest" | "streak" | "restStreak" | "monthlyRest" | "weeklyRest";
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
export function validateSchedule(schedule: Schedule, staff: Staff[], year: number, month: number, history?: Schedule, rules: Rules = DEFAULT_RULES): Validation {
  const MAX_CONSECUTIVE_DAYS = rules.maxWorkRun;
  const MAX_REST_RUN = rules.maxRestRun;
  const dates = monthDates(year, month);
  const coverage: Record<string, Coverage> = {};
  const issues: Issue[] = [];

  for (const d of dates) {
    const c = { M: 0, T: 0, N: 0, ok: true };
    for (const s of staff) {
      const code = schedule[s.id]?.[d];
      if (isCoverShift(code)) c[code]++;
    }
    c.ok = c.M === 1 && c.T === 1 && c.N === 1;
    if (rules.onePartido && staff.filter((s) => schedule[s.id]?.[d] === "P").length > 1) issues.push({ kind: "coverage", date: d, message: `Hay más de una persona de partido el ${d}` });
    coverage[d] = c;
    for (const k of ["M", "T", "N"] as const) {
      if (c[k] === 0) issues.push({ kind: "coverage", date: d, message: `Falta cobertura de ${k} el ${d}` });
      if (c[k] > 1) issues.push({ kind: "coverage", date: d, message: `Exceso de cobertura de ${k} el ${d}` });
    }
  }

  // What each person was doing right before the 1st (the previous month), so streaks and rest runs carry over.
  const before = (id: string): { streak: number; restRun: number; prev: ShiftCode | undefined; prevDate?: string } => {
    const row = history?.[id];
    if (!row) return { streak: 0, restRun: 0, prev: undefined };
    const days = Object.keys(row).filter((d) => d < dates[0]).sort();
    let streak = 0;
    let restRun = 0;
    for (let i = days.length - 1; i >= 0 && !isOff(row[days[i]]); i--) streak++;
    for (let i = days.length - 1; i >= 0 && row[days[i]] === "D"; i--) restRun++;
    const last = days[days.length - 1];
    return { streak, restRun, prev: last ? row[last] : undefined, prevDate: last };
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
      // Estatuto de los Trabajadores, art. 34.3: at least 12 h between the end of a shift and the start of the next
      const prevDate = i > 0 ? dates[i - 1] : start.prevDate;
      const prev = i > 0 ? schedule[s.id]?.[dates[i - 1]] : start.prev;
      const gap = prevDate ? restBetween(prev, prevDate, code, d) : null;
      if (gap !== null && gap < rules.minRestHours * 60)
        issues.push({ kind: "rest", date: d, staffId: s.id, message: `${s.name}: solo ${Math.round((gap / 60) * 10) / 10} h de descanso entre turnos el ${d} (mínimo ${rules.minRestHours} h)` });
    });

    // Most libres in a month (mozos follow their 5-5 cycle; the director rests every weekend and holiday)
    if (s.role !== "mozo" && s.role !== "director") {
      const libres = dates.filter((d) => schedule[s.id]?.[d] === "D");
      if (libres.length > rules.maxMonthlyRest)
        issues.push({ kind: "monthlyRest", date: libres[rules.maxMonthlyRest], staffId: s.id, message: `${s.name}: ${libres.length} días libres este mes (máximo ${rules.maxMonthlyRest})` });
    }

    // Weekly rest (convenio de Sevilla, art. 30): every Mon–Sun week a rest of weeklyRestHours in a row, or a double one within 14 days
    const row = { ...history?.[s.id], ...schedule[s.id] };
    const need = rules.weeklyRestHours * 60;
    // each week belongs to the month that has its Thursday (as ISO weeks do); days of next month are not planned yet and count as rest
    for (const thursday of dates.filter((d) => new Date(d + "T00:00:00Z").getUTCDay() === 4)) {
      const mon = isoMinutes(thursday) - 3 * 1440;
      const sun = mon + 6 * 1440;
      const sunday = new Date(sun * 60000).toISOString().slice(0, 10);
      const span = [];
      for (let t = mon - 7 * 1440; t <= sun + 7 * 1440; t += 1440) span.push(new Date(t * 60000).toISOString().slice(0, 10));
      const blocks = restBlocks(row, span);
      const weekEnd = sun + 1440;
      const overlap = ([a, b]: [number, number], x: number, y: number) => Math.min(b, y) - Math.max(a, x);
      const ok =
        blocks.some((b) => overlap(b, mon, weekEnd) >= need) ||
        blocks.some((b) => b[1] - b[0] >= 2 * need && (overlap(b, mon - 7 * 1440, mon) > 0 || overlap(b, weekEnd, weekEnd + 7 * 1440) > 0));
      if (!ok)
        issues.push({ kind: "weeklyRest", date: sunday <= dates[dates.length - 1] ? sunday : dates[dates.length - 1], staffId: s.id, message: `${s.name}: la semana que acaba el ${sunday} no tiene ${rules.weeklyRestHours} h seguidas de descanso` });
    }
  }
  return { coverage, issues };
}
