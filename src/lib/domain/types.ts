import type { Rules } from "./ruleset";
/** V = vacaciones, B = fuera de plantilla (not employed that day). Both count as non-working. */
export type BuiltinShift = "M" | "T" | "N" | "S" | "P" | "MZ" | "D" | "V" | "A" | "B";
/** The ten shifts the engine knows, plus any shift the hotel creates itself (see catalog.ts): those are placed by hand only. */
export type ShiftCode = BuiltinShift | (string & {});

export type Role = "night_auditor" | "director" | "senior" | "receptionist" | "mozo";

export interface Staff {
  id: string;
  name: string;
  role: Role;
  /** The hotel's own puesto (catalog id such as "p-1"); `role` is then the built-in puesto it behaves like. Absent = the built-in puesto. */
  position?: string;
  /** Mozos: first day (YYYY-MM-DD) of any 5-work block; the 5-5 cycle is derived from it. */
  cycleAnchor?: string;
  /** First day (YYYY-MM-DD, inclusive) the person is on the roster; earlier days are "B" (fuera de plantilla). */
  activeFrom?: string;
  /** Last day (inclusive) the person is on the roster; later days are "B". */
  activeTo?: string;
  /** Seniors only: extra shifts they can cover besides P (e.g. ["M", "T"]). */
  extraShifts?: ShiftCode[];
  /** Seniors only: max M/T covers per month (defaults to config.maxSeniorMornings). */
  maxCovers?: number;
}

export interface ShiftDef {
  code: ShiftCode;
  label: string;
  start: string;
  end: string;
  /** Hex colour of the cell (set from the hotel's catalog). */
  color?: string;
  /** Shifts created by the hotel: "work" counts as a worked day, "off" as a day without work. */
  custom?: "work" | "off";
  /** A shift of the hotel that is no longer offered (cells that use it still show it). */
  archived?: boolean;
}

/** Live table of shifts: starts as the defaults and is rewritten by `applyCatalog` with the hotel's names, hours and colours. */
const SHIFT_TABLE: Record<string, ShiftDef> = {
  M: { code: "M", label: "Mañana", start: "07:00", end: "15:00", color: "#ffff00" },
  T: { code: "T", label: "Tarde", start: "15:00", end: "23:00", color: "#bdd7ee" },
  N: { code: "N", label: "Noche", start: "23:00", end: "07:00", color: "#0070c0" },
  S: { code: "S", label: "Supervisión", start: "09:15", end: "17:15", color: "#4472c4" },
  P: { code: "P", label: "Partido", start: "09:15", end: "17:15", color: "#ffc000" },
  MZ: { code: "MZ", label: "Mozo", start: "11:00", end: "19:00", color: "#00b0f0" },
  D: { code: "D", label: "Libre", start: "", end: "", color: "#92d050" },
  V: { code: "V", label: "Vacaciones", start: "", end: "", color: "#ff0000" },
  A: { code: "A", label: "Ausencia / baja", start: "", end: "", color: "#7030a0" },
  B: { code: "B", label: "Fuera de plantilla", start: "", end: "", color: "#000000" },
};

/**
 * A shift code that is not known (yet): shown with its own code, in grey. It happens for a moment when another device has
 * created a shift and its cells arrive before the hotel's catalog does.
 */
const UNKNOWN = (code: string): ShiftDef => ({ code, label: code, start: "", end: "", color: "#a3a3a3" });
export const SHIFTS: Record<string, ShiftDef> = new Proxy(SHIFT_TABLE, {
  get: (t, k) => (typeof k === "string" ? (t[k] ?? UNKNOWN(k)) : undefined),
});

/** staffId -> (YYYY-MM-DD -> shift) */
export type Schedule = Record<string, Record<string, ShiftCode>>;

export interface GeneratorConfig {
  year: number;
  /** 1-12 */
  month: number;
  staff: Staff[];
  /** Manual JC rest days; when omitted they are auto-distributed. */
  jcRestDays?: string[];
  jcRestCount?: number;
  /** Max mornings a single senior may cover per month. */
  maxSeniorMornings?: number;
  /** Max consecutive working days for receptionists. */
  maxStreak?: number;
  /** Local holidays (YYYY-MM-DD) on top of the national ones; the director rests on all of them. */
  extraHolidays?: string[];
  /** The hotel's editable rules (defaults when omitted). */
  rules?: Rules;
  /** The previous month (or just its last days): streaks, rest runs and shift blocks carry over into this month. */
  history?: Schedule;
  /** Shift of each staff member on the day before day 1 (cross-month rules). Superseded by `history`. */
  prevDay?: Record<string, ShiftCode>;
  /** Extra senior rest days (YYYY-MM-DD) per staff id. */
  seniorRestDays?: Record<string, string[]>;
  /** Planned rest days per senior in the month (default 10, as in the hotel's real rota). */
  seniorRestCount?: number;
  /**
   * Cells that must stay exactly as given (frozen days, locked cells, approved requests). D/V/B pin a day off;
   * M/T/N pin a receptionist's (or covering senior's) shift. Everything else is planned around them.
   */
  pinned?: Record<string, Record<string, ShiftCode>>;
  /** The schedule being repaired: the planner prefers keeping each person on the shift they already had. */
  baseline?: Schedule;
  /** How strongly to prefer the baseline (default 80). Higher values change fewer cells but may break block rotation. */
  baselineKeep?: number;
  /** Fixed non-working days per staff id: "V" vacation or "B" not employed that day. Cover is planned around them. */
  unavailable?: Record<string, Record<string, ShiftCode>>;
  seed?: number;
}

export interface Warning {
  /** "coverage": a shift is uncovered. "cap": a senior went over their monthly cover limit to avoid a gap. "streak": a receptionist works a 6th day (legal limit) to avoid a gap. */
  kind: "coverage" | "cap" | "streak";
  date: string;
  shift: "M" | "T" | "N";
  message: string;
}

export interface GeneratorResult {
  schedule: Schedule;
  warnings: Warning[];
  stats: Record<string, { worked: number; rest: number; off: number; M: number; T: number; N: number }>;
}

/** Letter shown to users, matching the hotel's Excel: L for libre, P for the mozo shift. */
export const DISPLAY_CODE: Record<string, string> = { M: "M", T: "T", N: "N", S: "S", P: "P", MZ: "P", D: "L", V: "V", A: "A", B: "" };
export const displayCode = (c: ShiftCode) => DISPLAY_CODE[c] ?? c;

/** True for any day without work (libre, vacaciones, fuera de plantilla). */
export const isOff = (c: ShiftCode | undefined) => !c || c === "D" || c === "V" || c === "A" || c === "B" || SHIFTS[c]?.custom === "off";

/** The three shifts that must be covered every day. */
export const isCoverShift = (c: string | undefined): c is "M" | "T" | "N" => c === "M" || c === "T" || c === "N";

/** Day-off and preferred-shift requests the planner can re-plan around. */
export const isPlanKind = (c: string): c is "D" | "V" | "A" | "M" | "T" | "N" => c === "D" || c === "V" || c === "A" || isCoverShift(c);

/** A shift created by the hotel (not one of the ten built in). */
export const isCustomShift = (c: ShiftCode | undefined) => Boolean(c && SHIFTS[c]?.custom);

/** Cells the planner never moves: vacaciones, ausencia, fuera de plantilla and the hotel's own shifts. */
export const isFixedCell = (c: ShiftCode | undefined) => c === "V" || c === "A" || c === "B" || isCustomShift(c);

/** Whether the person is on the roster on that day (alta/baja dates). */
export const isActive = (s: Pick<Staff, "activeFrom" | "activeTo">, date: string) =>
  (!s.activeFrom || date >= s.activeFrom) && (!s.activeTo || date <= s.activeTo);

/** Whether the person is on the roster on any day of that month (alta/baja dates). */
export const activeInMonth = (s: Pick<Staff, "activeFrom" | "activeTo">, year: number, month: number) => {
  const first = `${year}-${String(month).padStart(2, "0")}-01`;
  const last = `${year}-${String(month).padStart(2, "0")}-31`;
  return (!s.activeFrom || s.activeFrom <= last) && (!s.activeTo || s.activeTo >= first);
};
