import { describe, expect, it } from "vitest";
import { addStaff, changeRole, moveStaff, removeStaff, SECTIONS, sortBySections, updateStaff } from "./team";
import { DEFAULT_STAFF } from "./roster";

const ids = (s: { id: string }[]) => s.map((x) => x.id);

describe("sections", () => {
  it("orders staff like the hotel's sheet: dirección, apoyo, recepción, noche, mozos", () => {
    expect(SECTIONS.map((s) => s.role)).toEqual(["director", "senior", "receptionist", "night_auditor", "mozo"]);
    expect(ids(sortBySections(DEFAULT_STAFF))).toEqual([
      "marta", "ana", "julio", "alberto-r", "alejandro", "marcos", "jc", "alberto-m", "arturo",
    ]);
  });

  it("sorting is stable inside a section", () => {
    const get = (id: string) => DEFAULT_STAFF.find((x) => x.id === id)!;
    const shuffled = [get("alberto-r"), get("marcos"), get("alejandro")];
    expect(ids(sortBySections(shuffled))).toEqual(["alberto-r", "marcos", "alejandro"]);
  });
});

describe("moveStaff", () => {
  const base = sortBySections(DEFAULT_STAFF);

  it("reorders inside a section (before another person)", () => {
    const r = moveStaff(base, "marcos", "receptionist", "alberto-r");
    expect(ids(r).slice(3, 6)).toEqual(["marcos", "alberto-r", "alejandro"]);
  });

  it("moves to the end of a section when no 'before' is given", () => {
    const r = moveStaff(base, "alberto-r", "receptionist", null);
    expect(ids(r).slice(3, 6)).toEqual(["alejandro", "marcos", "alberto-r"]);
  });

  it("is a no-op when dropped where it already is", () => {
    expect(moveStaff(base, "alejandro", "receptionist", "marcos")).toEqual(base);
  });

  it("moving to another section changes the role and applies its defaults", () => {
    const r = moveStaff(base, "alberto-r", "senior", "julio");
    const moved = r.find((s) => s.id === "alberto-r")!;
    expect(moved.role).toBe("senior");
    expect(moved.extraShifts).toEqual(["M"]);
    expect(ids(r).slice(1, 4)).toEqual(["ana", "alberto-r", "julio"]);
  });

  it("does not mutate its input", () => {
    const copy = JSON.stringify(base);
    moveStaff(base, "marcos", "mozo", null);
    expect(JSON.stringify(base)).toBe(copy);
  });
});

describe("changeRole", () => {
  it("leaving 'senior' drops cover settings", () => {
    const julio = changeRole(DEFAULT_STAFF, "julio", "receptionist").find((s) => s.id === "julio")!;
    expect(julio.role).toBe("receptionist");
    expect(julio.extraShifts).toBeUndefined();
    expect(julio.maxCovers).toBeUndefined();
  });

  it("becoming a mozo gets a cycle anchor 5 days after an existing mozo so one always works", () => {
    const r = changeRole(DEFAULT_STAFF.filter((s) => s.id !== "arturo"), "marcos", "mozo").find((s) => s.id === "marcos")!;
    expect(r.cycleAnchor).toBe("2026-01-06"); // alberto-m anchors on 2026-01-01
  });

  it("leaving 'mozo' drops the cycle anchor", () => {
    const r = changeRole(DEFAULT_STAFF, "arturo", "receptionist").find((s) => s.id === "arturo")!;
    expect(r.cycleAnchor).toBeUndefined();
  });

  it("moves the person to the end of the new section", () => {
    const r = changeRole(sortBySections(DEFAULT_STAFF), "marta", "receptionist");
    expect(ids(r).slice(0, 7)).toEqual(["ana", "julio", "alberto-r", "alejandro", "marcos", "marta", "jc"]);
  });
});

describe("add / update / remove", () => {
  it("adds a person at the end of their section with a unique slug id", () => {
    let r = addStaff(DEFAULT_STAFF, { name: "María José", role: "receptionist" });
    r = addStaff(r, { name: "María José", role: "receptionist" });
    const added = r.filter((s) => s.name === "María José");
    expect(added.map((s) => s.id)).toEqual(["maria-jose", "maria-jose-2"]);
    expect(ids(sortBySections(r)).indexOf("maria-jose")).toBe(6);
    expect(added[0].role).toBe("receptionist");
  });

  it("a new senior gets Ana-like cover defaults, a new mozo gets an anchor", () => {
    const senior = addStaff(DEFAULT_STAFF, { name: "Nuevo", role: "senior" }).find((s) => s.id === "nuevo")!;
    expect(senior.extraShifts).toEqual(["M"]);
    const mozo = addStaff(DEFAULT_STAFF, { name: "Pepe", role: "mozo" }).find((s) => s.id === "pepe")!;
    expect(mozo.cycleAnchor).toBeDefined();
  });

  it("trims names and refuses empty ones", () => {
    expect(addStaff(DEFAULT_STAFF, { name: "   ", role: "mozo" })).toBe(DEFAULT_STAFF);
    expect(addStaff(DEFAULT_STAFF, { name: "  Lola  ", role: "mozo" }).some((s) => s.name === "Lola")).toBe(true);
  });

  it("updates fields and removes people", () => {
    expect(updateStaff(DEFAULT_STAFF, "marta", { name: "Marta G." }).find((s) => s.id === "marta")!.name).toBe("Marta G.");
    expect(ids(removeStaff(DEFAULT_STAFF, "arturo"))).not.toContain("arturo");
  });
});
