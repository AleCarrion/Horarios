-- Invitation LINKS: the admin picks a role (and the person of the team for workers), gets a link and sends it by WhatsApp.
-- Whoever opens it creates her own account and gets exactly that access. The link works once and expires.

alter table public.editor_invites drop constraint editor_invites_pkey;
alter table public.editor_invites add column id uuid not null default gen_random_uuid();
alter table public.editor_invites add primary key (id);
alter table public.editor_invites alter column email drop not null;
create unique index editor_invites_email_key on public.editor_invites (email) where email is not null;
alter table public.editor_invites add column code text not null unique default replace(gen_random_uuid()::text, '-', '');
alter table public.editor_invites add column expires_at timestamptz not null default now() + interval '14 days';

-- What an invitation says (for the sign-up page, before the person has an account). Reveals no e-mail.
create function public.invite_info(_code text) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object('role', i.role, 'staff_name', s.name)
  from public.editor_invites i left join public.staff s on s.id = i.staff_id
  where i.code = _code and i.expires_at > now() and i.role in ('editor','worker');
$$;

-- The person (already signed in) uses the link: she gets the access of the invitation and the link is used up.
-- Returns 'worker' / 'editor', 'invalid' (unknown, used or expired) or 'already' (she already had access: nothing changes).
create function public.redeem_invite(_code text) returns text
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  mail text := lower(coalesce(auth.jwt() ->> 'email', ''));
  inv public.editor_invites%rowtype;
begin
  if uid is null then return 'invalid'; end if;
  if exists (select 1 from public.editors where user_id = uid) then return 'already'; end if;
  select * into inv from public.editor_invites where code = _code and expires_at > now() and role in ('editor','worker');
  if not found then return 'invalid'; end if;
  insert into public.editors (user_id, email, role, staff_id) values (uid, mail, inv.role, inv.staff_id);
  delete from public.editor_invites where id = inv.id;
  return inv.role;
end $$;
