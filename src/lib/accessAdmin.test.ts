import { describe, expect, it } from "vitest";
import { accessError, isEmail, normalizeEmail, sortAccess, type AccessEntry } from "./accessAdmin";

describe("accesos: utilidades", () => {
  it("normalises and validates e-mails", () => {
    expect(normalizeEmail("  Ana@Hotel.ES ")).toBe("ana@hotel.es");
    expect(isEmail("ana@hotel.es")).toBe(true);
    expect(isEmail("ana@hotel")).toBe(false);
    expect(isEmail("sin arroba")).toBe(false);
  });
  it("lists members before invitations, admins first", () => {
    const e = (email: string, role: AccessEntry["role"], status: AccessEntry["status"]): AccessEntry => ({ email, role, status });
    expect(sortAccess([e("z@x.es", "editor", "invited"), e("b@x.es", "editor", "member"), e("a@x.es", "admin", "member"), e("c@x.es", "admin", "invited")]).map((x) => x.email)).toEqual(["a@x.es", "b@x.es", "c@x.es", "z@x.es"]);
  });
  it("explains database errors in Spanish", () => {
    expect(accessError("Tiene que quedar al menos una persona administradora")).toMatch(/al menos una/);
    expect(accessError('duplicate key value violates unique constraint')).toMatch(/ya está invitado/);
    expect(accessError("new row violates row-level security policy")).toMatch(/administradora puede/);
  });
});
