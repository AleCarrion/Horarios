import type { Staff } from "./types";

/** Default team in the order of the hotel's sheet (dirección, apoyo, recepción, noche, mozos). */
export const DEFAULT_STAFF: Staff[] = [
  { id: "marta", name: "Marta", role: "director" },
  { id: "ana", name: "Ana", role: "senior", extraShifts: ["M"], maxCovers: 3 },
  { id: "julio", name: "Julio", role: "senior", extraShifts: ["M", "T"], maxCovers: 12 },
  { id: "alberto-r", name: "Alberto R.", role: "receptionist" },
  { id: "alejandro", name: "Alejandro", role: "receptionist" },
  { id: "marcos", name: "Marcos", role: "receptionist" },
  { id: "jc", name: "José Carlos", role: "night_auditor" },
  { id: "alberto-m", name: "Alberto M.", role: "mozo", cycleAnchor: "2026-01-01" },
  { id: "arturo", name: "Arturo", role: "mozo", cycleAnchor: "2026-01-06" },
];
