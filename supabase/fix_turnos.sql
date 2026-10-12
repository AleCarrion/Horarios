-- Da de alta todos los turnos que usa la app. Se puede ejecutar varias veces sin problema.
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
