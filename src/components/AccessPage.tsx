"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { inviteEmail, isEmail, loadAccess, revoke, setRole, type AccessEntry, type Role } from "@/lib/accessAdmin";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { ConfirmDialog } from "./ConfirmDialog";
import { LogoMark, PlusIcon, TrashIcon } from "./icons";

const ROLE_LABEL: Record<Role, string> = { admin: "Administradora", editor: "Editora" };

/** The admin decides who may edit: invites an e-mail, and that person becomes an editor the first time she signs in. */
export function AccessPage() {
  const auth = useAuth();
  const [list, setList] = useState<AccessEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mail, setMail] = useState("");
  const [role, setNewRole] = useState<Role>("editor");
  const [busy, setBusy] = useState(false);
  const [toRemove, setToRemove] = useState<AccessEntry | null>(null);

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

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmail(mail)) return setError("Escribe un correo válido.");
    if (await run(() => inviteEmail(mail, role))) setMail("");
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

      <main className="mx-auto w-full min-w-0 max-w-[720px] space-y-5 p-4">
        <div className="anim-fade-up">
          <h2 className="text-xl font-bold tracking-tight sm:text-2xl">Accesos</h2>
          <p className="mt-1 max-w-xl text-sm text-muted">
            Quién puede modificar el horario. Escribe su correo: cuando entre en la app con él, ya podrá editar. Cualquier otra persona solo ve el horario.
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
                  <span className="text-xs text-muted">Correo</span>
                  <input type="email" required value={mail} onChange={(e) => setMail(e.target.value)} placeholder="nombre@correo.com" className="mt-0.5 w-full rounded-xl border border-line bg-card-solid px-3 py-2" />
                </label>
                <label>
                  <span className="text-xs text-muted">Puede</span>
                  <select value={role} onChange={(e) => setNewRole(e.target.value as Role)} className="mt-0.5 block rounded-xl border border-line bg-card-solid px-3 py-2">
                    <option value="editor">Editar el horario</option>
                    <option value="admin">Editar y dar accesos</option>
                  </select>
                </label>
                <button disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl bg-gradient-to-r from-brand to-brand-2 px-4 font-semibold text-white shadow transition active:scale-95 disabled:opacity-50">
                  <PlusIcon width={16} height={16} /> Invitar
                </button>
              </div>
              <p className="text-xs text-muted">No se envía ningún correo: avísale tú y que entre en la app con ese correo (le llegará su enlace de acceso).</p>
            </form>

            {error && <p role="alert" className="rounded-xl bg-red-500/10 px-3 py-2 text-sm font-semibold text-red-600">{error}</p>}

            <ul className="space-y-2" aria-label="Personas con acceso">
              {list?.map((a) => (
                <li key={`${a.status}|${a.email}`} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-card-solid/70 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{a.email}{a.email === auth.email ? " (tú)" : ""}</span>
                    <span className="text-xs text-muted">{a.status === "invited" ? "Invitada · todavía no ha entrado" : "Con acceso"}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <select
                      aria-label={`Permiso de ${a.email}`}
                      value={a.role}
                      disabled={busy}
                      onChange={(e) => void run(() => setRole(a, e.target.value as Role))}
                      className="rounded-lg border border-line bg-card-solid px-2 py-1.5 text-sm"
                    >
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <option key={r} value={r}>{ROLE_LABEL[r]}</option>
                      ))}
                    </select>
                    <button type="button" aria-label={`Quitar el acceso de ${a.email}`} disabled={busy} onClick={() => setToRemove(a)} className="grid h-9 w-9 place-items-center rounded-lg text-red-600 transition hover:bg-red-500/10 active:scale-95">
                      <TrashIcon width={16} height={16} />
                    </button>
                  </span>
                </li>
              ))}
              {list?.length === 0 && <li className="text-sm text-muted">Nadie todavía.</li>}
            </ul>
          </>
        )}
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
          <p>{toRemove.email} dejará de poder modificar el horario{toRemove.status === "invited" ? " (se cancela su invitación)" : ""}. Podrá seguir viéndolo.</p>
        </ConfirmDialog>
      )}
    </>
  );
}
