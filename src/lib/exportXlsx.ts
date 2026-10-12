import type { Borders, Fill, Workbook, Worksheet } from "exceljs";
import { TOTALS, stampOf, type MonthReport } from "./domain/report";

const argb = (hex: string) => `FF${hex.replace("#", "").toUpperCase()}`;
const solid = (hex: string): Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb: argb(hex) } });
const thin = { style: "thin" as const, color: { argb: "FFBFBFBF" } };
const box: Partial<Borders> = { top: thin, left: thin, bottom: thin, right: thin };
const WEEKEND = "#F3E9D7";
const HOLIDAY = "#F8D7C4";
const BRAND = "#6F5528";

function sheetCuadrante(wb: Workbook, r: MonthReport, now: Date): Worksheet {
  const ws = wb.addWorksheet("Cuadrante", {
    views: [{ state: "frozen", xSplit: 1, ySplit: 4 }],
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.25, right: 0.25, top: 0.35, bottom: 0.35, header: 0.2, footer: 0.2 } },
    headerFooter: { oddFooter: `&L${r.hotel} · Horario ${r.title}&RGenerado el ${stampOf(now)}` },
  });
  const nDays = r.days.length;
  const firstTotal = 2 + nDays;
  ws.columns = [{ width: 22 }, ...r.days.map(() => ({ width: 4.2 })), ...TOTALS.map((t) => ({ width: t.label.length > 2 ? 7.5 : 4.5 }))];

  // 1: title, 2: hotel + date
  ws.mergeCells(1, 1, 1, firstTotal + TOTALS.length - 1);
  ws.getCell(1, 1).value = `Horario ${r.title}`;
  ws.getCell(1, 1).font = { bold: true, size: 16, color: { argb: argb(BRAND) } };
  ws.getCell(2, 1).value = `${r.hotel} · generado el ${stampOf(now)}`;
  ws.getCell(2, 1).font = { italic: true, size: 9, color: { argb: "FF6B6B6B" } };

  // 3: weekday letters, 4: day numbers (+ totals headers)
  const wdRow = ws.getRow(3);
  const dayRow = ws.getRow(4);
  wdRow.getCell(1).value = "";
  dayRow.getCell(1).value = "Persona";
  r.days.forEach((d, i) => {
    const col = 2 + i;
    wdRow.getCell(col).value = d.weekday;
    dayRow.getCell(col).value = d.day;
    for (const row of [wdRow, dayRow]) {
      const c = row.getCell(col);
      c.alignment = { horizontal: "center", vertical: "middle" };
      c.font = { bold: row === dayRow, size: row === dayRow ? 10 : 8, color: { argb: d.holiday ? "FFA8480F" : "FF333333" } };
      if (d.weekend || d.holiday) c.fill = solid(d.holiday ? HOLIDAY : WEEKEND);
      c.border = box;
    }
  });
  TOTALS.forEach((t, i) => {
    const c = dayRow.getCell(firstTotal + i);
    c.value = t.label;
    c.font = { bold: true, size: 9 };
    c.alignment = { horizontal: "center" };
    c.fill = solid("#EFE7DA");
    c.border = box;
  });
  dayRow.getCell(1).font = { bold: true };
  dayRow.getCell(1).border = box;

  let at = 5;
  for (const g of r.groups) {
    // section band
    ws.mergeCells(at, 1, at, firstTotal + TOTALS.length - 1);
    const head = ws.getCell(at, 1);
    head.value = `${g.section.label.toUpperCase()}  (${g.rows.length})`;
    head.font = { bold: true, size: 9, color: { argb: "FFFFFFFF" } };
    head.fill = solid(g.section.color);
    at++;
    for (const row of g.rows) {
      const xr = ws.getRow(at);
      xr.height = 18;
      const name = xr.getCell(1);
      name.value = row.staff.name;
      name.font = { bold: true, size: 10 };
      name.border = box;
      row.cells.forEach((c, i) => {
        const x = xr.getCell(2 + i);
        x.value = c.letter;
        x.fill = solid(c.fill);
        x.font = { bold: true, size: 10, color: { argb: argb(c.ink) } };
        x.alignment = { horizontal: "center", vertical: "middle" };
        x.border = box;
      });
      TOTALS.forEach((t, i) => {
        const x = xr.getCell(firstTotal + i);
        x.value = t.value(row.summary);
        x.alignment = { horizontal: "center" };
        x.border = box;
        x.font = { size: 10, bold: t.key === "h" };
      });
      at++;
    }
  }

  // coverage: one row per shift that must be covered
  at++;
  for (const k of ["M", "T", "N"] as const) {
    const xr = ws.getRow(at);
    xr.getCell(1).value = `Cobertura ${k === "M" ? "mañana" : k === "T" ? "tarde" : "noche"}`;
    xr.getCell(1).font = { italic: true, size: 9 };
    r.days.forEach((d, i) => {
      const x = xr.getCell(2 + i);
      const n = d.cover[k];
      x.value = n;
      x.alignment = { horizontal: "center" };
      x.font = { size: 9, bold: n !== 1, color: { argb: n === 1 ? "FF2E7D32" : "FFC62828" } };
      x.border = box;
    });
    at++;
  }
  ws.pageSetup.printArea = `A1:${ws.getColumn(firstTotal + TOTALS.length - 1).letter}${at}`;
  return ws;
}

function sheetResumen(wb: Workbook, r: MonthReport) {
  const ws = wb.addWorksheet("Resumen", { views: [{ state: "frozen", ySplit: 1 }], pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const cols: [string, number][] = [["Persona", 22], ["Puesto", 18], ["Días trabajados", 10], ["Mañanas", 9], ["Tardes", 9], ["Noches", 9], ["Otros turnos", 10], ["Horas", 9], ["Libres", 9], ["Vacaciones", 10], ["Ausencias", 10], ["Fines de semana", 10], ["Festivos", 9]];
  ws.columns = cols.map(([header, width]) => ({ header, width }));
  const h = ws.getRow(1);
  h.font = { bold: true, color: { argb: "FFFFFFFF" } };
  h.alignment = { wrapText: true, vertical: "middle", horizontal: "center" };
  h.height = 30;
  h.eachCell((c) => {
    c.fill = solid(BRAND);
    c.border = box;
  });
  for (const g of r.groups)
    for (const { staff, summary: s } of g.rows) {
      const row = ws.addRow([staff.name, g.section.label, s.worked, s.M, s.T, s.N, s.other, Math.round(s.hours * 10) / 10, s.libres, s.vacaciones, s.ausencias, s.weekends, s.holidays]);
      row.eachCell((c, i) => {
        c.border = box;
        if (i > 2) c.alignment = { horizontal: "center" };
      });
    }
}

function sheetLeyenda(wb: Workbook, r: MonthReport) {
  const ws = wb.addWorksheet("Leyenda");
  ws.columns = [{ header: "Letra", width: 8 }, { header: "Turno", width: 26 }, { header: "Horario", width: 14 }];
  ws.getRow(1).font = { bold: true };
  for (const l of r.legend) {
    const row = ws.addRow([l.letter, l.label, l.hours]);
    const c = row.getCell(1);
    c.fill = solid(l.fill);
    c.font = { bold: true, color: { argb: argb(l.ink) } };
    c.alignment = { horizontal: "center" };
  }
}

/** A real Excel file that looks like the hotel's sheet: colours, sections, totals, a summary and a legend. */
export async function monthWorkbook(r: MonthReport, now = new Date()): Promise<ArrayBuffer> {
  const { Workbook } = await import("exceljs");
  const wb = new Workbook();
  wb.creator = "Horarios · Casa 1800";
  wb.created = now;
  sheetCuadrante(wb, r, now);
  sheetResumen(wb, r);
  sheetLeyenda(wb, r);
  return (await wb.xlsx.writeBuffer()) as ArrayBuffer;
}
