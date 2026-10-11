-- Gives the manager permission to edit. Run it ONCE, after she has signed in once with her email (so the user exists).
-- Replace the email below with hers.
insert into public.editors (user_id)
select id from auth.users where email = 'correo@de.la.jefa'
on conflict do nothing;

-- Check: this must return one row with her email.
select u.email, e.user_id from public.editors e join auth.users u on u.id = e.user_id;
