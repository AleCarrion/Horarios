import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDatabase, MANAGER, WORKER } from "./harness";

let db: PGlite;
const manager = { user: MANAGER, email: "jefa@hotel.example" };
const worker = { user: WORKER, email: "ana@hotel.example" };
const denied = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    return String((e as Error).message);
  }
  return null;
};

beforeAll(async () => {
  db = await freshDatabase();
  await db.exec(`insert into auth.users (id, email) values ('${MANAGER}', 'jefa@hotel.example'), ('${WORKER}', 'ana@hotel.example')`);
  await db.exec(`insert into public.editors (user_id, role, email) values ('${MANAGER}', 'admin', 'jefa@hotel.example')`);
  await db.exec(`insert into public.editors (user_id, role, email, staff_id) values ('${WORKER}', 'worker', 'ana@hotel.example', 'ana')`);
});

describe("catálogo del hotel (0011)", () => {
  it("la editora crea un turno propio y lo usa en el cuadrante", async () => {
    await as(db, manager, () => db.exec("insert into public.shifts (code, label, start_time, end_time, color) values ('X1', 'Desayunos', '10:00', '14:00', '#ff8800')"));
    await as(db, manager, () => db.exec("insert into public.monthly_schedule (staff_id, day, shift_code) values ('ana', '2026-10-05', 'X1')"));
    expect((await db.query("select 1 from public.monthly_schedule where shift_code = 'X1'")).rows).toHaveLength(1);
  });

  it("no se pueden inventar códigos raros ni borrar un turno en uso", async () => {
    expect(await denied(() => as(db, manager, () => db.exec("insert into public.shifts (code, label, color) values ('ZZ', 'Raro', '#000000')")))).not.toBeNull();
    expect(await denied(() => as(db, manager, () => db.exec("delete from public.shifts where code = 'X1'")))).not.toBeNull();
  });

  it("un trabajador ve el catálogo pero no lo cambia; sin sesión no se ve nada", async () => {
    await as(db, manager, () => db.exec(`insert into public.app_catalog (catalog) values ('{"custom":[]}')`));
    expect((await as(db, worker, () => db.query("select 1 from public.app_catalog"))).rows).toHaveLength(1);
    expect((await as(db, "anon", () => db.query("select 1 from public.app_catalog"))).rows).toHaveLength(0);
    expect(await denied(() => as(db, worker, () => db.exec("insert into public.shifts (code, label, color) values ('X2', 'Nada', '#000000')")))).not.toBeNull();
    await as(db, worker, () => db.exec(`update public.app_catalog set catalog = '{"hack":true}'`));
    expect((await db.query<{ catalog: { custom?: unknown } }>("select catalog from public.app_catalog")).rows[0].catalog.custom).toEqual([]);
  });

  it("un puesto propio se guarda en la plantilla y la base lo valida", async () => {
    await as(db, manager, () => db.exec("update public.staff set position = 'p-1' where id = 'ana'"));
    expect(await denied(() => as(db, manager, () => db.exec("update public.staff set position = 'cualquier cosa' where id = 'ana'")))).not.toBeNull();
  });
});
