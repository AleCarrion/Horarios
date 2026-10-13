/** The hotel's scheduling rules that the manager may want to change without a programmer. */
export interface Rules {
  /** Most working days in a row that is allowed (above it the schedule shows a warning). */
  maxWorkRun: number;
  /** Working days in a row the planner aims not to exceed (it only goes up to `maxWorkRun` when it cannot cover a shift otherwise). */
  preferredWorkRun: number;
  /** Most libre days in a row (mozos and holidays are exempt). */
  maxRestRun: number;
  /** Only one person on "partido" a day. */
  onePartido: boolean;
  /** Local holidays: "YYYY-MM-DD" for one year, or "MM-DD" for every year. The director rests on them like on national ones. */
  localHolidays: string[];
  /** Most libre days (L) a person may have in a month (mozos, with their 5-5 cycle, and the director, who rests weekends and holidays, are exempt). */
  maxMonthlyRest: number;
  /**
   * Least hours between the end of one shift and the start of the next. The Estatuto (art. 34.3) asks for 12; in hostelería it may
   * go down to 10 if the difference is given back within four weeks (RD 1561/1995, art. 19). Below this it is a warning; the planner
   * still aims for 12 whenever it can.
   */
  minRestHours: number;
  /**
   * Weekly rest: hours in a row without work every week (Mon–Sun), which may be joined into one double rest within 14 days.
   * Convenio de Hostelería de Sevilla, art. 30: a day and a half (36 h) in centres with up to 25 permanent staff, two days (48 h) above.
   */
  weeklyRestHours: number;
  /** Version of these defaults; older saved rules are brought up to date once (e.g. no more 6 days in a row). */
  v: number;
}

export const RULES_VERSION = 2;

/** The hotel's rules: what the hotel agreed plus the Convenio de Hostelería de Sevilla 2025-2028 and the Estatuto de los Trabajadores. */
export const DEFAULT_RULES: Rules = {
  maxWorkRun: 5,
  preferredWorkRun: 5,
  maxRestRun: 3,
  onePartido: true,
  localHolidays: [],
  maxMonthlyRest: 11,
  minRestHours: 10,
  weeklyRestHours: 36,
  v: RULES_VERSION,
};

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const HOLIDAY = /^(\d{4}-)?(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const isHolidayEntry = (s: string) => HOLIDAY.test(s);

/** Makes any stored or typed value a usable set of rules (unknown keys dropped, numbers clamped, preferred <= max). */
export function normalizeRules(input: Partial<Rules> | null | undefined): Rules {
  let maxWorkRun = int(input?.maxWorkRun, 3, 10, DEFAULT_RULES.maxWorkRun);
  // Rules saved before version 2 allowed 6 days in a row: nobody works 6 days in a row any more.
  if (input && (typeof input.v !== "number" || input.v < 2)) maxWorkRun = Math.min(maxWorkRun, 5);
  return {
    maxWorkRun,
    preferredWorkRun: Math.min(maxWorkRun, int(input?.preferredWorkRun, 2, 10, DEFAULT_RULES.preferredWorkRun)),
    maxRestRun: int(input?.maxRestRun, 1, 7, DEFAULT_RULES.maxRestRun),
    onePartido: typeof input?.onePartido === "boolean" ? input.onePartido : DEFAULT_RULES.onePartido,
    localHolidays: [...new Set((input?.localHolidays ?? []).filter((x): x is string => typeof x === "string" && HOLIDAY.test(x)))].sort(),
    maxMonthlyRest: int(input?.maxMonthlyRest, 6, 16, DEFAULT_RULES.maxMonthlyRest),
    minRestHours: int(input?.minRestHours, 8, 16, DEFAULT_RULES.minRestHours),
    weeklyRestHours: int(input?.weeklyRestHours, 24, 72, DEFAULT_RULES.weeklyRestHours),
    v: RULES_VERSION,
  };
}

/** The local holidays that fall in `year`, as full dates. */
export function localHolidaysOf(rules: Rules, year: number): string[] {
  return rules.localHolidays.flatMap((h) => (h.length === 5 ? [`${year}-${h}`] : h.startsWith(`${year}-`) ? [h] : []));
}
