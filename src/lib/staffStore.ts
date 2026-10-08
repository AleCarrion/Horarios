import { DEFAULT_STAFF } from "./domain/roster";
import { sortBySections } from "./domain/team";
import type { Staff } from "./domain/types";

const KEY = "horarios:team";
const LEGACY_DATES_KEY = "horarios:roster";

/** The team kept on this device: names, puestos, order and alta/baja dates. */
export function readRoster(): Staff[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return sortBySections(JSON.parse(raw) as Staff[]);
    // First run after the team became editable: start from the default team plus any alta/baja dates saved before.
    const legacy = JSON.parse(localStorage.getItem(LEGACY_DATES_KEY) ?? "{}") as Record<string, { activeFrom?: string; activeTo?: string }>;
    return DEFAULT_STAFF.map((s) => ({ ...s, ...legacy[s.id] }));
  } catch {
    return DEFAULT_STAFF;
  }
}

export function writeRoster(staff: Staff[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(staff));
  } catch {}
}
