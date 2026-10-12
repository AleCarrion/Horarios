import { SECTIONS } from "./team";
import { DISPLAY_CODE, SHIFTS, type BuiltinShift, type Role, type ShiftDef } from "./types";

/**
 * How the hotel calls and paints things: names, letters, hours and colours of the shifts, plus its own extra shifts and puestos.
 * The engine keeps working with the built-in shifts and roles; what the hotel creates here is shown, counted and kept in place
 * (shifts) or behaves "like" one of the built-in puestos (positions).
 */
export interface ShiftSetting {
  label: string;
  /** What the cell shows (1–3 characters; may be empty for "fuera de plantilla"). */
  letter: string;
  start: string;
  end: string;
  /** Hex colour of the cell. */
  color: string;
}

export interface CustomShift extends ShiftSetting {
  /** Internal key, stored in the schedule (never shown): "X1", "X2"… */
  code: string;
  /** "work" = a worked day (counts for streaks and hours), "off" = a day without work. */
  counts: "work" | "off";
  /** No longer offered in the menu; cells that already use it keep their name and colour. */
  archived?: boolean;
}

export interface PositionDef {
  /** Built-in puestos use their role as id; the hotel's own start with "p-". */
  id: string;
  label: string;
  color: string;
  /** Which built-in puesto the planner treats this one like (rest rules, shifts it can do). */
  base: Role;
  custom?: boolean;
}

export interface Catalog {
  shifts: Record<BuiltinShift, ShiftSetting>;
  custom: CustomShift[];
  /** In the order they appear in the grid. */
  positions: PositionDef[];
}

export const BUILTIN_SHIFTS: BuiltinShift[] = ["M", "T", "N", "S", "P", "MZ", "D", "V", "A", "B"];

export const DEFAULT_CATALOG: Catalog = {
  shifts: {
    M: { label: "Mañana", letter: "M", start: "07:00", end: "15:00", color: "#ffff00" },
    T: { label: "Tarde", letter: "T", start: "15:00", end: "23:00", color: "#bdd7ee" },
    N: { label: "Noche", letter: "N", start: "23:00", end: "07:00", color: "#0070c0" },
    S: { label: "Supervisión", letter: "S", start: "09:15", end: "17:15", color: "#4472c4" },
    P: { label: "Partido", letter: "P", start: "09:15", end: "17:15", color: "#ffc000" },
    MZ: { label: "Mozo", letter: "P", start: "11:00", end: "19:00", color: "#00b0f0" },
    D: { label: "Libre", letter: "L", start: "", end: "", color: "#92d050" },
    V: { label: "Vacaciones", letter: "V", start: "", end: "", color: "#ff0000" },
    A: { label: "Ausencia / baja", letter: "A", start: "", end: "", color: "#7030a0" },
    B: { label: "Fuera de plantilla", letter: "", start: "", end: "", color: "#000000" },
  },
  custom: [],
  positions: [
    { id: "director", label: "Dirección", color: "#0284c7", base: "director" },
    { id: "senior", label: "Apoyo / Partido", color: "#8b5cf6", base: "senior" },
    { id: "receptionist", label: "Recepción", color: "#f97316", base: "receptionist" },
    { id: "night_auditor", label: "Noche", color: "#4f46e5", base: "night_auditor" },
    { id: "mozo", label: "Mozos", color: "#0d9488", base: "mozo" },
  ],
};

const HEX = /^#[0-9a-f]{6}$/i;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ROLES: Role[] = ["director", "senior", "receptionist", "night_auditor", "mozo"];

const text = (v: unknown, max: number, fallback: string) => {
  const s = typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "";
  return s || fallback;
};
const hex = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v.toLowerCase() : fallback);
const time = (v: unknown, fallback: string) => (v === "" ? "" : typeof v === "string" && TIME.test(v) ? v : fallback);

function setting(raw: unknown, base: ShiftSetting): ShiftSetting {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const letter = typeof r.letter === "string" ? r.letter.replace(/\s+/g, "").slice(0, 3).toUpperCase() : base.letter;
  let start = time(r.start, base.start);
  let end = time(r.end, base.end);
  if (!start || !end) start = end = ""; // both or none
  return { label: text(r.label, 30, base.label), letter, start, end, color: hex(r.color, base.color) };
}

/** Whatever is stored (this device, the server, an old backup) is cleaned the same way as anything typed by hand. */
export function normalizeCatalog(raw: unknown): Catalog {
  const r = (raw && typeof raw === "object" ? raw : {}) as Partial<Record<keyof Catalog, unknown>>;
  const given = (r.shifts && typeof r.shifts === "object" ? r.shifts : {}) as Record<string, unknown>;
  const shifts = Object.fromEntries(BUILTIN_SHIFTS.map((c) => [c, setting(given[c], DEFAULT_CATALOG.shifts[c])])) as Catalog["shifts"];
  shifts.B.letter = ""; // a cell that is not employed stays blank

  const custom: CustomShift[] = [];
  const used = new Set<string>();
  for (const c of Array.isArray(r.custom) ? (r.custom as Record<string, unknown>[]) : []) {
    const code = typeof c?.code === "string" && /^X\d{1,3}$/.test(c.code) ? c.code : "";
    if (!code || used.has(code) || custom.length >= 40) continue;
    used.add(code);
    const s = setting(c, { label: "Turno", letter: "X", start: "", end: "", color: "#a3a3a3" });
    custom.push({ ...s, letter: s.letter || "X", code, counts: c.counts === "off" ? "off" : "work", ...(c.archived ? { archived: true } : {}) });
  }

  const positions: PositionDef[] = [];
  const seen = new Set<string>();
  for (const p of Array.isArray(r.positions) ? (r.positions as Record<string, unknown>[]) : []) {
    const id = typeof p?.id === "string" ? p.id : "";
    const builtin = DEFAULT_CATALOG.positions.find((d) => d.id === id);
    const isCustom = /^p-[a-z0-9]{1,12}$/.test(id);
    if ((!builtin && !isCustom) || seen.has(id) || positions.length >= 20) continue;
    seen.add(id);
    const base = builtin ? builtin.base : ROLES.includes(p.base as Role) ? (p.base as Role) : "receptionist";
    positions.push({ id, label: text(p.label, 30, builtin?.label ?? "Puesto"), color: hex(p.color, builtin?.color ?? "#64748b"), base, ...(builtin ? {} : { custom: true }) });
  }
  // the five built-in puestos always exist (people cannot be left without one)
  for (const d of DEFAULT_CATALOG.positions) if (!seen.has(d.id)) positions.push({ ...d });
  return { shifts, custom, positions };
}

/** A new, unused internal key for a shift. */
export const nextShiftCode = (c: Catalog) => {
  for (let n = 1; ; n++) if (!c.custom.some((x) => x.code === `X${n}`)) return `X${n}`;
};
export const nextPositionId = (c: Catalog) => {
  for (let n = 1; ; n++) if (!c.positions.some((x) => x.id === `p-${n}`)) return `p-${n}`;
};

/** Black or white, whichever reads better on `bg` (WCAG contrast). */
export function textOn(bg: string): "#000000" | "#ffffff" {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(bg.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (L + 0.05)) >= (L + 0.05) / 0.05 ? "#ffffff" : "#000000";
}

/** Inline style for the cell of a shift. "Fuera de plantilla" is black on black, as in the hotel's sheet. */
export const shiftPaint = (code: string): { backgroundColor: string; color: string } => {
  const bg = SHIFTS[code]?.color ?? "#a3a3a3";
  return { backgroundColor: bg, color: code === "B" ? bg : textOn(bg) };
};

/** Gradient for a person's initials circle, from their puesto's colour. */
export const positionGradient = (color: string) => `linear-gradient(135deg, ${color}, color-mix(in srgb, ${color} 62%, black))`;

/** Rewrites the live tables (SHIFTS, DISPLAY_CODE, SECTIONS) the whole app reads from. */
export function applyCatalog(c: Catalog) {
  for (const code of Object.keys(SHIFTS)) if (SHIFTS[code].custom) delete SHIFTS[code]; // removed from the catalog entirely
  for (const code of Object.keys(DISPLAY_CODE)) if (!BUILTIN_SHIFTS.includes(code as BuiltinShift)) delete DISPLAY_CODE[code];
  for (const code of BUILTIN_SHIFTS) {
    const s = c.shifts[code];
    const def: ShiftDef = { code, label: s.label, start: s.start, end: s.end, color: s.color };
    SHIFTS[code] = def;
    DISPLAY_CODE[code] = s.letter;
  }
  for (const x of c.custom) {
    SHIFTS[x.code] = { code: x.code, label: x.label, start: x.start, end: x.end, color: x.color, custom: x.counts, ...(x.archived ? { archived: true } : {}) };
    DISPLAY_CODE[x.code] = x.letter;
  }
  SECTIONS.splice(0, SECTIONS.length, ...c.positions.map((p) => ({ id: p.id, role: p.base, label: p.label, color: p.color, custom: Boolean(p.custom) })));
}

/** Shifts listed in the legends: the nine in use plus the hotel's own that are still offered. */
export const legendCodes = (): string[] => [...BUILTIN_SHIFTS.filter((c) => c !== "B"), ...Object.keys(SHIFTS).filter((c) => SHIFTS[c].custom && !SHIFTS[c].archived)];
