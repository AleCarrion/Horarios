import { diffDays, toISO } from "./dates";
import type { Role, Staff } from "./types";

export interface Section {
  /** Built-in puestos use their role as id; the hotel's own are "p-1"… */
  id: string;
  /** The built-in puesto the planner treats it like. */
  role: Role;
  label: string;
  color: string;
  custom: boolean;
}

/** Sections of the grid, in the order of the hotel's sheet. The hotel can rename, recolour and add to them (see catalog.ts). */
export const SECTIONS: Section[] = [
  { id: "director", role: "director", label: "Dirección", color: "#0284c7", custom: false },
  { id: "senior", role: "senior", label: "Apoyo / Partido", color: "#8b5cf6", custom: false },
  { id: "receptionist", role: "receptionist", label: "Recepción", color: "#f97316", custom: false },
  { id: "night_auditor", role: "night_auditor", label: "Noche", color: "#4f46e5", custom: false },
  { id: "mozo", role: "mozo", label: "Mozos", color: "#0d9488", custom: false },
];
/** The section a person sits in: their own puesto if it still exists, otherwise the built-in one. */
export const sectionIdOf = (s: Pick<Staff, "role" | "position">) => (s.position && SECTIONS.some((x) => x.id === s.position) ? s.position : s.role);
export const sectionOf = (s: Pick<Staff, "role" | "position">): Section => SECTIONS.find((x) => x.id === sectionIdOf(s))!;
const sectionIndex = (id: string) => SECTIONS.findIndex((s) => s.id === id);

/** Stable sort by section; people keep their relative order inside a section. */
export function sortBySections(staff: Staff[]): Staff[] {
  return staff
    .map((s, i) => ({ s, i }))
    .sort((a, b) => sectionIndex(sectionIdOf(a.s)) - sectionIndex(sectionIdOf(b.s)) || a.i - b.i)
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

/** Moves `id` into the section `sectionId`, right before `beforeId` (or at the end when null). */
export function moveStaff(staff: Staff[], id: string, sectionId: string, beforeId: string | null): Staff[] {
  const person = staff.find((s) => s.id === id);
  const sec = SECTIONS.find((x) => x.id === sectionId);
  if (!person || !sec) return staff;
  const sorted = sortBySections(staff);
  const without = sorted.filter((s) => s.id !== id);
  let moved = person;
  if (sectionIdOf(person) !== sec.id) {
    moved = person.role === sec.role ? { ...person } : withRole(person, sec.role, staff);
    if (sec.custom) moved.position = sec.id;
    else delete moved.position;
  }
  let at = beforeId ? without.findIndex((s) => s.id === beforeId) : -1;
  if (at === -1) {
    // end of the section: after the last member of it, or at its slot between sections when empty
    const last = without.map(sectionIdOf).lastIndexOf(sec.id);
    at = last === -1 ? without.findIndex((s) => sectionIndex(sectionIdOf(s)) > sectionIndex(sec.id)) : last + 1;
    if (at === -1) at = without.length;
  }
  const result = [...without.slice(0, at), moved, ...without.slice(at)];
  return JSON.stringify(result) === JSON.stringify(sorted) ? staff : result;
}

/** Changes a person's puesto; they end up at the end of the new section. */
export function changeRole(staff: Staff[], id: string, sectionId: string): Staff[] {
  const person = staff.find((s) => s.id === id);
  if (!person || sectionIdOf(person) === sectionId) return staff;
  return moveStaff(staff, id, sectionId, null);
}

const slug = (name: string) =>
  name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "persona";

export function addStaff(staff: Staff[], { name, role: sectionId }: { name: string; role: string }): Staff[] {
  const clean = name.trim();
  if (!clean) return staff;
  const base = slug(clean);
  let id = base;
  for (let n = 2; staff.some((s) => s.id === id); n++) id = `${base}-${n}`;
  const sec = SECTIONS.find((x) => x.id === sectionId) ?? SECTIONS[0];
  const person = withRole({ id, name: clean, role: sec.role }, sec.role, staff);
  if (sec.custom) person.position = sec.id;
  return moveStaff([...staff, person], id, sec.id, null);
}

export function updateStaff(staff: Staff[], id: string, patch: Partial<Staff>): Staff[] {
  return staff.map((s) => (s.id === id ? { ...s, ...patch, id: s.id } : s));
}

export function removeStaff(staff: Staff[], id: string): Staff[] {
  return staff.filter((s) => s.id !== id);
}
