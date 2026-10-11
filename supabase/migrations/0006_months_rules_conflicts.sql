-- Month status shared between devices, the hotel's rules, and conflict-safe saving of cells.

-- 1. Month status: draft until the manager publishes it.
create table public.schedule_months (
  year int not null,
  month int not null check (month between 1 and 12),
  status text not null default 'draft' check (status in ('draft','published','reopened')),
  changed_at timestamptz not null default now(),
  changed_by uuid references auth.users(id) default auth.uid(),
  primary key (year, month)
);

-- 2. The hotel's rules (one row).
create table public.app_rules (
  id int primary key default 1 check (id = 1),
  rules jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) default auth.uid()
);

create function public.touch_row() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create function public.touch_month() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.changed_at := now();
  new.changed_by := auth.uid();
  return new;
end $$;

create trigger app_rules_touch before insert or update on public.app_rules for each row execute function public.touch_row();
create trigger schedule_months_touch before insert or update on public.schedule_months for each row execute function public.touch_month();

alter table public.schedule_months enable row level security;
alter table public.app_rules enable row level security;
create policy "read months" on public.schedule_months for select using (true);
create policy "editors write months" on public.schedule_months for all using (public.is_editor()) with check (public.is_editor());
create policy "read rules" on public.app_rules for select using (true);
create policy "editors write rules" on public.app_rules for all using (public.is_editor()) with check (public.is_editor());

alter publication supabase_realtime add table public.schedule_months;
alter publication supabase_realtime add table public.app_rules;

-- 3. Saving cells without trampling newer edits.
-- Each cell carries the moment it was edited ("at"). If the server already holds a *different* value written after that
-- moment (another device edited it meanwhile), the server value wins and is returned so the app can show it.
create function public.apply_cells(cells jsonb) returns jsonb
language plpgsql security invoker set search_path = public as $$
declare
  c jsonb;
  cur public.monthly_schedule%rowtype;
  rejected jsonb := '[]'::jsonb;
begin
  for c in select * from jsonb_array_elements(cells) loop
    select * into cur from public.monthly_schedule where staff_id = c->>'staff_id' and day = (c->>'day')::date;
    if found and cur.updated_at > (c->>'at')::timestamptz and cur.shift_code <> c->>'shift_code' then
      rejected := rejected || jsonb_build_array(jsonb_build_object('staff_id', cur.staff_id, 'day', cur.day, 'shift_code', cur.shift_code));
    else
      insert into public.monthly_schedule (staff_id, day, shift_code)
      values (c->>'staff_id', (c->>'day')::date, c->>'shift_code')
      on conflict (staff_id, day) do update set shift_code = excluded.shift_code;
    end if;
  end loop;
  return rejected;
end $$;
