-- The hotel's own look and vocabulary: names, letters, hours and colours of the shifts, its own extra shifts and puestos.

-- 1. One row with everything as JSON (see src/lib/domain/catalog.ts).
create table if not exists public.app_catalog (
  id int primary key default 1 check (id = 1),
  catalog jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);
drop trigger if exists app_catalog_touch on public.app_catalog;
create trigger app_catalog_touch before insert or update on public.app_catalog for each row execute function public.touch_row();

alter table public.app_catalog enable row level security;
create policy "read catalog" on public.app_catalog for select using (public.has_access());
create policy "editors write catalog" on public.app_catalog for all using (public.is_editor()) with check (public.is_editor());

do $$ begin alter publication supabase_realtime add table public.app_catalog; exception when duplicate_object then null; end $$;

-- 2. The schedule table references `shifts`, so the shifts the hotel creates ("X1", "X2"…) need a row there.
--    Editors may add and rename shifts; the ten built-in codes keep existing (nobody can delete a shift that is in use).
create policy "editors manage shifts" on public.shifts for all
  using (public.is_editor())
  with check (public.is_editor() and (code in ('M','T','N','S','P','MZ','D','V','A','B') or code ~ '^X[0-9]{1,3}$'));

-- 3. A person can sit in one of the hotel's own puestos ("p-1"…); `role` stays the built-in puesto the planner treats them like.
alter table public.staff add column if not exists position text check (position is null or position ~ '^p-[a-z0-9]{1,12}$');

create or replace function public.schema_level() returns int
language sql stable as $$ select 11 $$;
