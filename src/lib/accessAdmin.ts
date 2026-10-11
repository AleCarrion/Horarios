import { getSupabase } from "./supabase";

export interface AccessEntry {
  email: string;
  role: "admin" | "editor";
  /** "member": already signed in and active · "invited": waiting for that person to sign in. */
  status: "member" | "invited";
  userId?: string;
}

export type Role = AccessEntry["role"];

export const normalizeEmail = (s: string) => s.trim().toLowerCase();
export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

/** Members first (admins before editors), then pending invitations, each alphabetically. */
export function sortAccess(list: AccessEntry[]): AccessEntry[] {
  const rank = (a: AccessEntry) => (a.status === "member" ? 0 : 1) * 2 + (a.role === "admin" ? 0 : 1);
  return [...list].sort((a, b) => rank(a) - rank(b) || a.email.localeCompare(b.email));
}

/** Friendly text for the errors the database can raise here. */
export function accessError(message: string): string {
  if (/al menos una persona administradora/i.test(message)) return "Tiene que quedar al menos una persona administradora.";
  if (/duplicate key|already exists/i.test(message)) return "Ese correo ya está invitado o ya tiene acceso.";
  if (/row-level security|permission denied/i.test(message)) return "Solo una persona administradora puede cambiar los accesos.";
  return `No se ha podido guardar (${message}).`;
}

export async function loadAccess(): Promise<{ ok: true; list: AccessEntry[] } | { ok: false; error: string }> {
  const sb = getSupabase();
  if (!sb) return { ok: false, error: "Supabase no está configurado." };
  const [members, invites] = await Promise.all([sb.from("editors").select("user_id, email, role"), sb.from("editor_invites").select("email, role")]);
  if (members.error || invites.error) return { ok: false, error: accessError((members.error ?? invites.error)!.message) };
  const list: AccessEntry[] = [
    ...(members.data ?? []).map((m) => ({ email: m.email ?? "(sin correo)", role: m.role as Role, status: "member" as const, userId: m.user_id as string })),
    ...(invites.data ?? []).map((i) => ({ email: i.email as string, role: i.role as Role, status: "invited" as const })),
  ];
  return { ok: true, list: sortAccess(list) };
}

export async function inviteEmail(email: string, role: Role): Promise<string | null> {
  const sb = getSupabase();
  const { error } = (await sb?.from("editor_invites").insert({ email: normalizeEmail(email), role })) ?? { error: { message: "Supabase no configurado" } };
  return error ? accessError(error.message) : null;
}

export async function revoke(entry: AccessEntry): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Supabase no configurado";
  const { error } = entry.status === "invited" ? await sb.from("editor_invites").delete().eq("email", entry.email) : await sb.from("editors").delete().eq("user_id", entry.userId!);
  return error ? accessError(error.message) : null;
}

export async function setRole(entry: AccessEntry, role: Role): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return "Supabase no configurado";
  const { error } = entry.status === "invited" ? await sb.from("editor_invites").update({ role }).eq("email", entry.email) : await sb.from("editors").update({ role }).eq("user_id", entry.userId!);
  return error ? accessError(error.message) : null;
}
