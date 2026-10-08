-- Editable team: order (sort_order already exists), alta/baja dates and cover settings live in staff.
alter table public.staff
  add column if not exists active_from date,
  add column if not exists active_to date,
  add column if not exists extra_shifts text[],
  add column if not exists max_covers int;

-- Share team changes between sessions
alter publication supabase_realtime add table public.staff;
