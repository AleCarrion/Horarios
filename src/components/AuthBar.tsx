"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cooldownLeft, friendlyAuthError } from "@/lib/loginGuard";
import type { AuthState } from "@/lib/useAuth";

export type SyncStatus = "local" | "synced" | "pending" | "readonly" | "draft";

const LABEL: Record<SyncStatus, string> = {
  local: "Modo local (sin Supabase)",
  synced: "Sincronizado",
  pending: "Cambios pendientes de enviar",
  readonly: "Solo lectura",
  draft: "Borrador sin publicar",
};

export function AuthBar({ auth, status }: { auth: AuthState; status: SyncStatus }) {
  const [mail, setMail] = useState("");
  const [msg, setMsg] = useState("");
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sentAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt]);
  const wait = cooldownLeft(sentAt, now);

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
      <span className="glass rounded-full px-3 py-1 font-medium" role="status">
        {LABEL[status]}
      </span>
      {status !== "local" &&
        (auth.email ? (
          <>
            <span>{auth.email}{auth.isAdmin ? " · administradora" : auth.isEditor ? " · editora" : ""}</span>
            {auth.isAdmin && <Link href="/acceso" className="font-semibold text-brand underline-offset-2 hover:underline">Accesos</Link>}
            <button className="underline" onClick={() => void auth.signOut()}>Salir</button>
          </>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (wait > 0) return;
              const err = await auth.signIn(mail);
              setMsg(err ? friendlyAuthError(err) : "Te hemos enviado un enlace de acceso al correo.");
              if (!err) {
                setSentAt(Date.now());
                setNow(Date.now());
              }
            }}
          >
            <label className="sr-only" htmlFor="login-mail">Correo</label>
            <input
              id="login-mail"
              type="email"
              required
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              placeholder="correo de la jefa"
              className="rounded-xl border border-line bg-card-solid/60 px-3 py-1.5"
            />
            <button disabled={wait > 0} className="rounded-xl bg-brand px-3 py-1.5 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50">{wait > 0 ? `Espera ${wait} s` : "Entrar"}</button>
            {msg && <span aria-live="polite">{msg}</span>}
          </form>
        ))}
    </div>
  );
}
