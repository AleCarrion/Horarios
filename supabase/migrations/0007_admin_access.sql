-- Access managed from the web: an admin invites e-mails; an invited person becomes an editor the first time she signs in.

alter table public.editors
  add column if not exists role text not null default 'editor' check (role in ('admin','editor')),
  add column if not exists email text;

-- Editors that existed before this migration keep working; the first admin is claimed from the app (see claim_access).
create table public.editor_invites (
  email text primary key check (email = lower(email)),
  role text not null default 'editor' check (role in ('admin','editor')),
  invited_by uuid references auth.users(id) default auth.uid(),
  invited_at timestamptz not null default now()
);

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.editors where user_id = auth.uid() and role = 'admin');
$$;

-- Called by the app right after signing in. Returns the access the person has: 'admin', 'editor' or 'none'.
--  * already an editor            -> keeps her role
--  * her e-mail was invited       -> becomes editor/admin as invited (the invitation is used up)
--  * nobody is admin yet          -> she becomes the first admin (whoever opens the app first after setup)
create function public.claim_access() returns text
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
    insert into public.editors (user_id, email, role) values (uid, mail, inv.role);
    delete from public.editor_invites where email = mail;
    return inv.role;
  end if;
  if not exists (select 1 from public.editors where role = 'admin') then
    insert into public.editors (user_id, email, role) values (uid, mail, 'admin');
    return 'admin';
  end if;
  return 'none';
end $$;

-- Never leave the hotel without an admin.
create function public.keep_one_admin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and (tg_op = 'DELETE' or new.role <> 'admin') and not exists (select 1 from public.editors where role = 'admin' and user_id <> old.user_id) then
    raise exception 'Tiene que quedar al menos una persona administradora';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end $$;
create trigger editors_keep_one_admin before update or delete on public.editors for each row execute function public.keep_one_admin();

alter table public.editor_invites enable row level security;
create policy "admins manage invites" on public.editor_invites for all using (public.is_admin()) with check (public.is_admin());
create policy "admins read editors" on public.editors for select using (public.is_admin());
create policy "admins manage editors" on public.editors for all using (public.is_admin()) with check (public.is_admin());
