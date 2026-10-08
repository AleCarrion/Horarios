import type { Staff } from "./types";

export const DEFAULT_STAFF: Staff[] = [
  { id: "jc", name: "José Carlos", role: "night_auditor" },
  { id: "marta", name: "Marta", role: "director" },
  { id: "ana", name: "Ana", role: "senior", extraShifts: ["M"], maxCovers: 3 },
  { id: "julio", name: "Julio", role: "senior", extraShifts: ["M", "T"], maxCovers: 12 },
  { id: "alberto-r", name: "Alberto R.", role: "receptionist" },
  { id: "alejandro", name: "Alejandro", role: "receptionist" },
  { id: "marcos", name: "Marcos", role: "receptionist" },
  { id: "alberto-m", name: "Alberto M.", role: "mozo", cycleAnchor: "2026-01-01" },
  { id: "arturo", name: "Arturo", role: "mozo", cycleAnchor: "2026-01-06" },
];

/** Temporary 4th receptionist hired to cover holidays; added to the month on demand. */
export const EXTRA_RECEPTIONIST: Staff = { id: "angela", name: "Ángela", role: "receptionist" };
