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

insert into public.staff (id, name, role, cycle_anchor, sort_order) values
  ('jc','José Carlos','night_auditor',null,1),
  ('marta','Marta','director',null,2),
  ('ana','Ana','senior',null,3),
  ('julio','Julio','senior',null,4),
  ('alberto-r','Alberto R.','receptionist',null,5),
  ('alejandro','Alejandro','receptionist',null,6),
  ('marcos','Marcos','receptionist',null,7),
  ('alberto-m','Alberto M.','mozo','2026-01-01',8),
  ('arturo','Arturo','mozo','2026-01-06',9)
on conflict (id) do nothing;

-- After the manager signs in once, register her as editor:
-- insert into public.editors (user_id) select id from auth.users where email = 'jefa@casa1800.example';
