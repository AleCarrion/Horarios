-- Workers: people who can see the schedule (as everyone) and send their OWN requests, linked to one person of the team.

-- 1. roles: admin / editor / worker (+ the person of the team a worker is)
alter table public.editors drop constraint if exists editors_role_check;
alter table public.editors add constraint editors_role_check check (role in ('admin','editor','worker'));
alter table public.editors add column if not exists staff_id text references public.staff(id) on delete set null;
alter table public.editors add constraint editors_worker_has_staff check (role <> 'worker' or staff_id is not null) not valid;

alter table public.editor_invites drop constraint if exists editor_invites_role_check;
alter table public.editor_invites add constraint editor_invites_role_check check (role in ('admin','editor','worker'));
alter table public.editor_invites add column if not exists staff_id text references public.staff(id) on delete cascade;
alter table public.editor_invites add constraint invites_worker_has_staff check (role <> 'worker' or staff_id is not null);

-- 2. is_editor() now means "may change the schedule": admins and editors, never workers.
create or replace function public.is_editor() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editors where user_id = auth.uid() and role in ('admin','editor'));
$$;

create function public.my_staff_id() returns text
language sql stable security definer set search_path = public as $$
  select staff_id from public.editors where user_id = auth.uid() and role = 'worker';
$$;

-- 3. claim_access also hands out the worker role (with the invited person of the team)
create or replace function public.claim_access() returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  r text;
  inv public.editor_invites%rowtype;
begin
  if uid is null then return 'none'; end if;
  select role into r from public.editors where user_id = uid;
  if found then
    update public.editors set email = mail where user_id = uid and email is distinct from mail;
    return r;
  end if;
  select * into inv from public.editor_invites where email = mail;
  if found then
    insert into public.editors (user_id, email, role, staff_id) values (uid, mail, inv.role, inv.staff_id);
    delete from public.editor_invites where email = mail;
    return inv.role;
  end if;
  if not exists (select 1 from public.editors where role = 'admin') then
    insert into public.editors (user_id, email, role) values (uid, mail, 'admin');
    return 'admin';
  end if;
  return 'none';
end $$;

-- 4. what a worker may do with requests: see, create and cancel (while pending) only her own
create policy "workers read own requests" on public.requests for select using (staff_id = public.my_staff_id());
create policy "workers create own requests" on public.requests for insert with check (
  staff_id = public.my_staff_id() and status = 'pending' and decided_at is null and decision_note is null
);
create policy "workers cancel own pending requests" on public.requests for delete using (staff_id = public.my_staff_id() and status = 'pending');
