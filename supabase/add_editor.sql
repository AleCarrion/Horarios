-- ONLY needed if the web "Accesos" page cannot be used (e.g. to recover access).
-- Makes the person with this e-mail an administrator. Run it in the SQL editor after she has signed in once with that e-mail.
insert into public.editors (user_id, email, role)
select id, lower(email), 'admin' from auth.users where email = 'correo@de.la.jefa'
on conflict (user_id) do update set role = 'admin', email = excluded.email;

-- Check: this must return one row with her e-mail.
select e.email, e.role from public.editors e;
