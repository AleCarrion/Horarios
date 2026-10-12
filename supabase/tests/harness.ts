import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");

/** What Supabase provides before our migrations run: the auth schema (auth.users, auth.uid(), auth.jwt()), the API roles and the realtime publication. */
export const SUPABASE_STUB = `
create schema auth;
create table auth.users (id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('email', nullif(current_setting('request.jwt.claim.email', true), '')) $$;
create role anon nologin;
create role authenticated nologin;
create publication supabase_realtime;
grant usage on schema public, auth to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
alter default privileges in schema public grant execute on functions to anon, authenticated;
`;

export const migrationFiles = () => readdirSync(join(root, "migrations")).filter((f) => f.endsWith(".sql")).sort();

/** A fresh database with every migration and the seed applied, like a new Supabase project. */
export async function freshDatabase(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(SUPABASE_STUB);
  for (const f of migrationFiles()) await db.exec(readFileSync(join(root, "migrations", f), "utf8"));
  await db.exec(readFileSync(join(root, "seed.sql"), "utf8"));
  return db;
}

export const MANAGER = "11111111-1111-1111-1111-111111111111";
export const WORKER = "22222222-2222-2222-2222-222222222222";

/** Runs `fn` the way the Supabase API would: as role anon / authenticated with the given user. */
export async function as<T>(db: PGlite, who: "anon" | { user: string; email: string }, fn: () => Promise<T>): Promise<T> {
  await db.exec("begin");
  try {
    if (who === "anon") await db.exec(`set local role anon; select set_config('request.jwt.claim.sub', '', true); select set_config('request.jwt.claim.email', '', true);`);
    else await db.exec(`set local role authenticated; select set_config('request.jwt.claim.sub', '${who.user}', true); select set_config('request.jwt.claim.email', '${who.email}', true);`);
    const out = await fn();
    await db.exec("commit");
    return out;
  } catch (e) {
    await db.exec("rollback");
    throw e;
  }
}
