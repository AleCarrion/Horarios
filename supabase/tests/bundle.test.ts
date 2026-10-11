import { describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { bundle } from "../../scripts/bundle-sql.mjs";

const root = join(__dirname, "..");

describe("setup_all.sql", () => {
  it("está al día con las migraciones (si falla: npm run db:bundle)", () => {
    expect(readFileSync(join(root, "setup_all.sql"), "utf8")).toBe(bundle());
  });

  it("aplicado de una vez en un proyecto nuevo deja todo listo", async () => {
    const db = new PGlite();
    await db.exec(`create schema auth; create table auth.users (id uuid primary key, email text);
      create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
      create function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;
      create publication supabase_realtime;`);
    await db.exec(readFileSync(join(root, "setup_all.sql"), "utf8"));
    const tables = await db.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public' order by 1");
    expect(tables.rows.map((r) => r.tablename)).toEqual(expect.arrayContaining(["staff", "shifts", "monthly_schedule", "audit_log", "editors", "requests", "locked_cells", "schedule_months", "app_rules"]));
    const rls = await db.query<{ relname: string }>("select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity");
    expect(rls.rows).toEqual([]); // every table has row level security on
  });
});
