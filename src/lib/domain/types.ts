export type ShiftCode = "M" | "T" | "N" | "S" | "P" | "MZ" | "D";

export type Role = "night_auditor" | "director" | "senior" | "receptionist" | "mozo";

export interface Staff {
  id: string;
  name: string;
  role: Role;
  /** Mozos: first day (YYYY-MM-DD) of any 5-work block; the 5-5 cycle is derived from it. */
  cycleAnchor?: string;
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
  D: { code: "D", label: "Descanso", start: "", end: "" },
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
  seed?: number;
}

export interface Warning {
  date: string;
  shift: "M" | "T" | "N";
  message: string;
}

export interface GeneratorResult {
  schedule: Schedule;
  warnings: Warning[];
  stats: Record<string, { worked: number; rest: number; M: number; T: number; N: number }>;
}
