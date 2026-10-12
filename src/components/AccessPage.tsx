"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { createInvite, inviteUrl, isEmail, loadAccess, revoke, setRole, type AccessEntry, type Role } from "@/lib/accessAdmin";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useTeam } from "@/lib/useTeam";
import { ConfirmDialog } from "./ConfirmDialog";
import { LogoMark, PlusIcon, TrashIcon } from "./icons";

const ROLE_LABEL: Record<Role, string> = { admin: "Administradora", editor: "Editora", worker: "Trabajador" };

/** The admin decides who may edit: invites an e-mail, and that person becomes an editor the first time she signs in. */
export function AccessPage() {
  const auth = useAuth();
  const team = useTeam(auth);
  const [staffId, setStaffId] = useState("");
  const [list, setList] = useState<AccessEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mail, setMail] = useState("");
  const [role, setNewRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState<AccessEntry | null>(null);
  const [created, setCreated] = useState<{ url?: string; text: string } | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const r = await loadAccess();
    if (r.ok) setList(r.list);
    else setError(r.error);
  }, []);
  useEffect(() => {
    if (auth.isAdmin) void reload(); // eslint-disable-line react-hooks/set-state-in-effect
  }, [auth.isAdmin, reload]);

  const run = async (fn: () => Promise<string | null>) => {
    setBusy(true);
    setError(null);
    const err = await fn();
    setBusy(false);
    if (err) setError(err);
    await reload();
    return !err;
  };

  const origin = () => (typeof window === "undefined" ? "" : window.location.origin);
  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(inviteUrl(origin(), code));
      setCopied(code);
      setTimeout(() => setCopied((c) => (c === code ? null : c)), 2500);
    } catch {
      setError("No se ha podido copiar. Selecciona el enlace y cópialo a mano.");
    }
  };
  const share = async (url: string) => {
    try {
      await navigator.share({ title: "Horarios · Hotel Casa 1800", text: "Te invito a Horarios del Hotel Casa 1800. Crea tu cuenta aquí:", url });
    } catch {
      /* cancelled */
    }
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreated(null);
    if (role === "admin" && !isEmail(mail)) return setError("Para dar acceso de administradora hace falta su correo.");
    if (mail.trim() && !isEmail(mail)) return setError("Ese correo no parece válido (o déjalo vacío para invitar solo con el enlace).");
    if (role === "worker" && !staffId) return setError("Elige a qué persona del equipo corresponde este trabajador.");
    setBusy(true);
    setError(null);
    const r = await createInvite({ email: mail, role, staffId });
    setBusy(false);
    if (r.error) setError(r.error);
    else if (role === "admin") setCreated({ text: `Cuando ${mail.trim()} entre en la app con ese correo, será administradora.` });
    else setCreated({ url: inviteUrl(origin(), r.code!), text: mail.trim() ? `Puede entrar con ${mail.trim()} o abriendo este enlace.` : "Mándale este enlace: al abrirlo crea su cuenta y ya tiene acceso." });
    if (!r.error) {
      setMail("");
      setStaffId("");
    }
    await reload();
  };

  return (
    <>
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-[1200px] items-center gap-3 px-4 py-3">
          <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 shadow-lg shadow-brand/30">
            <LogoMark />
          </span>
          <div className="leading-tight">
            <h1 className="text-lg font-bold tracking-tight">Horarios</h1>
            <p className="text-xs text-muted">Hotel Casa 1800</p>
          </div>
          <Link href="/" className="ml-auto rounded-xl border border-line px-3 py-1.5 text-sm font-semibold transition hover:bg-brand/10">← Volver al horario</Link>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1200px] p-4">
        {/* left edge in line with the header */}
        <div className="max-w-[720px] space-y-5">
        <div className="anim-fade-up">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Accesos</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Quién puede hacer qué. Escribe el correo y elige el permiso: editora (cambia el horario), administradora (además da accesos) o trabajador (ve el horario y envía sus propias peticiones). Cuando esa persona entre con ese correo, tendrá ese permiso.
          </p>
        </div>

        {!remoteConfigured ? (
          <p className="glass rounded-2xl p-5 text-sm">Esta pantalla solo se usa cuando la app está conectada a Supabase. Ahora mismo funciona en modo local.</p>
        ) : !auth.ready ? (
          <p className="text-sm text-muted">Cargando…</p>
        ) : !auth.email ? (
          <p className="glass rounded-2xl p-5 text-sm"><Link href="/entrar" className="font-semibold text-brand underline">Entra con tu correo</Link> para gestionar los accesos.</p>
        ) : !auth.isAdmin ? (
          <p className="glass rounded-2xl p-5 text-sm">Solo la persona administradora puede cambiar los accesos. {auth.isEditor ? "Tú puedes editar el horario, pero no invitar a nadie." : "Ahora mismo tu cuenta solo puede ver el horario."}</p>
        ) : (
          <>
            <form onSubmit={add} className="space-y-3 rounded-2xl border border-line bg-card-solid/70 p-4">
              <h3 className="font-semibold">Dar acceso a otra persona</h3>
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-0 flex-1 basis-56">
                  <span className="text-xs text-muted">Correo {role === "admin" ? "" : "(opcional)"}</span>
                  <input type="email" value={mail} onChange={(e) => setMail(e.target.value)} placeholder="nombre@correo.com" className="mt-0.5 w-full rounded-xl border border-line bg-card-solid px-3 py-2" />
                </label>
                <label>
                  <span className="text-xs text-muted">Puede</span>
                  <select value={role} onChange={(e) => setNewRole(e.target.value as Role)} className="mt-0.5 block rounded-xl border border-line bg-card-solid px-3 py-2">
                    <option value="editor">Editar el horario</option>
                    <option value="admin">Editar y dar accesos</option>
                    <option value="worker">Solo ver y enviar peticiones (trabajador)</option>
                  </select>
                </label>
                {role === "worker" && (
                  <label className="basis-full sm:basis-auto">
                    <span className="text-xs text-muted">¿Quién es?</span>
                    <select required value={staffId} onChange={(e) => setStaffId(e.target.value)} className="mt-0.5 block w-full rounded-xl border border-line bg-card-solid px-3 py-2">
                      <option value="">elegir persona…</option>
                      {team.staff.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </label>
                )}
                <button disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand-solid to-brand-2-solid px-4 font-semibold text-white shadow transition active:scale-95 disabled:opacity-50">
                  <PlusIcon width={16} height={16} /> Crear invitación
                </button>
              </div>
              <p className="text-xs text-muted">
                No se envía ningún correo. Se crea un <b>enlace de invitación</b> que le mandas tú (WhatsApp, por ejemplo): al abrirlo, la persona crea su propia cuenta y recibe el permiso elegido. Sirve una vez y caduca a los 14 días. Si pones su correo, también puede entrar directamente con él.
              </p>
            </form>

            {created && (
              <div role="status" className="space-y-2 rounded-2xl border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm">
                <p className="font-semibold text-emerald-700 dark:text-emerald-300">Invitación creada</p>
                <p>{created.text}</p>
                {created.url && (
                  <>
                    <input readOnly value={created.url} onFocus={(e) => e.currentTarget.select()} aria-label="Enlace de invitación" className="w-full rounded-lg border border-line bg-card-solid px-3 py-2 text-xs" />
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => void copy(new URL(created.url!).searchParams.get("c") ?? "")} className="rounded-lg bg-brand-solid px-3 py-1.5 font-semibold text-white shadow active:scale-95">
                        {copied === new URL(created.url).searchParams.get("c") ? "¡Copiado!" : "Copiar enlace"}
                      </button>
                      {typeof navigator !== "undefined" && "share" in navigator && (
                        <button type="button" onClick={() => void share(created.url!)} className="rounded-lg border border-line px-3 py-1.5 font-semibold active:scale-95">Compartir…</button>
                      )}
                    </div>
                  </>
                )}
              </div>
            )}

            {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

            <ul className="space-y-2" aria-label="Personas con acceso">
              {list?.map((a) => (
                <li key={`${a.status}|${a.email}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card-solid/70 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{a.email || "Invitación por enlace"}{a.email && a.email === auth.email ? " (tú)" : ""}</span>
                    <span className="text-xs text-muted">
                      {a.status === "invited" ? "Invitada · todavía no ha entrado" : "Con acceso"}
                      {a.role === "worker" && a.staffId ? ` · es ${team.staff.find((s) => s.id === a.staffId)?.name ?? a.staffId}` : ""}
                    </span>
                  </span>
                  <span className="flex items-center gap-2">
                    {a.status === "invited" && a.code && a.role !== "admin" && (
                      <button type="button" onClick={() => void copy(a.code!)} className="rounded-lg border border-line px-2.5 py-1.5 text-xs font-semibold text-brand transition hover:bg-brand/10 active:scale-95">
                        {copied === a.code ? "¡Copiado!" : "Copiar enlace"}
                      </button>
                    )}
                    <select
                      aria-label={`Permiso de ${a.email || "la invitación"}`}
                      value={a.role}
                      disabled={busy}
                      onChange={(e) => {
                        const next = e.target.value as Role;
                        if (next === "worker" && !a.staffId) return setError("Para pasarla a trabajador, quita el acceso y vuelve a invitarla eligiendo a qué persona del equipo corresponde.");
                        void run(() => setRole(a, next));
                      }}
                      className="rounded-lg border border-line bg-card-solid px-2 py-1.5 text-sm"
                    >
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                    <button type="button" aria-label={`Quitar el acceso de ${a.email || "la invitación"}`} disabled={busy} onClick={() => setToRemove(a)} className="grid h-9 w-9 place-items-center rounded-lg text-red-600 transition hover:bg-red-500/10 active:scale-95">
                      <TrashIcon width={16} height={16} />
                    </button>
                  </span>
                </li>
              ))}
              {list?.length === 0 && <li className="text-sm text-muted">Nadie todavía.</li>}
            </ul>
          </>
        )}
        </div>
      </main>

      {toRemove && (
        <ConfirmDialog
          title="¿Quitar el acceso?"
          confirmLabel="Sí, quitar"
          onCancel={() => setToRemove(null)}
          onConfirm={() => {
            const a = toRemove;
            setToRemove(null);
            void run(() => revoke(a));
          }}
        >
          <p>{toRemove.email || "Esta invitación"} dejará de poder modificar el horario{toRemove.status === "invited" ? " (se cancela su invitación y el enlace deja de funcionar)" : ""}. Podrá seguir viéndolo.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
