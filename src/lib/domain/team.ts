import { diffDays, toISO } from "./dates";
import type { Role, Staff } from "./types";

/** Sections of the grid, in the order of the hotel's sheet. */
export const SECTIONS: { role: Role; label: string }[] = [
  { role: "director", label: "Dirección" },
  { role: "senior", label: "Apoyo / Partido" },
  { role: "receptionist", label: "Recepción" },
  { role: "night_auditor", label: "Noche" },
  { role: "mozo", label: "Mozos" },
];
const sectionIndex = (r: Role) => SECTIONS.findIndex((s) => s.role === r);

/** Stable sort by section; people keep their relative order inside a section. */
export function sortBySections(staff: Staff[]): Staff[] {
  return staff
    .map((s, i) => ({ s, i }))
    .sort((a, b) => sectionIndex(a.s.role) - sectionIndex(b.s.role) || a.i - b.i)
    .map((x) => x.s);
}

const addDays = (iso: string, n: number) => {
  const [y, m, d] = iso.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return toISO(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
};

/** Role-specific settings: seniors cover mornings, mozos need a 5-5 cycle anchor. */
function withRole(person: Staff, role: Role, all: Staff[]): Staff {
  const { extraShifts: _e, maxCovers: _m, cycleAnchor: _c, ...rest } = person;
  void _e; void _m; void _c;
  const next: Staff = { ...rest, role };
  if (role === "senior") {
    next.extraShifts = ["M"];
    next.maxCovers = 3;
  }
  if (role === "mozo") {
    const other = all.find((s) => s.role === "mozo" && s.id !== person.id && s.cycleAnchor);
    // offset 5 days from an existing mozo so exactly one is always in
    next.cycleAnchor = other?.cycleAnchor ? addDays(other.cycleAnchor, 5) : "2026-01-01";
    if (other?.cycleAnchor && diffDays(next.cycleAnchor, other.cycleAnchor) === 0) next.cycleAnchor = "2026-01-01";
  }
  return next;
}

/** Moves `id` into `role`'s section, right before `beforeId` (or at the end when null). */
export function moveStaff(staff: Staff[], id: string, role: Role, beforeId: string | null): Staff[] {
  const person = staff.find((s) => s.id === id);
  if (!person) return staff;
  const sorted = sortBySections(staff);
  const without = sorted.filter((s) => s.id !== id);
  const moved = person.role === role ? person : withRole(person, role, staff);
  let at = beforeId ? without.findIndex((s) => s.id === beforeId) : -1;
  if (at === -1) {
    // end of the section: after the last member of `role`, or at its slot between sections when empty
    const last = without.map((s) => s.role).lastIndexOf(role);
    at = last === -1 ? without.findIndex((s) => sectionIndex(s.role) > sectionIndex(role)) : last + 1;
    if (at === -1) at = without.length;
  }
  const result = [...without.slice(0, at), moved, ...without.slice(at)];
  return JSON.stringify(result) === JSON.stringify(sorted) ? staff : result;
}

/** Changes a person's puesto; they end up at the end of the new section. */
export function changeRole(staff: Staff[], id: string, role: Role): Staff[] {
  const person = staff.find((s) => s.id === id);
  if (!person || person.role === role) return staff;
  return moveStaff(staff, id, role, null);
}

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "persona";

export function addStaff(staff: Staff[], { name, role }: { name: string; role: Role }): Staff[] {
  const clean = name.trim();
  if (!clean) return staff;
  const base = slug(clean);
  let id = base;
  for (let n = 2; staff.some((s) => s.id === id); n++) id = `${base}-${n}`;
  const person = withRole({ id, name: clean, role }, role, staff);
  return moveStaff([...staff, person], id, role, null);
}

export function updateStaff(staff: Staff[], id: string, patch: Partial<Staff>): Staff[] {
  return staff.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s));
}

export function removeStaff(staff: Staff[], id: string): Staff[] {
  return staff.filter((s) => s.id !== id);
}
