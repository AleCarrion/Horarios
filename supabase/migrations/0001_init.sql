-- Horarios Casa 1800 — initial schema

create table public.staff (
  id text primary key,
  name text not null,
  role text not null check (role in ('night_auditor','director','senior','receptionist','mozo')),
  cycle_anchor date,
  sort_order int not null default 0,
  active boolean not null default true
);

create table public.shifts (
  code text primary key,
  label text not null,
  start_time time,
  end_time time,
  color text not null
);

create table public.monthly_schedule (
  staff_id text not null references public.staff(id),
  day date not null,
  shift_code text not null references public.shifts(code),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  primary key (staff_id, day)
);
create index monthly_schedule_day_idx on public.monthly_schedule (day);

create table public.audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  user_email text,
  staff_id text not null,
  day date not null,
  old_shift text,
  new_shift text
);
create index audit_log_at_idx on public.audit_log (at desc);

-- Users allowed to edit (the manager). Everyone else is read-only.
create table public.editors (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editors where user_id = auth.uid());
$$;

create function public.log_schedule_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'INSERT' or old.shift_code is distinct from new.shift_code then
    insert into public.audit_log (user_id, user_email, staff_id, day, old_shift, new_shift)
    values (auth.uid(), auth.jwt() ->> 'email', new.staff_id, new.day,
            case when tg_op = 'UPDATE' then old.shift_code end, new.shift_code);
  end if;
  return new;
end $$;

create trigger monthly_schedule_audit
before insert or update on public.monthly_schedule
for each row execute function public.log_schedule_change();

alter table public.staff enable row level security;
alter table public.shifts enable row level security;
alter table public.monthly_schedule enable row level security;
alter table public.audit_log enable row level security;
alter table public.editors enable row level security;

create policy "read staff" on public.staff for select using (true);
create policy "read shifts" on public.shifts for select using (true);
create policy "read schedule" on public.monthly_schedule for select using (true);
create policy "editors write schedule" on public.monthly_schedule
  for all using (public.is_editor()) with check (public.is_editor());
create policy "editors manage staff" on public.staff
  for all using (public.is_editor()) with check (public.is_editor());
create policy "editors read audit" on public.audit_log for select using (public.is_editor());
create policy "editors read self" on public.editors for select using (user_id = auth.uid());

alter publication supabase_realtime add table public.monthly_schedule;
