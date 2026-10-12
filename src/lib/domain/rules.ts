import { SHIFTS, type Role, type ShiftCode, type Staff } from "./types";

const BASE: Record<Role, ShiftCode[]> = {
  night_auditor: ["N", "D"],
  director: ["S", "D"],
  senior: ["P", "D"],
  receptionist: ["M", "T", "N", "D"],
  mozo: ["MZ", "D"],
};

/** Shifts a person may be assigned: their role's shifts plus any `extraShifts` (e.g. Julio covers M/T). */
export function allowedShifts(s: Staff): ShiftCode[] {
  const own = Object.keys(SHIFTS).filter((c) => SHIFTS[c].custom && !SHIFTS[c].archived);
  return [...new Set([...BASE[s.role], ...(s.extraShifts ?? []), "V", "A", "B", ...own] as ShiftCode[])];
}
