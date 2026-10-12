import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { applyCatalog, DEFAULT_CATALOG, normalizeCatalog } from "./domain/catalog";
import { generateSchedule } from "./domain/generator";
import { buildMonthReport } from "./domain/report";
import { DEFAULT_STAFF } from "./domain/roster";
import { monthPdf, peoplePdf } from "./exportPdf";
import { monthWorkbook } from "./exportXlsx";

const oct = generateSchedule({ year: 2026, month: 10, staff: DEFAULT_STAFF }).schedule;
const now = new Date(2026, 9, 12, 9, 41);
const OUT = process.env.EXPORT_OUT; // set to look at the files by hand

describe("informe del mes", () => {
  it("agrupa por puesto, trae totales, cobertura y la leyenda de lo que aparece", () => {
    const r = buildMonthReport(oct, DEFAULT_STAFF, 2026, 10);
    expect(r.title).toBe("Octubre 2026");
    expect(r.days).toHaveLength(31);
    expect(r.days[0]).toMatchObject({ day: 1, weekday: "J" });
    expect(r.days.find((d) => d.day === 12)).toMatchObject({ holiday: true }); // Fiesta Nacional
    expect(r.groups.map((g) => g.section.id)).toEqual(["director", "senior", "receptionist", "night_auditor", "mozo"]);
    expect(r.groups.flatMap((g) => g.rows).map((x) => x.cells.length)).toEqual(Array(9).fill(31));
    expect(r.days.every((d) => d.cover.ok)).toBe(true);
    expect(r.legend.map((l) => l.code)).toEqual(expect.arrayContaining(["M", "T", "N", "D"]));
    expect(r.legend.find((l) => l.code === "D")).toMatchObject({ letter: "L", label: "Libre" });
  });

  it("usa los nombres, letras y colores del hotel", () => {
    applyCatalog(normalizeCatalog({ shifts: { M: { label: "Madrugada", letter: "MA", color: "#112233" } } }));
    try {
      const r = buildMonthReport(oct, DEFAULT_STAFF, 2026, 10);
      const m = r.legend.find((l) => l.code === "M")!;
      expect(m).toMatchObject({ label: "Madrugada", letter: "MA", fill: "#112233", ink: "#ffffff" });
    } finally {
      applyCatalog(DEFAULT_CATALOG);
    }
  });
});

describe("Excel y PDF", () => {
  const r = buildMonthReport(oct, DEFAULT_STAFF, 2026, 10);

  it("el Excel es un .xlsx de verdad con tres hojas, colores y totales", async () => {
    const buf = await monthWorkbook(r, now);
    if (OUT) writeFileSync(`${OUT}/mes.xlsx`, Buffer.from(buf));
    const { Workbook } = await import("exceljs");
    const wb = new Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Cuadrante", "Resumen", "Leyenda"]);
    const ws = wb.getWorksheet("Cuadrante")!;
    expect(ws.getCell(1, 1).value).toBe("Horario Octubre 2026");
    expect(ws.getCell(4, 2).value).toBe(1);
    // row 6 = Marta (row 5 is the Dirección band); 1 Oct is a Thursday: supervisión
    expect(ws.getCell(6, 1).value).toBe("Marta");
    expect(ws.getCell(6, 2).value).toBe("S");
    expect((ws.getCell(6, 2).fill as { fgColor: { argb: string } }).fgColor.argb).toBe("FF4472C4");
    expect(ws.getCell(4, 33).value).toBe("M");
    expect(typeof ws.getCell(6, 36).value).toBe("number"); // horas
    expect(wb.getWorksheet("Resumen")!.rowCount).toBe(10);
  });

  it("el PDF del mes es una sola hoja", async () => {
    const blob = await monthPdf(r, now);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (OUT) writeFileSync(`${OUT}/mes.pdf`, bytes);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text.startsWith("%PDF")).toBe(true);
    expect(text.match(/\/Type \/Page\b/g)).toHaveLength(1);
  });

  it("el PDF por persona trae una hoja por cada uno", async () => {
    const blob = await peoplePdf(r, DEFAULT_STAFF.map((s) => s.id), now);
    const bytes = new Uint8Array(await blob.arrayBuffer());
    if (OUT) writeFileSync(`${OUT}/personas.pdf`, bytes);
    expect(new TextDecoder("latin1").decode(bytes).match(/\/Type \/Page\b/g)).toHaveLength(9);
    const one = await peoplePdf(r, ["ana"], now);
    expect(new TextDecoder("latin1").decode(new Uint8Array(await one.arrayBuffer())).match(/\/Type \/Page\b/g)).toHaveLength(1);
  });
});
