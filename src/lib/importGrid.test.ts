import { describe, expect, it } from "vitest";
import { generateSchedule } from "./domain/generator";
import { buildMonthReport } from "./domain/report";
import { DEFAULT_STAFF } from "./domain/roster";
import { monthDates } from "./domain/dates";
import { OCTOBER_2026_REAL } from "./domain/fixtures/october-2026";
import { SHIFTS } from "./domain/types";
import { monthWorkbook } from "./exportXlsx";
import { colorOf, readWorkbookGrids } from "./readXlsx";
import { csvToGrid, decodeCell, matchStaff, readScheduleGrid, type Grid } from "./importGrid";

const staff = DEFAULT_STAFF;
const by = (id: string) => staff.find((s) => s.id === id)!;

describe("nombres del archivo", () => {
  it("reconoce a cada persona aunque el nombre esté escrito de otra forma", () => {
    expect(matchStaff("Marta", staff)).toBe("marta");
    expect(matchStaff("  MARTA ", staff)).toBe("marta");
    expect(matchStaff("Alberto R.", staff)).toBe("alberto-r");
    expect(matchStaff("Alberto Rodríguez", staff)).toBe("alberto-r");
    expect(matchStaff("ALBERTO M", staff)).toBe("alberto-m");
    expect(matchStaff("Jose Carlos", staff)).toBe("jc");
    expect(matchStaff("José", staff)).toBe("jc");
    expect(matchStaff("Alberto", staff)).toBeNull(); // two Albertos: ask
    expect(matchStaff("Pepa", staff)).toBeNull();
  });
});

describe("lo que significa cada casilla", () => {
  it("por letra, palabra u horas, eligiendo lo que esa persona puede hacer", () => {
    expect(decodeCell({ text: "M" }, by("alejandro")).code).toBe("M");
    expect(decodeCell({ text: "l" }, by("alejandro")).code).toBe("D");
    expect(decodeCell({ text: "Libre" }).code).toBe("D");
    expect(decodeCell({ text: "vac" }).code).toBe("V");
    expect(decodeCell({ text: "P" }, by("ana")).code).toBe("P"); // partido
    expect(decodeCell({ text: "P" }, by("arturo")).code).toBe("MZ"); // the mozo's shift is also written P
    expect(decodeCell({ text: "7-15" }, by("marcos")).code).toBe("M");
    expect(decodeCell({ text: "23:00-07:00" }, by("jc")).code).toBe("N");
    expect(decodeCell({ text: "??" }).code).toBeNull();
  });

  it("sin letra, por el color de la casilla (como el Excel del hotel)", () => {
    expect(decodeCell({ text: "", fill: "#ffff00" }, by("marcos")).code).toBe("M");
    expect(decodeCell({ text: "", fill: "#93d151" }, by("marcos")).code).toBe("D"); // almost the libre green
    expect(decodeCell({ text: "", fill: "#00b0f0" }, by("arturo")).code).toBe("MZ");
    expect(decodeCell({ text: "", fill: "#ffffff" }).code).toBeNull();
    expect(decodeCell({ text: "" }).code).toBeNull();
  });

  it("entiende los colores de tema de Excel (azul claro = tema 8 aclarado)", () => {
    expect(colorOf({ theme: 8, tint: 0.6 })).toBe(SHIFTS.T.color);
    expect(colorOf({ theme: 4 })).toBe(SHIFTS.S.color);
    expect(colorOf({ argb: "FFFFC000" })).toBe("#ffc000");
  });
});

describe("leer un cuadrante entero", () => {
  const dates = monthDates(2026, 10);

  it("el Excel del hotel, solo con colores: sale igual que el octubre real", () => {
    const POS: Record<string, [string, string]> = {
      director: ["marta", "Marta"], senior_a: ["ana", "Ana"], senior_b: ["julio", "Julio"], recep_1: ["alberto-r", "Alberto R."],
      recep_2: ["marcos", "Marcos"], recep_3: ["alejandro", "Alejandro"], night_auditor: ["jc", "José Carlos"], mozo_1: ["alberto-m", "Alberto M."], mozo_2: ["arturo", "Arturo"],
    };
    const code = (c: string) => (c === "." ? "D" : c === "z" ? "MZ" : c);
    const grid: Grid = [
      [{ text: "HORARIO OCTUBRE" }],
      [{ text: "" }, ...dates.map((_, i) => ({ text: String(i + 1) }))],
      ...Object.entries(OCTOBER_2026_REAL).map(([pos, row]) => [{ text: POS[pos][1] }, ...[...row].map((c) => ({ text: "", fill: SHIFTS[code(c)].color }))]),
    ];
    const r = readScheduleGrid(grid, staff, 2026, 10);
    expect(r.problems).toEqual([]);
    expect(r.rows).toHaveLength(9);
    for (const row of r.rows) {
      const pos = Object.keys(POS).find((p) => POS[p][0] === row.staffId)!;
      expect(row.cells.map((c) => c.code)).toEqual([...OCTOBER_2026_REAL[pos]].map(code));
    }
  });

  it("nuestro propio Excel exportado se vuelve a leer igual (ida y vuelta)", async () => {
    const s = generateSchedule({ year: 2026, month: 11, staff }).schedule;
    const buf = await monthWorkbook(buildMonthReport(s, staff, 2026, 11));
    const sheets = await readWorkbookGrids(buf);
    expect(sheets.map((x) => x.name)).toContain("Cuadrante");
    const r = readScheduleGrid(sheets[0].grid, staff, 2026, 11);
    expect(r.problems).toEqual([]);
    expect(r.rows.map((x) => x.staffId).sort()).toEqual(staff.map((p) => p.id).sort());
    for (const row of r.rows) for (const c of row.cells) expect(c.code, `${row.name} ${c.date}`).toBe(s[row.staffId!][c.date]);
  });

  it("un CSV con letras y nombres en mayúsculas", () => {
    const csv = ["Nombre;" + Array.from({ length: 30 }, (_, i) => i + 1).join(";"), "ALEJANDRO;" + Array(30).fill("M").join(";"), "Pepa;" + Array(30).fill("L").join(";")].join("\n");
    const r = readScheduleGrid(csvToGrid(csv), staff, 2026, 11);
    expect(r.rows.map((x) => x.staffId)).toEqual(["alejandro", null]);
    expect(r.rows[0].cells.every((c) => c.code === "M")).toBe(true);
    expect(r.problems.join(" ")).toMatch(/No aparecen en el archivo: Marta/);
  });

  it("avisa si el archivo no tiene los días del mes", () => {
    const grid: Grid = [[{ text: "Marta" }, { text: "1" }, { text: "2" }]];
    expect(readScheduleGrid(grid, staff, 2026, 11).problems[0]).toMatch(/fila de los días/);
    const feb = [[{ text: "" }, ...Array.from({ length: 28 }, (_, i) => ({ text: String(i + 1) }))], [{ text: "Marta" }, ...Array(28).fill({ text: "S" })]];
    expect(readScheduleGrid(feb, staff, 2026, 11).problems[0]).toMatch(/28 días/);
  });
});

describe("colores dudosos", () => {
  it("un gris o un tono que no es de ningún turno se pregunta, no se adivina", () => {
    expect(decodeCell({ text: "", fill: "#e0e0e0" }).code).toBeNull();
    expect(decodeCell({ text: "", fill: "#ff99cc" }).code).toBeNull();
  });
});
