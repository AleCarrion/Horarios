import type { Role, ShiftCode, Staff } from "./types";

const BASE: Record<Role, ShiftCode[]> = {
  night_auditor: ["N", "D"],
  director: ["S", "D"],
  senior: ["P", "D"],
  receptionist: ["M", "T", "N", "D"],
  mozo: ["MZ", "D"],
};

/** Shifts a person may be assigned: their role's shifts plus any `extraShifts` (e.g. Julio covers M/T). */
export function allowedShifts(s: Staff): ShiftCode[] {
  return [...new Set([...BASE[s.role], ...(s.extraShifts ?? []), "V", "A", "B"] as ShiftCode[])];
}
