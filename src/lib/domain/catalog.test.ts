import { afterEach, describe, expect, it } from "vitest";
import { applyCatalog, DEFAULT_CATALOG, legendCodes, nextShiftCode, normalizeCatalog, shiftPaint, textOn, type Catalog } from "./catalog";
import { generateSchedule } from "./generator";
import { DEFAULT_STAFF } from "./roster";
import { allowedShifts } from "./rules";
import { planDayOff, planFix } from "./repair";
import { summarizeMonth } from "./summary";
import { addStaff, moveStaff, SECTIONS, sectionIdOf, sortBySections } from "./team";
import { displayCode, isOff, SHIFTS } from "./types";
import { validateSchedule } from "./validate";

afterEach(() => applyCatalog(DEFAULT_CATALOG));

const withCustom = (): Catalog => normalizeCatalog({
  ...DEFAULT_CATALOG,
  custom: [
    { code: "X1", label: "Desayunos", letter: "dz", start: "10:00", end: "14:00", color: "#ff8800", counts: "work" },
    { code: "X2", label: "Curso", letter: "C", start: "", end: "", color: "#222222", counts: "off" },
  ],
  positions: [...DEFAULT_CATALOG.positions, { id: "p-1", label: "Conserjes", color: "#be185d", base: "receptionist", custom: true }],
});

describe("catálogo: limpieza de lo guardado", () => {
  it("lo vacío o roto vuelve a los valores de siempre", () => {
    expect(normalizeCatalog(null)).toEqual(DEFAULT_CATALOG);
    expect(normalizeCatalog("basura")).toEqual(DEFAULT_CATALOG);
    expect(normalizeCatalog({ shifts: { M: { color: "rojo", start: "7", label: "   " } } }).shifts.M).toEqual(DEFAULT_CATALOG.shifts.M);
  });

  it("acepta nombres, letras, horas y colores del hotel", () => {
    const c = normalizeCatalog({ shifts: { M: { label: "Madrugada", letter: "ma", start: "06:00", end: "14:00", color: "#AABBCC" } } });
    expect(c.shifts.M).toEqual({ label: "Madrugada", letter: "MA", start: "06:00", end: "14:00", color: "#aabbcc" });
  });

  it("las horas van las dos o ninguna", () => {
    expect(normalizeCatalog({ shifts: { M: { start: "06:00", end: "" } } }).shifts.M).toMatchObject({ start: "", end: "" });
  });

  it("fuera de plantilla siempre en blanco; los turnos propios con código válido y sin repetir", () => {
    const c = normalizeCatalog({ shifts: { B: { letter: "Z" } }, custom: [{ code: "X1", label: "A" }, { code: "X1", label: "B" }, { code: "M", label: "No" }, { code: "X2", counts: "off", archived: true }] });
    expect(c.shifts.B.letter).toBe("");
    expect(c.custom.map((x) => x.code)).toEqual(["X1", "X2"]);
    expect(c.custom[1]).toMatchObject({ counts: "off", archived: true });
  });

  it("los cinco puestos de siempre existen aunque se hayan borrado; los propios solo con id válido", () => {
    const c = normalizeCatalog({ positions: [{ id: "p-7", label: "Botones", base: "mozo" }, { id: "xx", label: "Mal" }, { id: "mozo", label: "Mozos y botones", color: "#123456" }] });
    expect(c.positions.map((p) => p.id).sort()).toEqual(["director", "mozo", "night_auditor", "p-7", "receptionist", "senior"]);
    expect(c.positions.find((p) => p.id === "p-7")).toMatchObject({ base: "mozo", custom: true });
    expect(c.positions.find((p) => p.id === "mozo")).toMatchObject({ label: "Mozos y botones", color: "#123456", base: "mozo" });
  });

  it("siguiente código libre", () => {
    expect(nextShiftCode(withCustom())).toBe("X3");
    expect(nextShiftCode(DEFAULT_CATALOG)).toBe("X1");
  });
});

describe("catálogo: colores", () => {
  it("elige texto blanco o negro con buen contraste y respeta la paleta del Excel", () => {
    const text = (c: string) => textOn(DEFAULT_CATALOG.shifts[c as "M"].color);
    expect(["M", "T", "P", "D", "V", "MZ"].map(text)).toEqual(Array(6).fill("#000000"));
    expect(["N", "S", "A"].map(text)).toEqual(Array(3).fill("#ffffff"));
  });
});

describe("catálogo: se aplica a toda la app", () => {
  it("renombra, repinta y cambia letras y horas", () => {
    const c = normalizeCatalog({ shifts: { M: { label: "Madrugada", letter: "ma", start: "06:00", end: "14:00", color: "#112233" } } });
    applyCatalog(c);
    expect(SHIFTS.M).toMatchObject({ label: "Madrugada", start: "06:00", end: "14:00", color: "#112233" });
    expect(displayCode("M")).toBe("MA");
    expect(shiftPaint("M")).toEqual({ backgroundColor: "#112233", color: "#ffffff" });
    applyCatalog(DEFAULT_CATALOG);
    expect(SHIFTS.M.label).toBe("Mañana");
    expect(displayCode("D")).toBe("L");
  });

  it("los turnos propios entran y salen de las tablas", () => {
    applyCatalog(withCustom());
    expect(SHIFTS.X1).toMatchObject({ label: "Desayunos", custom: "work" });
    expect(displayCode("X1")).toBe("DZ");
    expect(isOff("X1")).toBe(false);
    expect(isOff("X2")).toBe(true);
    expect(legendCodes()).toContain("X1");
    applyCatalog(DEFAULT_CATALOG);
    expect(SHIFTS.X1).toBeUndefined();
  });

  it("un turno archivado sigue pintándose pero ya no se ofrece", () => {
    const c = withCustom();
    c.custom[0].archived = true;
    applyCatalog(c);
    expect(SHIFTS.X1.label).toBe("Desayunos");
    expect(legendCodes()).not.toContain("X1");
    expect(allowedShifts(DEFAULT_STAFF[3])).not.toContain("X1");
    expect(allowedShifts(DEFAULT_STAFF[3])).toContain("X2");
  });
});

describe("turnos propios y el motor", () => {
  const staff = DEFAULT_STAFF;
  const oct = () => generateSchedule({ year: 2026, month: 10, staff }).schedule;

  it("el generador respeta un turno propio puesto a mano", () => {
    applyCatalog(withCustom());
    const base = oct();
    const unavailable = { "alberto-r": { "2026-10-14": "X2", "2026-10-15": "X1" } };
    const r = generateSchedule({ year: 2026, month: 10, staff, unavailable });
    expect(r.schedule["alberto-r"]["2026-10-14"]).toBe("X2");
    expect(r.schedule["alberto-r"]["2026-10-15"]).toBe("X1");
    expect(base["alberto-r"]["2026-10-14"]).not.toBe("X2");
    const v = validateSchedule(r.schedule, staff, 2026, 10);
    expect(v.issues.filter((i) => i.kind === "forbidden")).toEqual([]);
  });

  it("arreglar avisos y pedir libre no tocan los turnos propios", () => {
    applyCatalog(withCustom());
    const s = JSON.parse(JSON.stringify(oct()));
    s.marcos["2026-10-20"] = "X1";
    s.alejandro["2026-10-21"] = "X2";
    const ctx = { year: 2026, month: 10, staff, schedule: s, today: "2026-10-01" };
    const fixed = planFix({ ...ctx, schedule: (() => { const t = JSON.parse(JSON.stringify(s)); t.marta["2026-10-12"] = "M"; return t; })() });
    for (const c of fixed.changes) expect(["X1", "X2"]).not.toContain(c.from);
    expect(fixed.schedule.marcos["2026-10-20"]).toBe("X1");
    const off = planDayOff(ctx, "alberto-r", "2026-10-19", "D");
    expect(off.schedule.marcos["2026-10-20"]).toBe("X1");
    expect(off.schedule.alejandro["2026-10-21"]).toBe("X2");
  });

  it("un turno de trabajo propio cuenta horas y un día trabajado; uno de no trabajo, no", () => {
    applyCatalog(withCustom());
    const s = JSON.parse(JSON.stringify(oct()));
    s.marta["2026-10-14"] = "S"; // a Wednesday of 8 h
    s.marta["2026-10-15"] = "S";
    const before = summarizeMonth(s, staff, 2026, 10).find((x) => x.staffId === "marta")!;
    s.marta["2026-10-14"] = "X1"; // 4 h of work
    s.marta["2026-10-15"] = "X2"; // a course: no work
    const after = summarizeMonth(s, staff, 2026, 10).find((x) => x.staffId === "marta")!;
    expect(after.hours - before.hours).toBe(4 - 16);
    expect(after.worked).toBe(before.worked - 1); // X2 is not a worked day
  });
});

describe("puestos propios", () => {
  it("una persona en un puesto propio se ordena en su sección y se planifica como su puesto base", () => {
    applyCatalog(withCustom());
    const staff = addStaff(DEFAULT_STAFF, { name: "Lucía", role: "p-1" });
    const lucia = staff.find((p) => p.id === "lucia")!;
    expect(lucia).toMatchObject({ role: "receptionist", position: "p-1" });
    expect(sectionIdOf(lucia)).toBe("p-1");
    expect(sortBySections(staff).at(-1)!.id).toBe("lucia"); // the new section goes after the five built-in ones
    const r = generateSchedule({ year: 2026, month: 10, staff });
    expect(validateSchedule(r.schedule, staff, 2026, 10).issues.length).toBeLessThan(5);
  });

  it("mover entre secciones cambia el puesto y quita el propio al volver", () => {
    applyCatalog(withCustom());
    let staff = addStaff(DEFAULT_STAFF, { name: "Lucía", role: "p-1" });
    staff = moveStaff(staff, "lucia", "mozo", null);
    expect(staff.find((p) => p.id === "lucia")).toMatchObject({ role: "mozo" });
    expect(staff.find((p) => p.id === "lucia")!.position).toBeUndefined();
    expect(SECTIONS.map((s) => s.id).at(-1)).toBe("p-1");
  });

  it("si el puesto propio desaparece, la persona vuelve a su puesto base", () => {
    applyCatalog(withCustom());
    const staff = addStaff(DEFAULT_STAFF, { name: "Lucía", role: "p-1" });
    applyCatalog(DEFAULT_CATALOG);
    expect(sectionIdOf(staff.find((p) => p.id === "lucia")!)).toBe("receptionist");
  });
});
