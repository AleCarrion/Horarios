import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase } from "./harness";

const ADMIN = { user: "aaaaaaaa-0000-0000-0000-000000000001", email: "jefa@hotel.test" };
const NEW1 = { user: "bbbbbbbb-0000-0000-0000-000000000002", email: "Alberto@Gmail.com" };
const NEW2 = { user: "cccccccc-0000-0000-0000-000000000003", email: "otra@gmail.com" };
let db: PGlite;

const one = async <T,>(who: Parameters<typeof as>[1], sql: string, params: unknown[] = []) => as(db, who, async () => (await db.query<{ r: T }>(sql, params)).rows[0].r);
const makeInvite = async (cols = "role, staff_id", vals = "'worker', 'alberto-r'") =>
  (await as(db, ADMIN, () => db.query<{ code: string }>(`insert into public.editor_invites (${cols}) values (${vals}) returning code`))).rows[0].code;

beforeEach(async () => {
  db = await freshDatabase();
  await db.exec(`insert into auth.users (id, email) values ('${ADMIN.user}', '${ADMIN.email}'), ('${NEW1.user}', '${NEW1.email}'), ('${NEW2.user}', '${NEW2.email}')`);
  await as(db, ADMIN, () => db.query("select public.claim_access()"));
});

describe("enlaces de invitación", () => {
  it("la administradora crea una invitación sin correo y obtiene un código difícil de adivinar", async () => {
    const code = await makeInvite();
    expect(code).toMatch(/^[0-9a-f]{32}$/);
  });

  it("cualquiera ve de qué va la invitación (rol y persona) sin ver ningún correo", async () => {
    const code = await makeInvite("role, staff_id, email", "'worker', 'alberto-r', 'secreto@x.test'");
    const info = await one<{ role: string; staff_name: string }>("anon", "select public.invite_info($1) as r", [code]);
    expect(info).toEqual({ role: "worker", staff_name: "Alberto R." });
    expect(JSON.stringify(info)).not.toContain("secreto");
    expect(await one("anon", "select public.invite_info('no-existe') as r")).toBeNull();
  });

  it("quien la abre crea su cuenta con el correo que quiera y queda como trabajador de esa persona", async () => {
    const code = await makeInvite();
    expect(await one<string>(NEW1, "select public.redeem_invite($1) as r", [code])).toBe("worker");
    expect((await db.query("select email, role, staff_id from public.editors where user_id = $1", [NEW1.user])).rows).toEqual([{ email: "alberto@gmail.com", role: "worker", staff_id: "alberto-r" }]);
  });

  it("sirve una sola vez", async () => {
    const code = await makeInvite();
    await one(NEW1, "select public.redeem_invite($1) as r", [code]);
    expect(await one<string>(NEW2, "select public.redeem_invite($1) as r", [code])).toBe("invalid");
  });

  it("caducada o inexistente: no da acceso", async () => {
    const code = await makeInvite();
    await db.exec("update public.editor_invites set expires_at = now() - interval '1 minute'");
    expect(await one<string>(NEW1, "select public.redeem_invite($1) as r", [code])).toBe("invalid");
    expect(await one<string>(NEW1, "select public.redeem_invite('xxxx') as r")).toBe("invalid");
    expect(await one("anon", "select public.invite_info($1) as r", [code])).toBeNull();
  });

  it("quien ya tenía acceso no cambia de permiso con un enlace", async () => {
    const code = await makeInvite("role", "'editor'");
    expect(await one<string>(ADMIN, "select public.redeem_invite($1) as r", [code])).toBe("already");
    expect((await db.query<{ role: string }>("select role from public.editors where user_id = $1", [ADMIN.user])).rows[0].role).toBe("admin");
  });

  it("un enlace nunca da permiso de administradora", async () => {
    const code = await makeInvite("role", "'admin'");
    expect(await one<string>(NEW1, "select public.redeem_invite($1) as r", [code])).toBe("invalid");
    expect(await one("anon", "select public.invite_info($1) as r", [code])).toBeNull();
  });

  it("sin sesión no se puede canjear, y solo la administradora crea o ve invitaciones", async () => {
    const code = await makeInvite();
    expect(await one<string>("anon", "select public.redeem_invite($1) as r", [code])).toBe("invalid");
    expect((await as(db, NEW1, () => db.query("select 1 from public.editor_invites"))).rows).toHaveLength(0);
    let failed = false;
    try {
      await as(db, NEW1, () => db.exec("insert into public.editor_invites (role) values ('editor')"));
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
  });

  it("las invitaciones por correo siguen funcionando como antes", async () => {
    await makeInvite("email, role, staff_id", "'alberto@gmail.com', 'worker', 'alberto-r'");
    expect(await one<string>(NEW1, "select public.claim_access() as r")).toBe("worker");
  });
});
