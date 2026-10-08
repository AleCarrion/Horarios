import { DEFAULT_STAFF } from "./domain/roster";
import type { Staff } from "./domain/types";

/** Alta/baja dates per person, kept on this device (applies to every month). */
export type RosterOverrides = Record<string, { activeFrom?: string; activeTo?: string }>;

const KEY = "horarios:roster";

export function readOverrides(): RosterOverrides {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as RosterOverrides;
  } catch {
    return {};
  }
}

export function writeOverrides(o: RosterOverrides) {
  try {
    localStorage.setItem(KEY, JSON.stringify(o));
  } catch {}
}

/** The month's staff in grid order, with alta/baja dates applied. */
export function buildStaff(overrides: RosterOverrides): Staff[] {
  return DEFAULT_STAFF.map((s) => ({ ...s, ...overrides[s.id] }));
}
