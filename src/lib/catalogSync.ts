import { normalizeCatalog, type Catalog } from "./domain/catalog";

/** `public.app_catalog`: one row with the hotel's names, colours and puestos as JSON. */
export interface CatalogRow {
  id: 1;
  catalog: unknown;
}
/** `public.shifts` row: the schedule table references it, so every shift the hotel creates needs one. */
export interface ShiftRow {
  code: string;
  label: string;
  start_time: string | null;
  end_time: string | null;
  color: string;
}

export const toCatalogRow = (c: Catalog): CatalogRow => ({ id: 1, catalog: normalizeCatalog(c) });
export const fromCatalogRow = (row: Pick<CatalogRow, "catalog">): Catalog => normalizeCatalog(row.catalog);

/** Built-in shifts keep their row (only name/colour/hours are refreshed); the hotel's own get theirs. */
export function toShiftRows(c: Catalog): ShiftRow[] {
  const all = [...Object.entries(c.shifts).map(([code, s]) => ({ code, ...s })), ...c.custom];
  return all.map((s) => ({ code: s.code, label: s.label, start_time: s.start || null, end_time: s.end || null, color: s.color }));
}
