import { getSupabase } from "./supabase";

export interface AccessEntry {
  email: string;
  role: "admin" | "editor" | "worker";
  /** Workers: the person of the team they are. */
  staffId?: string;
  /** "member": already signed in and active · "invited": waiting for that person to sign in. */
  status: "member" | "invited";
  userId?: string;
  /** Invitations: id of the row and the secret code of the link. */
  inviteId?: string;
  code?: string;
}

export type Role = AccessEntry["role"];

export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

/** Members first (admins before editors), then pending invitations, each alphabetically. */
export function sortAccess(list: AccessEntry[]): AccessEntry[] {
  const rank = (a: AccessEntry) => (a.status === "member" ? 0 : 1) * 3 + { admin: 0, editor: 1, worker: 2 }[a.role];
  return [...list].sort((a, b) => rank(a) - rank(b) || a.email.localeCompare(b.email));
}

/** Friendly text for the errors the database can raise here. */
export function accessError(message: string): string {
  if (/al menos una persona administradora/i.test(message)) return "Tiene que quedar al menos una persona administradora.";
  if (/duplicate key|already exists/i.test(message)) return "Ese correo ya está invitado o ya tiene acceso.";
  if (/worker_has_staff|workers?_has_staff/i.test(message)) return "Un trabajador tiene que estar vinculado a una persona del equipo.";
  if (/row-level security|permission denied/i.test(message)) return "Solo una persona administradora puede cambiar los accesos.";
  return `No se ha podido guardar (${message}).`;
}

export async function loadAccess(): Promise<{ ok: true; list: AccessEntry[] } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase no está configurado." };
  const [members, invites] = await Promise.all([sb.from("editors").select("user_id, email, role, staff_id"), sb.from("editor_invites").select("id, email, role, staff_id, code")]);
  if (members.error || invites.error) return { ok: false, error: accessError((members.error ?? invites.error)!.message) };
  const list: AccessEntry[] = [
    ...(members.data ?? []).map((m) => ({ email: m.email ?? "(sin correo)", role: m.role as Role, staffId: (m.staff_id as string | null) ?? undefined, status: "member" as const, userId: m.user_id as string })),
    ...(invites.data ?? []).map((i) => ({ email: (i.email as string | null) ?? "", inviteId: i.id as string, code: i.code as string, role: i.role as Role, staffId: (i.staff_id as string | null) ?? undefined, status: "invited" as const })),
  ];
  return { ok: true, list: sortAccess(list) };
}

/** Creates an invitation (the e-mail is optional: without it, anyone with the link can use it once). Returns the code of the link. */
export async function createInvite(opts: { email?: string; role: Role; staffId?: string }): Promise<{ error: string | null; code?: string }> {
  const sb = getSupabase();
  if (!sb) return { error: "Supabase no configurado" };
  const { data, error } = await sb
    .from("editor_invites")
    .insert({ email: opts.email?.trim() ? normalizeEmail(opts.email) : null, role: opts.role, staff_id: opts.role === "worker" ? opts.staffId : null })
    .select("code")
    .single();
  return error ? { error: accessError(error.message) } : { error: null, code: data.code as string };
}

/** The link to send: opens the page where the person creates her account. */
export const inviteUrl = (origin: string, code: string) => `${origin.replace(/\/$/, "")}/invitacion?c=${encodeURIComponent(code)}`;

export async function revoke(entry: AccessEntry): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Supabase no configurado";
  const { error } = entry.status === "invited" ? await sb.from("editor_invites").delete().eq("id", entry.inviteId!) : await sb.from("editors").delete().eq("user_id", entry.userId!);
  return error ? accessError(error.message) : null;
}

export async function setRole(entry: AccessEntry, role: Role, staffId?: string): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Supabase no configurado";
  const patch = { role, staff_id: role === "worker" ? (staffId ?? entry.staffId ?? null) : null };
  const { error } = entry.status === "invited" ? await sb.from("editor_invites").update(patch).eq("id", entry.inviteId!) : await sb.from("editors").update(patch).eq("user_id", entry.userId!);
  return error ? accessError(error.message) : null;
}
