import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { freshDatabase, migrationFiles } from "./harness";

const root = join(__dirname, "..");
const repair = readFileSync(join(root, "repair_2026-10.sql"), "utf8");

describe("repair_2026-10.sql", () => {
  it("se puede ejecutar varias veces en una base completa", async () => {
    const db = await freshDatabase();
    await db.exec(repair);
    await db.exec(repair);
    expect((await db.query("select 1 from public.schedule_months")).rows).toHaveLength(0);
  });

  it("deja al día un proyecto al que le faltaban la 0004 y la 0006", async () => {
    // el estado real de Horarios el 12-oct-2026: sin 0004 ni 0006 (la 0010 aún no se aplicó)
    const db = new PGlite();
    const { SUPABASE_STUB } = await import("./harness");
    await db.exec(SUPABASE_STUB);
    for (const f of migrationFiles().filter((f) => !/^000[46]|^001[01]/.test(f))) await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
    await db.exec(repair);
    await db.exec(`insert into public.schedule_months (year, month, status) values (2026, 10, 'published')`);
    await db.exec(`select public.apply_cells('[{"staff_id":"x","day":"2026-10-01","shift_code":"M","at":"2026-10-01T00:00:00Z"}]'::jsonb)`).catch(() => {});
    expect((await db.query("select 1 from pg_policies where policyname = 'editors manage locks'")).rows).toHaveLength(1);
    expect((await db.query("select 1 from information_schema.columns where table_name = 'requests' and column_name = 'shift'")).rows).toHaveLength(1);
  });
});
