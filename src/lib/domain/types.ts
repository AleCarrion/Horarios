/** V = vacaciones, B = fuera de plantilla (not employed that day). Both count as non-working. */
export type ShiftCode = "M" | "T" | "N" | "S" | "P" | "MZ" | "D" | "V" | "B";

export type Role = "night_auditor" | "director" | "senior" | "receptionist" | "mozo";

export interface Staff {
  id: string;
  name: string;
  role: Role;
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
}

export const SHIFTS: Record<ShiftCode, ShiftDef> = {
  M: { code: "M", label: "Mañana", start: "07:00", end: "15:00" },
  T: { code: "T", label: "Tarde", start: "15:00", end: "23:00" },
  N: { code: "N", label: "Noche", start: "23:00", end: "07:00" },
  S: { code: "S", label: "Supervisión", start: "09:15", end: "17:15" },
  P: { code: "P", label: "Partido", start: "09:15", end: "17:15" },
  MZ: { code: "MZ", label: "Mozo", start: "11:00", end: "19:00" },
  D: { code: "D", label: "Libre", start: "", end: "" },
  V: { code: "V", label: "Vacaciones", start: "", end: "" },
  B: { code: "B", label: "Fuera de plantilla", start: "", end: "" },
};

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
  /** Shift of each staff member on the day before day 1 (cross-month rules). */
  prevDay?: Record<string, ShiftCode>;
  /** Extra senior rest days (YYYY-MM-DD) per staff id. */
  seniorRestDays?: Record<string, string[]>;
  /** Planned rest days per senior in the month (default 10, as in the hotel's real rota). */
  seniorRestCount?: number;
  /** Fixed non-working days per staff id: "V" vacation or "B" not employed that day. Cover is planned around them. */
  unavailable?: Record<string, Record<string, "V" | "B">>;
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
export const DISPLAY_CODE: Record<ShiftCode, string> = { M: "M", T: "T", N: "N", S: "S", P: "P", MZ: "P", D: "L", V: "V", B: "" };
export const displayCode = (c: ShiftCode) => DISPLAY_CODE[c];

/** True for any day without work (libre, vacaciones, fuera de plantilla). */
export const isOff = (c: ShiftCode | undefined) => !c || c === "D" || c === "V" || c === "B";

/** Whether the person is on the roster on that day (alta/baja dates). */
export const isActive = (s: Pick<Staff, "activeFrom" | "activeTo">, date: string) =>
  (!s.activeFrom || date >= s.activeFrom) && (!s.activeTo || date <= s.activeTo);
