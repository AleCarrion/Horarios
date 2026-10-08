-- Requests (libre / vacaciones / cambio de turno) and locked cells. Editors only for now:
-- worker access (own requests via personal link) will be added in a later migration.

create table public.requests (
  id text primary key,
  group_id text not null,
  kind text not null check (kind in ('libre','vacaciones','cambio')),
  staff_id text not null references public.staff(id),
  date date not null,
  end_date date,
  with_staff_id text references public.staff(id),
  return_date date,
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  decided_at timestamptz,
  decision_note text,
  decided_by uuid references auth.users(id)
);
create index requests_status_date_idx on public.requests (status, date);

create table public.locked_cells (
  staff_id text not null references public.staff(id),
  day date not null,
  locked_by uuid references auth.users(id) default auth.uid(),
  locked_at timestamptz not null default now(),
  primary key (staff_id, day)
);
create index locked_cells_day_idx on public.locked_cells (day);

-- who decided
create function public.stamp_request_decision() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status <> 'pending' and (tg_op = 'INSERT' or old.status is distinct from new.status) then
    new.decided_by := auth.uid();
  end if;
  return new;
end $$;

create trigger requests_decision
before insert or update on public.requests
for each row execute function public.stamp_request_decision();

alter table public.requests enable row level security;
alter table public.locked_cells enable row level security;

create policy "editors manage requests" on public.requests
  for all using (public.is_editor()) with check (public.is_editor());
create policy "editors manage locks" on public.locked_cells
  for all using (public.is_editor()) with check (public.is_editor());

alter publication supabase_realtime add table public.requests;
alter publication supabase_realtime add table public.locked_cells;
