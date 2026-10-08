import { sortBySections } from "./domain/team";
import type { Role, ShiftCode, Staff } from "./domain/types";

/** `public.staff` row (see supabase/migrations/0002_staff_order.sql). */
export interface StaffRow {
  id: string;
  name: string;
  role: Role;
  cycle_anchor: string | null;
  sort_order: number;
  active: boolean;
  active_from: string | null;
  active_to: string | null;
  extra_shifts: string[] | null;
  max_covers: number | null;
}

/** Array position becomes sort_order. */
export function toStaffRows(staff: Staff[]): StaffRow[] {
  return staff.map((s, i) => ({
    id: s.id,
    name: s.name,
    role: s.role,
    cycle_anchor: s.cycleAnchor ?? null,
    sort_order: i,
    active: true,
    active_from: s.activeFrom ?? null,
    active_to: s.activeTo ?? null,
    extra_shifts: s.extraShifts ?? null,
    max_covers: s.maxCovers ?? null,
  }));
}

export function fromStaffRows(rows: StaffRow[]): Staff[] {
  return sortBySections(
    rows
      .filter((r) => r.active)
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((r) => {
        const s: Staff = { id: r.id, name: r.name, role: r.role };
        if (r.cycle_anchor) s.cycleAnchor = r.cycle_anchor;
        if (r.active_from) s.activeFrom = r.active_from;
        if (r.active_to) s.activeTo = r.active_to;
        if (r.extra_shifts) s.extraShifts = r.extra_shifts as ShiftCode[];
        if (r.max_covers !== null && r.max_covers !== undefined) s.maxCovers = r.max_covers;
        return s;
      }),
  );
}
