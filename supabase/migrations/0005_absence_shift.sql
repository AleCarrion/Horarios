-- "A" = ausencia / baja (imprevistos): a day the person does not work and that is not holidays.
insert into public.shifts (code, label, start_time, end_time, color)
values ('A', 'Ausencia / baja', null, null, '#7030a0')
on conflict (code) do nothing;
