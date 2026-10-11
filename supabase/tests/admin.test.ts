import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase } from "./harness";

const A = { user: "aaaaaaaa-0000-0000-0000-000000000001", email: "Jefa@Hotel.test" };
const B = { user: "bbbbbbbb-0000-0000-0000-000000000002", email: "ana@hotel.test" };
const C = { user: "cccccccc-0000-0000-0000-000000000003", email: "intruso@x.test" };
let db: PGlite;

beforeEach(async () => {
  db = await freshDatabase();
  await db.exec(`insert into auth.users (id, email) values ('${A.user}', '${A.email}'), ('${B.user}', '${B.email}'), ('${C.user}', '${C.email}')`);
});

const claim = (who: typeof A) => as(db, who, async () => (await db.query<{ claim_access: string }>("select public.claim_access()")).rows[0].claim_access);
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

describe("accesos desde la web", () => {
  it("la primera persona que entra se queda como administradora (el correo se guarda en minúsculas)", async () => {
    expect(await claim(A)).toBe("admin");
    expect((await db.query<{ email: string; role: string }>("select email, role from public.editors")).rows).toEqual([{ email: "jefa@hotel.test", role: "admin" }]);
  });

  it("después, quien no está invitado no obtiene nada, por mucho que lo pida", async () => {
    await claim(A);
    expect(await claim(C)).toBe("none");
    expect(await claim(C)).toBe("none");
    expect((await db.query("select 1 from public.editors")).rows).toHaveLength(1);
  });

  it("la administradora invita un correo y esa persona, al entrar, pasa a ser editora (y la invitación se gasta)", async () => {
    await claim(A);
    await as(db, A, () => db.exec("insert into public.editor_invites (email) values ('ana@hotel.test')"));
    expect(await claim(B)).toBe("editor");
    expect((await db.query("select 1 from public.editor_invites")).rows).toHaveLength(0);
    // ya puede escribir el horario
    await as(db, B, () => db.exec("insert into public.monthly_schedule (staff_id, day, shift_code) values ('ana', '2026-10-02', 'P')"));
  });

  it("una editora normal no puede invitar ni quitar a nadie", async () => {
    await claim(A);
    await as(db, A, () => db.exec("insert into public.editor_invites (email) values ('ana@hotel.test')"));
    await claim(B);
    expect(await fails(() => as(db, B, () => db.exec("insert into public.editor_invites (email) values ('otra@x.test')")))).toBe(true);
    await as(db, B, () => db.exec("delete from public.editors where role = 'admin'"));
    expect((await db.query("select 1 from public.editors where role = 'admin'")).rows).toHaveLength(1);
  });

  it("nadie sin permiso ve la lista de accesos", async () => {
    await claim(A);
    expect((await as(db, C, () => db.query("select 1 from public.editors"))).rows).toHaveLength(0);
    expect((await as(db, "anon", () => db.query("select 1 from public.editor_invites"))).rows).toHaveLength(0);
  });

  it("no se puede dejar al hotel sin administradora", async () => {
    await claim(A);
    expect(await fails(() => as(db, A, () => db.exec("delete from public.editors where user_id = '" + A.user + "'")))).toBe(true);
    expect(await fails(() => as(db, A, () => db.exec("update public.editors set role = 'editor' where user_id = '" + A.user + "'")))).toBe(true);
  });

  it("una invitada como administradora puede relevar a la primera", async () => {
    await claim(A);
    await as(db, A, () => db.exec("insert into public.editor_invites (email, role) values ('ana@hotel.test', 'admin')"));
    expect(await claim(B)).toBe("admin");
    await as(db, B, () => db.exec("delete from public.editors where user_id = '" + A.user + "'"));
    expect((await db.query("select email from public.editors")).rows).toEqual([{ email: "ana@hotel.test" }]);
  });

  it("los editores que ya existían (antes de esta migración) siguen mandando", async () => {
    await db.exec(`insert into public.editors (user_id) values ('${B.user}')`);
    expect(await claim(B)).toBe("editor");
  });
});
