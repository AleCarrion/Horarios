import { daysInMonth, toISO } from "./domain/dates";
import { allowedShifts } from "./domain/rules";
import { DISPLAY_CODE, SHIFTS, type ShiftCode, type Staff } from "./domain/types";

/** One spreadsheet cell as the importer sees it: its text and, if painted, its colour (#rrggbb). */
export interface GridCell {
  text: string;
  fill?: string;
  /** A real date typed in the cell (Excel date). */
  date?: Date;
}
export type Grid = GridCell[][];

export interface ImportedCell {
  date: string;
  /** null = could not tell what it is (shown to be fixed by hand). */
  code: ShiftCode | null;
  /** What was in the file, to show next to the guess. */
  raw: string;
}
export interface ImportedRow {
  /** The name as written in the file. */
  name: string;
  staffId: string | null;
  cells: ImportedCell[];
}
export interface ImportResult {
  rows: ImportedRow[];
  /** Month found in the file (from real dates in the header), if any. */
  month?: { year: number; month: number };
  /** Number of days found in the header (it should match the month). */
  days: number;
  problems: string[];
}

const strip = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** "Alberto R." ~ "ALBERTO RODRIGUEZ" ~ "alberto r": same first word and, when the file gives more, compatible initials. */
export function matchStaff(name: string, staff: Staff[]): string | null {
  const n = strip(name);
  if (!n) return null;
  const exact = staff.find((s) => strip(s.name) === n);
  if (exact) return exact.id;
  const words = n.split(" ");
  const fits = staff.filter((s) => {
    const sw = strip(s.name).split(" ");
    if (sw[0] !== words[0]) return false;
    // every further word must agree on the first letter ("R." with "Rodríguez")
    return sw.slice(1).every((w, i) => !words[i + 1] || words[i + 1][0] === w[0]);
  });
  if (fits.length === 1) return fits[0].id;
  // a nickname or a single unique first name
  const first = staff.filter((s) => strip(s.name).split(" ")[0] === words[0]);
  return first.length === 1 ? first[0].id : null;
}

const SYNONYMS: Record<string, ShiftCode> = {
  l: "D", d: "D", lib: "D", libre: "D", desc: "D", descanso: "D", f: "D", fiesta: "D", r: "D",
  v: "V", vac: "V", vacaciones: "V",
  a: "A", baja: "A", it: "A", ausencia: "A",
  m: "M", manana: "M", t: "T", tarde: "T", n: "N", noche: "N",
  s: "S", p: "P", partido: "P", mz: "MZ", mozo: "MZ",
};

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const distance = (a: string, b: string) => {
  const [r1, g1, b1] = rgb(a);
  const [r2, g2, b2] = rgb(b);
  return Math.sqrt((r1 - r2) ** 2 + (g1 - g2) ** 2 + (b1 - b2) ** 2);
};
const WHITE = /^#(f{6}|fefefe|fdfdfd)$/i;

/** Picks, among several possible shifts, the one this person can do (P = partido for apoyo, mozo shift for mozos). */
const forPerson = (codes: ShiftCode[], person: Staff | undefined): ShiftCode | null => {
  if (!codes.length) return null;
  if (!person) return codes[0];
  const ok = allowedShifts(person);
  return codes.find((c) => ok.includes(c)) ?? null;
};

const minutes = (h: string, m = "0") => Number(h) * 60 + Number(m);

/** What a cell means for this person: by its text (letter, word or hours) or, if empty, by its colour. */
export function decodeCell(cell: GridCell | undefined, person?: Staff): { code: ShiftCode | null; raw: string } {
  const text = (cell?.text ?? "").trim();
  const raw = text || (cell?.fill && !WHITE.test(cell.fill) ? "(color)" : "");
  if (text) {
    const up = text.toUpperCase().replace(/\s+/g, "");
    // the hotel's own letters first (they may have changed them in Turnos)
    const byLetter = Object.keys(SHIFTS).filter((c) => (DISPLAY_CODE[c] ?? c).toUpperCase() === up && c !== "B");
    const letter = forPerson(byLetter, person);
    if (letter) return { code: letter, raw };
    const word = strip(text);
    const byLabel = Object.keys(SHIFTS).filter((c) => strip(SHIFTS[c].label) === word);
    const label = forPerson(byLabel, person);
    if (label) return { code: label, raw };
    const syn = SYNONYMS[word] ?? SYNONYMS[word.split(" ")[0]];
    if (syn) {
      const p = forPerson(syn === "P" ? ["P", "MZ"] : [syn], person);
      if (p) return { code: p, raw };
    }
    // hours: "7-15", "07:00 - 15:00", "23-7"
    const h = text.match(/^(\d{1,2})(?::(\d{2}))?\s*[-–a]\s*(\d{1,2})(?::(\d{2}))?$/i);
    if (h) {
      const start = minutes(h[1], h[2]);
      const end = minutes(h[3], h[4]);
      const same = Object.keys(SHIFTS).filter((c) => SHIFTS[c].start && minutes(...(SHIFTS[c].start.split(":") as [string, string])) === start && minutes(...(SHIFTS[c].end.split(":") as [string, string])) === end % 1440);
      const byHours = forPerson(same, person);
      if (byHours) return { code: byHours, raw };
    }
    return { code: null, raw };
  }
  // no text: the colour says it (the hotel's sheet is painted, like the app)
  if (cell?.fill && !WHITE.test(cell.fill)) {
    const ranked = Object.keys(SHIFTS)
      .filter((c) => SHIFTS[c].color)
      .map((c) => ({ c, d: distance(cell.fill!, SHIFTS[c].color!) }))
      .filter((x) => x.d < 32) // close to one of the hotel's colours; anything else (a grey, a pale tone) is asked
      .sort((a, b) => a.d - b.d)
      .map((x) => x.c);
    return { code: forPerson(ranked, person), raw };
  }
  return { code: null, raw: "" };
}

const dayNumber = (c: GridCell | undefined): number | null => {
  if (!c) return null;
  if (c.date) return c.date.getUTCDate();
  const t = c.text.trim();
  const m = t.match(/^(\d{1,2})(?:\s*[a-z]{0,3}\.?)?$/i) ?? t.match(/^[a-záéíóú]{1,3}\.?\s*(\d{1,2})$/i);
  return m ? Number(m[1]) : null;
};

/** The header: the row with the longest run of 1, 2, 3… in neighbouring columns (at least 28). */
function findHeader(grid: Grid): { row: number; col: number; days: number } | null {
  let best: { row: number; col: number; days: number } | null = null;
  grid.slice(0, 25).forEach((cells, r) => {
    for (let c = 0; c < cells.length; c++) {
      if (dayNumber(cells[c]) !== 1) continue;
      let n = 1;
      while (dayNumber(cells[c + n]) === n + 1) n++;
      if (n >= 28 && (!best || n > best.days)) best = { row: r, col: c, days: n };
    }
  });
  return best;
}

/**
 * Reads a painted or lettered schedule (people in rows, days in columns) for `year`/`month`.
 * Nothing is applied: the result is shown first, with whatever could not be read marked.
 */
export function readScheduleGrid(grid: Grid, staff: Staff[], year: number, month: number): ImportResult {
  const problems: string[] = [];
  const header = findHeader(grid);
  if (!header) return { rows: [], days: 0, problems: ["No encuentro la fila de los días (1, 2, 3… hasta fin de mes)."] };
  const want = daysInMonth(year, month);
  const days = Math.min(header.days, want);
  if (header.days !== want) problems.push(`El archivo tiene ${header.days} días y ${["", "enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"][month]} tiene ${want}.`);
  const firstDate = grid[header.row][header.col].date;
  const found = firstDate ? { year: firstDate.getUTCFullYear(), month: firstDate.getUTCMonth() + 1 } : undefined;

  // the names: the column left of the days where most cells are people of the team
  let nameCol = -1;
  let bestHits = 0;
  for (let c = 0; c < header.col; c++) {
    const hits = grid.slice(header.row + 1).filter((r) => r[c]?.text && matchStaff(r[c].text, staff)).length;
    if (hits > bestHits) {
      bestHits = hits;
      nameCol = c;
    }
  }
  if (nameCol < 0) {
    // nobody recognised: take the nearest column with text
    for (let c = header.col - 1; c >= 0 && nameCol < 0; c--) if (grid.slice(header.row + 1).some((r) => r[c]?.text.trim())) nameCol = c;
  }
  if (nameCol < 0) return { rows: [], days, month: found, problems: [...problems, "No encuentro la columna con los nombres."] };

  const rows: ImportedRow[] = [];
  const seen = new Set<string>();
  for (const r of grid.slice(header.row + 1)) {
    const name = (r[nameCol]?.text ?? "").trim();
    if (!name || /^cobertura|^total|^leyenda/i.test(name)) continue;
    const cellsInRow = r.slice(header.col, header.col + days);
    if (!cellsInRow.some((c) => c?.text.trim() || (c?.fill && !WHITE.test(c.fill)))) continue; // a title or an empty line
    if (cellsInRow.every((c) => c?.text === r[nameCol]?.text)) continue; // a band merged across the row (a section title)
    let staffId = matchStaff(name, staff);
    if (staffId && seen.has(staffId)) staffId = null;
    if (staffId) seen.add(staffId);
    const person = staff.find((s) => s.id === staffId);
    rows.push({
      name,
      staffId,
      cells: Array.from({ length: days }, (_, i) => ({ date: toISO(year, month, i + 1), ...decodeCell(r[header.col + i], person) })),
    });
  }
  if (!rows.length) problems.push("No hay filas de personas debajo de los días.");
  const missing = staff.filter((s) => !seen.has(s.id));
  if (missing.length && rows.length) problems.push(`No aparecen en el archivo: ${missing.map((s) => s.name).join(", ")}.`);
  return { rows, days, month: found, problems };
}

/** A CSV (comma, semicolon or tab) as a grid, so it goes through the same reader. */
export function csvToGrid(text: string): Grid {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const sep = [";", "\t", ","].sort((a, b) => (lines[0]?.split(b).length ?? 0) - (lines[0]?.split(a).length ?? 0))[0];
  return lines.map((l) => l.split(sep).map((t) => ({ text: t.replace(/^"|"$/g, "").replace(/""/g, '"') })));
}
