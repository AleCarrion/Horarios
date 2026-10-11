import { beforeEach, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase } from "./harness";

const ADMIN = { user: "aaaaaaaa-0000-0000-0000-000000000001", email: "jefa@hotel.test" };
const ANA = { user: "bbbbbbbb-0000-0000-0000-000000000002", email: "ana@hotel.test" };
const JULIO = { user: "cccccccc-0000-0000-0000-000000000003", email: "julio@hotel.test" };
let db: PGlite;

const claim = (who: typeof ADMIN) => as(db, who, async () => (await db.query<{ claim_access: string }>("select public.claim_access()")).rows[0].claim_access);
const fails = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};
const req = (id: string, staff: string, extra = "") =>
  `insert into public.requests (id, group_id, kind, staff_id, date ${extra ? ", " + extra.split("|")[0] : ""}) values ('${id}', 'g', 'libre', '${staff}', '2026-11-20' ${extra ? ", " + extra.split("|")[1] : ""})`;

beforeEach(async () => {
  db = await freshDatabase();
  await db.exec(`insert into auth.users (id, email) values ('${ADMIN.user}', '${ADMIN.email}'), ('${ANA.user}', '${ANA.email}'), ('${JULIO.user}', '${JULIO.email}')`);
  await claim(ADMIN);
  await as(db, ADMIN, () => db.exec(`insert into public.editor_invites (email, role, staff_id) values ('ana@hotel.test', 'worker', 'alberto-r'), ('julio@hotel.test', 'worker', 'marcos')`));
  await claim(ANA);
  await claim(JULIO);
});

describe("trabajadores", () => {
  it("una invitación de trabajador pide la persona del equipo y al entrar queda vinculada", async () => {
    expect((await db.query<{ role: string; staff_id: string }>("select role, staff_id from public.editors where email = 'ana@hotel.test'")).rows).toEqual([{ role: "worker", staff_id: "alberto-r" }]);
    expect(await fails(() => as(db, ADMIN, () => db.exec("insert into public.editor_invites (email, role) values ('x@hotel.test', 'worker')")))).toBe(true);
  });

  it("puede ver el horario pero NO modificarlo (ni la plantilla, ni los bloqueos)", async () => {
    expect((await as(db, ANA, () => db.query("select 1 from public.staff"))).rows.length).toBeGreaterThan(0);
    expect(await fails(() => as(db, ANA, () => db.exec("insert into public.monthly_schedule (staff_id, day, shift_code) values ('alberto-r', '2026-11-02', 'M')")))).toBe(true);
    expect(await fails(() => as(db, ANA, () => db.exec("insert into public.locked_cells (staff_id, day) values ('alberto-r', '2026-11-02')")))).toBe(true);
    expect(await fails(() => as(db, ANA, () => db.exec("select public.apply_cells('[{\"staff_id\":\"alberto-r\",\"day\":\"2026-11-02\",\"shift_code\":\"M\",\"at\":\"2999-01-01T00:00:00Z\"}]'::jsonb)")))).toBe(true);
  });

  it("puede enviar peticiones SUYAS y verlas; las de otros ni las ve ni las crea", async () => {
    await as(db, ANA, () => db.exec(req("r-ana", "alberto-r")));
    await as(db, JULIO, () => db.exec(req("r-julio", "marcos")));
    expect(await fails(() => as(db, ANA, () => db.exec(req("r-falsa", "marcos"))))).toBe(true);
    const mine = await as(db, ANA, () => db.query<{ id: string }>("select id from public.requests"));
    expect(mine.rows.map((r) => r.id)).toEqual(["r-ana"]);
  });

  it("no puede aprobar su propia petición ni crearla ya decidida", async () => {
    expect(await fails(() => as(db, ANA, () => db.exec(req("r1", "alberto-r", "status|'approved'"))))).toBe(true);
    expect(await fails(() => as(db, ANA, () => db.exec(req("r2", "alberto-r", "decision_note|'ok'"))))).toBe(true);
    await as(db, ANA, () => db.exec(req("r3", "alberto-r")));
    await as(db, ANA, () => db.exec("update public.requests set status = 'approved' where id = 'r3'")); // RLS: no update policy -> no rows
    expect((await db.query<{ status: string }>("select status from public.requests where id = 'r3'")).rows[0].status).toBe("pending");
  });

  it("puede cancelar sus peticiones mientras están pendientes, y ya no cuando se han decidido", async () => {
    await as(db, ANA, () => db.exec(req("r-a", "alberto-r")));
    await as(db, ANA, () => db.exec(req("r-b", "alberto-r")));
    await as(db, ADMIN, () => db.exec("update public.requests set status = 'approved' where id = 'r-b'"));
    await as(db, ANA, () => db.exec("delete from public.requests"));
    expect((await db.query<{ id: string }>("select id from public.requests")).rows.map((r) => r.id)).toEqual(["r-b"]);
  });

  it("la jefa ve y decide las peticiones de todos", async () => {
    await as(db, ANA, () => db.exec(req("r-ana", "alberto-r")));
    await as(db, JULIO, () => db.exec(req("r-julio", "marcos")));
    expect((await as(db, ADMIN, () => db.query("select 1 from public.requests"))).rows).toHaveLength(2);
    await as(db, ADMIN, () => db.exec("update public.requests set status = 'rejected', decision_note = 'no' where id = 'r-ana'"));
    expect((await as(db, ANA, () => db.query<{ status: string }>("select status from public.requests"))).rows).toEqual([{ status: "rejected" }]);
  });

  it("un trabajador no puede invitar ni cambiar accesos, y el editor normal sigue pudiendo escribir", async () => {
    expect(await fails(() => as(db, ANA, () => db.exec("insert into public.editor_invites (email, role) values ('z@x.test', 'editor')")))).toBe(true);
    await as(db, ANA, () => db.exec("update public.editors set role = 'admin'"));
    expect((await db.query("select 1 from public.editors where role = 'admin' and email = 'ana@hotel.test'")).rows).toHaveLength(0);
    await as(db, ADMIN, () => db.exec("insert into public.editor_invites (email, role) values ('ed@hotel.test', 'editor')"));
    await db.exec("insert into auth.users (id, email) values ('dddddddd-0000-0000-0000-000000000004', 'ed@hotel.test')");
    const ED = { user: "dddddddd-0000-0000-0000-000000000004", email: "ed@hotel.test" };
    expect(await claim(ED)).toBe("editor");
    await as(db, ED, () => db.exec("insert into public.monthly_schedule (staff_id, day, shift_code) values ('alberto-r', '2026-11-02', 'M')"));
  });
});
