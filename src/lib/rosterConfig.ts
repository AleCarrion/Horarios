import { DEFAULT_STAFF, EXTRA_RECEPTIONIST } from "./domain/roster";
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

/** The month's staff in grid order: the base roster (plus the temporary receptionist after Marcos) with alta/baja dates applied. */
export function buildStaff(withExtra: boolean, overrides: RosterOverrides): Staff[] {
  const i = DEFAULT_STAFF.findIndex((x) => x.id === "marcos") + 1;
  const base = withExtra ? [...DEFAULT_STAFF.slice(0, i), EXTRA_RECEPTIONIST, ...DEFAULT_STAFF.slice(i)] : DEFAULT_STAFF;
  return base.map((s) => ({ ...s, ...overrides[s.id] }));
}
