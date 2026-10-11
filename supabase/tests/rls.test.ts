import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, MANAGER, WORKER } from "./harness";

let db: PGlite;
const manager = { user: MANAGER, email: "jefa@hotel.test" };
const worker = { user: WORKER, email: "trabajador@hotel.test" };

beforeAll(async () => {
  db = await freshDatabase();
  await db.exec(`insert into auth.users (id, email) values ('${MANAGER}', 'jefa@hotel.test'), ('${WORKER}', 'trabajador@hotel.test');
                 insert into public.editors (user_id) values ('${MANAGER}');`);
});

const denied = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return String((e as Error).message);
  }
  return null;
};

describe("migraciones desde cero", () => {
  it("se aplican todas en orden y el seed deja la plantilla y los turnos", async () => {
    const staff = await db.query<{ n: number }>("select count(*)::int as n from public.staff");
    const shifts = await db.query<{ code: string }>("select code from public.shifts order by code");
    expect(staff.rows[0].n).toBe(9);
    expect(shifts.rows.map((r) => r.code)).toEqual(expect.arrayContaining(["M", "T", "N", "S", "P", "MZ", "D", "V", "A", "B"]));
  });
});

describe("lectura abierta (la app no se cierra)", () => {
  it("cualquiera, sin sesión, puede ver plantilla, turnos y cuadrante", async () => {
    await as(db, manager, async () => {
      await db.exec("insert into public.monthly_schedule (staff_id, day, shift_code) values ('marta', '2026-10-01', 'S')");
    });
    const rows = await as(db, "anon", () => db.query<{ staff_id: string }>("select staff_id from public.monthly_schedule"));
    expect(rows.rows).toHaveLength(1);
    expect((await as(db, "anon", () => db.query("select 1 from public.staff"))).rows.length).toBeGreaterThan(0);
  });
});

describe("escribir solo puede la jefa", () => {
  const cells = "insert into public.monthly_schedule (staff_id, day, shift_code) values ('ana', '2026-10-02', 'P')";

  it("sin sesión no puede escribir el cuadrante, ni la plantilla, ni solicitudes, ni bloqueos", async () => {
    for (const sql of [cells, "insert into public.locked_cells (staff_id, day) values ('ana', '2026-10-02')", "insert into public.staff (id, name, role) values ('x', 'X', 'receptionist')"]) {
      expect(await denied(() => as(db, "anon", () => db.exec(sql))), sql).not.toBeNull();
    }
    // updates and deletes under RLS silently touch no rows
    await as(db, "anon", () => db.exec("update public.staff set name = 'X' where id = 'ana'; delete from public.staff where id = 'ana';"));
    expect((await db.query<{ name: string }>("select name from public.staff where id = 'ana'")).rows[0].name).toBe("Ana");
  });

  it("una persona con sesión que no es editora tampoco", async () => {
    expect(await denied(() => as(db, worker, () => db.exec(cells)))).not.toBeNull();
    // updates and deletes silently affect no rows under RLS
    await as(db, worker, () => db.exec("update public.staff set name = 'Hackeado' where id = 'ana'; delete from public.monthly_schedule;"));
    expect((await db.query<{ name: string }>("select name from public.staff where id = 'ana'")).rows[0].name).toBe("Ana");
    expect((await db.query("select 1 from public.monthly_schedule")).rows.length).toBe(1);
  });

  it("la editora puede escribir y queda anotado quién cambió qué", async () => {
    await as(db, manager, () => db.exec(cells));
    const log = await db.query<{ user_email: string; new_shift: string }>("select user_email, new_shift from public.audit_log where staff_id = 'ana' order by id desc limit 1");
    expect(log.rows[0]).toEqual({ user_email: "jefa@hotel.test", new_shift: "P" });
  });

  it("el registro de auditoría solo lo lee la editora", async () => {
    expect((await as(db, "anon", () => db.query("select 1 from public.audit_log"))).rows).toHaveLength(0);
    expect((await as(db, worker, () => db.query("select 1 from public.audit_log"))).rows).toHaveLength(0);
    expect((await as(db, manager, () => db.query("select 1 from public.audit_log"))).rows.length).toBeGreaterThan(0);
  });

  it("las solicitudes y los bloqueos son solo de la editora (por ahora)", async () => {
    await as(db, manager, () => db.exec(`insert into public.requests (id, group_id, kind, staff_id, date) values ('r1', 'g1', 'libre', 'ana', '2026-10-20')`));
    expect((await as(db, "anon", () => db.query("select 1 from public.requests"))).rows).toHaveLength(0);
    expect((await as(db, worker, () => db.query("select 1 from public.requests"))).rows).toHaveLength(0);
    expect((await as(db, manager, () => db.query("select 1 from public.requests"))).rows).toHaveLength(1);
  });

  it("un turno que no existe se rechaza (integridad)", async () => {
    expect(await denied(() => as(db, manager, () => db.exec("insert into public.monthly_schedule (staff_id, day, shift_code) values ('ana', '2026-10-03', 'ZZ')")))).not.toBeNull();
  });
});
