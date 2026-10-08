-- "Turno pedido": a person asks to work a given shift (M/T/N) on a range of days.
alter table public.requests drop constraint if exists requests_kind_check;
alter table public.requests add constraint requests_kind_check check (kind in ('libre','vacaciones','cambio','turno'));
alter table public.requests add column if not exists shift text check (shift in ('M','T','N'));
