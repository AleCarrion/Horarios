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
}

export const DEFAULT_RULES: Rules = {
  maxWorkRun: 6,
  preferredWorkRun: 5,
  maxRestRun: 3,
  onePartido: true,
  localHolidays: [],
};

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = typeof v === "number" ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const HOLIDAY = /^(\d{4}-)?(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
export const isHolidayEntry = (s: string) => HOLIDAY.test(s);

/** Makes any stored or typed value a usable set of rules (unknown keys dropped, numbers clamped, preferred <= max). */
export function normalizeRules(input: Partial<Rules> | null | undefined): Rules {
  const maxWorkRun = int(input?.maxWorkRun, 3, 10, DEFAULT_RULES.maxWorkRun);
  return {
    maxWorkRun,
    preferredWorkRun: Math.min(maxWorkRun, int(input?.preferredWorkRun, 2, 10, DEFAULT_RULES.preferredWorkRun)),
    maxRestRun: int(input?.maxRestRun, 1, 7, DEFAULT_RULES.maxRestRun),
    onePartido: typeof input?.onePartido === "boolean" ? input.onePartido : DEFAULT_RULES.onePartido,
    localHolidays: [...new Set((input?.localHolidays ?? []).filter((x): x is string => typeof x === "string" && HOLIDAY.test(x)))].sort(),
  };
}

/** The local holidays that fall in `year`, as full dates. */
export function localHolidaysOf(rules: Rules, year: number): string[] {
  return rules.localHolidays.flatMap((h) => (h.length === 5 ? [`${year}-${h}`] : h.startsWith(`${year}-`) ? [h] : []));
}
