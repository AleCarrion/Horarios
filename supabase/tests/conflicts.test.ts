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

const apply = (cells: object[], who = manager) => as(db, who, async () => (await db.query<{ r: unknown }>("select public.apply_cells($1::jsonb) as r", [JSON.stringify(cells)])).rows[0].r as { staff_id: string; day: string; shift_code: string }[]);
const cell = (id: string, day: string) => db.query<{ shift_code: string }>("select shift_code from public.monthly_schedule where staff_id = $1 and day = $2", [id, day]).then((r) => r.rows[0]?.shift_code);
const longAgo = "2000-01-01T00:00:00Z";
const future = "2999-01-01T00:00:00Z";

describe("guardar casillas sin pisar cambios más nuevos", () => {
  it("una casilla nueva se guarda", async () => {
    expect(await apply([{ staff_id: "ana", day: "2026-11-01", shift_code: "P", at: future }])).toEqual([]);
    expect(await cell("ana", "2026-11-01")).toBe("P");
  });

  it("editada después de lo que hay en el servidor: gana la edición", async () => {
    expect(await apply([{ staff_id: "ana", day: "2026-11-01", shift_code: "D", at: future }])).toEqual([]);
    expect(await cell("ana", "2026-11-01")).toBe("D");
  });

  it("editada ANTES de lo que hay en el servidor (otro dispositivo cambió después): gana el servidor y se avisa", async () => {
    const rejected = await apply([{ staff_id: "ana", day: "2026-11-01", shift_code: "M", at: longAgo }]);
    expect(rejected).toEqual([{ staff_id: "ana", day: "2026-11-01", shift_code: "D" }]);
    expect(await cell("ana", "2026-11-01")).toBe("D");
  });

  it("si el valor ya es el mismo no hay conflicto", async () => {
    expect(await apply([{ staff_id: "ana", day: "2026-11-01", shift_code: "D", at: longAgo }])).toEqual([]);
  });

  it("varias casillas a la vez: se guardan las buenas y se devuelven solo las rechazadas", async () => {
    const rejected = await apply([
      { staff_id: "ana", day: "2026-11-01", shift_code: "T", at: longAgo },
      { staff_id: "julio", day: "2026-11-02", shift_code: "P", at: future },
    ]);
    expect(rejected.map((r) => r.staff_id)).toEqual(["ana"]);
    expect(await cell("julio", "2026-11-02")).toBe("P");
  });

  it("solo la editora puede usarlo", async () => {
    let failed = false;
    try {
      await apply([{ staff_id: "ana", day: "2026-11-05", shift_code: "P", at: future }], worker);
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(await cell("ana", "2026-11-05")).toBeUndefined();
  });
});

describe("estado del mes y reglas compartidas", () => {
  it("lectura solo con cuenta, escritura solo de la editora, y se anota quién y cuándo", async () => {
    await as(db, manager, () => db.exec("insert into public.schedule_months (year, month, status) values (2026, 11, 'published')"));
    expect((await as(db, "anon", () => db.query("select status from public.schedule_months"))).rows).toEqual([]);
    expect((await as(db, manager, () => db.query("select status from public.schedule_months"))).rows).toEqual([{ status: "published" }]);
    await as(db, worker, () => db.exec("update public.schedule_months set status = 'draft'"));
    expect((await db.query<{ status: string }>("select status from public.schedule_months")).rows[0].status).toBe("published");
    const who = await db.query<{ changed_by: string }>("select changed_by from public.schedule_months");
    expect(who.rows[0].changed_by).toBe(MANAGER);
  });

  it("las reglas son una sola fila", async () => {
    await as(db, manager, () => db.exec(`insert into public.app_rules (rules) values ('{"maxRestRun":3}')`));
    let failed = false;
    try {
      await as(db, manager, () => db.exec(`insert into public.app_rules (id, rules) values (2, '{}')`));
    } catch {
      failed = true;
    }
    expect(failed).toBe(true);
    expect((await as(db, "anon", () => db.query("select rules from public.app_rules"))).rows).toHaveLength(0);
    expect((await as(db, manager, () => db.query("select rules from public.app_rules"))).rows).toHaveLength(1);
  });
});
