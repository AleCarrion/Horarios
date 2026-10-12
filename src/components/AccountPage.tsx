"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { passwordProblem, friendlyAuthError } from "@/lib/loginGuard";
import { remoteConfigured } from "@/lib/supabase";
import { SYNC_DOT, SYNC_LABEL, type SyncStatus } from "@/lib/syncStatus";
import { useAuth } from "@/lib/useAuth";
import { readQueue } from "@/lib/useRemoteSchedule";
import { AccountChip } from "./AccountChip";
import { AppNav } from "./AppNav";
import { LogoMark } from "./icons";
import { MobileTabBar } from "./MobileTabBar";
import { readRequests } from "@/lib/requestsStore";

/** Who is signed in, what they can do, and sign out / change password. */
export function AccountPage() {
  const auth = useAuth();
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [pending, setPending] = useState(0);
  const [queued, setQueued] = useState(0);
  useEffect(() => {
    setPending(readRequests().filter((r) => r.status === "pending").length); // eslint-disable-line react-hooks/set-state-in-effect
    setQueued(readQueue().length);
  }, []);

  const role = auth.isAdmin ? "Administradora" : auth.isEditor ? "Editora" : auth.isWorker ? "Trabajador" : "Solo lectura";
  const what = auth.isAdmin
    ? "Puede editar el horario y dar acceso a otras personas."
    : auth.isEditor
      ? "Puede editar el horario."
      : auth.isWorker
        ? "Ve el horario y envía sus propias peticiones (libres, vacaciones, turnos y cambios)."
        : "Puede ver el horario, pero no modificarlo.";
  const status: SyncStatus = !remoteConfigured ? "local" : !auth.isEditor ? "readonly" : queued > 0 ? "pending" : "synced";

  const change = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(pw);
    if (problem) return setMsg({ text: problem, bad: true });
    const err = await auth.setPassword(pw);
    if (err) setMsg({ text: friendlyAuthError(err), bad: true });
    else {
      setPw("");
      setMsg({ text: "Contraseña cambiada.", bad: false });
    }
  };
  const signOut = async () => {
    await auth.signOut();
    router.replace("/entrar");
  };

  return (
    <>
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 shadow-lg shadow-brand/30 sm:h-11 sm:w-11">
              <LogoMark />
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight">Horarios</h1>
              <p className="text-xs text-muted">Hotel Casa 1800</p>
            </div>
          </div>
          <div className="max-sm:hidden"><AppNav /></div>
          {remoteConfigured && auth.email && <div className="ml-auto"><AccountChip auth={auth} status="synced" /></div>}
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1200px] p-4">
        {/* left edge in line with the header */}
        <div className="max-w-[560px] space-y-5">
        <h2 className="anim-fade-up text-xl font-bold tracking-tight sm:text-2xl">Mi cuenta</h2>

        {!remoteConfigured ? (
          <p className="glass rounded-2xl p-5 text-sm">La aplicación funciona ahora en modo local: los datos se guardan en este dispositivo y no hace falta iniciar sesión.</p>
        ) : !auth.email ? (
          <div className="glass space-y-3 rounded-2xl p-5 text-sm">
            <p>Estás viendo el horario sin haber entrado.</p>
            <Link href="/entrar" className="inline-block rounded-xl bg-brand-solid px-4 py-2 font-semibold text-white shadow">Entrar</Link>
          </div>
        ) : (
          <>
            <section className="glass anim-fade-up flex items-center gap-4 rounded-3xl p-5">
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-gradient-to-br from-brand-solid to-brand-2-solid text-2xl font-bold uppercase text-white shadow-lg shadow-brand/30">{auth.email[0]}</span>
              <div className="min-w-0">
                <p className="truncate text-lg font-bold">{auth.email}</p>
                <p className="font-semibold text-brand">{role}</p>
                <p className="text-sm text-muted">{what}</p>
              </div>
            </section>

            <section aria-label="Estado" className="glass anim-fade-up flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl px-4 py-3 text-sm">
              <span className={`h-2.5 w-2.5 rounded-full ${SYNC_DOT[status]}`} aria-hidden="true" />
              <span className="font-semibold">{SYNC_LABEL[status]}</span>
              {queued > 0 && <span className="text-muted">{queued} cambio{queued === 1 ? "" : "s"} esperando a enviarse</span>}
              {pending > 0 && <span className="text-muted">· {pending} solicitud{pending === 1 ? "" : "es"} pendiente{pending === 1 ? "" : "s"}</span>}
            </section>

            {auth.isAdmin && (
              <Link href="/acceso" className="glass anim-fade-up block rounded-2xl px-4 py-3 font-semibold transition hover:-translate-y-0.5 hover:shadow-md">
                Gestionar accesos
                <span className="block text-sm font-normal text-muted">Invitar a otras personas o quitar permisos.</span>
              </Link>
            )}

            <Link href="/ayuda" className="glass anim-fade-up block rounded-2xl px-4 py-3 font-semibold transition hover:-translate-y-0.5 hover:shadow-md">
              Ayuda
              <span className="block text-sm font-normal text-muted">Cómo usar la aplicación, en una hoja.</span>
            </Link>

            <form onSubmit={change} className="glass anim-fade-up space-y-3 rounded-2xl p-4">
              <h3 className="font-semibold">Cambiar la contraseña</h3>
              <label className="sr-only" htmlFor="acc-pw">Contraseña nueva</label>
              <input id="acc-pw" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Contraseña nueva (8 o más, con letras y números)" className="w-full rounded-xl border border-line bg-card-solid px-3 py-2.5" />
              <button className="rounded-xl bg-brand-solid px-4 py-2 font-semibold text-white shadow transition active:scale-95">Guardar</button>
              {msg && <p role={msg.bad ? "alert" : "status"} className={`text-sm font-semibold ${msg.bad ? "text-red-600" : "text-emerald-600"}`}>{msg.text}</p>}
            </form>

            <button type="button" onClick={() => void signOut()} className="w-full rounded-2xl border border-red-500/40 px-4 py-3 font-semibold text-red-600 transition hover:bg-red-500/10 active:scale-[0.99]">
              Cerrar sesión
            </button>
          </>
        )}
        </div>
      </main>
      <MobileTabBar pending={pending} />
    </>
  );
}
