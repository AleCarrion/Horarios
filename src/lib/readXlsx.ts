import type { Cell, Worksheet } from "exceljs";
import type { Grid } from "./importGrid";

/** Excel's default (Office) theme: the colours "theme 0…9" stand for, so painted cells using theme colours can be read too. */
const THEME = ["#ffffff", "#000000", "#e7e6e6", "#44546a", "#4472c4", "#ed7d31", "#a5a5a5", "#ffc000", "#5b9bd5", "#70ad47"];
/** Excel's old indexed palette (only the colours a schedule might use). */
const INDEXED: Record<number, string> = { 8: "#000000", 9: "#ffffff", 10: "#ff0000", 13: "#ffff00", 17: "#008000", 40: "#00ccff", 44: "#99ccff", 47: "#ffcc99", 50: "#99cc00", 51: "#ffcc00", 52: "#ff9900" };

const hex = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0");

/** Lighter/darker version of a colour as Excel does it with "tint" (-1…1). */
function tinted(color: string, tint: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  const f = (v: number) => (tint < 0 ? v * (1 + tint) : v + (255 - v) * tint);
  return `#${hex(f(r))}${hex(f(g))}${hex(f(b))}`;
}

type ExcelColor = { argb?: string; theme?: number; tint?: number; indexed?: number };
export function colorOf(c: ExcelColor | undefined): string | undefined {
  if (!c) return undefined;
  if (c.argb && /^[0-9a-f]{8}$/i.test(c.argb)) return `#${c.argb.slice(2).toLowerCase()}`;
  if (typeof c.theme === "number" && THEME[c.theme]) return c.tint ? tinted(THEME[c.theme], c.tint) : THEME[c.theme];
  if (typeof c.indexed === "number") return INDEXED[c.indexed];
  return undefined;
}

function fillOf(cell: Cell): string | undefined {
  const f = cell.fill as { type?: string; pattern?: string; fgColor?: ExcelColor; bgColor?: ExcelColor } | undefined;
  if (!f || f.type !== "pattern" || !f.pattern || f.pattern === "none") return undefined;
  return colorOf(f.fgColor) ?? colorOf(f.bgColor);
}

function toGrid(ws: Worksheet): Grid {
  const grid: Grid = [];
  const rows = Math.min(ws.rowCount, 200);
  const cols = Math.min(ws.columnCount, 80);
  for (let r = 1; r <= rows; r++) {
    const row = ws.getRow(r);
    const out: Grid[number] = [];
    for (let c = 1; c <= cols; c++) {
      const cell = row.getCell(c);
      const master = cell.isMerged ? cell.master : cell;
      const v = master.value;
      let text = "";
      try {
        text = master.text ?? "";
      } catch {
        text = v == null ? "" : String(v);
      }
      out.push({ text: v instanceof Date ? "" : text, fill: fillOf(master) ?? fillOf(cell), date: v instanceof Date ? v : undefined });
    }
    grid.push(out);
  }
  return grid;
}

/** Every sheet of an .xlsx as a grid of text + colour (the library loads only when a file is opened). */
export async function readWorkbookGrids(buffer: ArrayBuffer): Promise<{ name: string; grid: Grid }[]> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  await wb.xlsx.load(buffer);
  return wb.worksheets.filter((ws) => ws.state !== "hidden" && ws.state !== "veryHidden").map((ws) => ({ name: ws.name, grid: toGrid(ws) }));
}
