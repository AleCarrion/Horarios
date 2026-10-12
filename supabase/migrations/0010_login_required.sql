-- Everything now needs an account of the hotel: nobody sees the schedule, the team or the rules without signing in
-- (and being admin, editor or worker). Before this, reading was open to anyone who knew the address.

create or replace function public.has_access() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editors where user_id = auth.uid());
$$;

drop policy if exists "read staff" on public.staff;
drop policy if exists "read shifts" on public.shifts;
drop policy if exists "read schedule" on public.monthly_schedule;
drop policy if exists "read months" on public.schedule_months;
drop policy if exists "read rules" on public.app_rules;

create policy "read staff" on public.staff for select using (public.has_access());
create policy "read shifts" on public.shifts for select using (public.has_access());
create policy "read schedule" on public.monthly_schedule for select using (public.has_access());
create policy "read months" on public.schedule_months for select using (public.has_access());
create policy "read rules" on public.app_rules for select using (public.has_access());

-- Every shift code the app uses must exist (the schedule table references them).
insert into public.shifts (code, label, start_time, end_time, color) values
  ('M','Mañana','07:00','15:00','#f59e0b'),
  ('T','Tarde','15:00','23:00','#0ea5e9'),
  ('N','Noche','23:00','07:00','#4338ca'),
  ('S','Supervisión','09:15','17:15','#0f766e'),
  ('P','Partido','09:15','17:15','#7c3aed'),
  ('MZ','Mozo','11:00','19:00','#65a30d'),
  ('D','Libre',null,null,'#92d050'),
  ('V','Vacaciones',null,null,'#ff0000'),
  ('A','Ausencia / baja',null,null,'#7030a0'),
  ('B','Fuera de plantilla',null,null,'#000000')
on conflict (code) do nothing;

-- The app asks which migration the database is at, and tells the admin when one is missing.
create or replace function public.schema_level() returns int
language sql stable as $$ select 10 $$;
