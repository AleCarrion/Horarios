"use client";

import { useState } from "react";
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

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
      <span className="rounded-full bg-brand/10 px-3 py-1 font-medium" role="status">
        {LABEL[status]}
      </span>
      {status !== "local" &&
        (auth.email ? (
          <>
            <span>{auth.email}{auth.isEditor ? " · editora" : ""}</span>
            <button className="underline" onClick={() => void auth.signOut()}>Salir</button>
          </>
        ) : (
          <form
            className="flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const err = await auth.signIn(mail);
              setMsg(err ?? "Te hemos enviado un enlace de acceso al correo.");
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
              className="rounded-lg border border-brand/30 bg-transparent px-2 py-1"
            />
            <button className="rounded-lg border border-brand/30 px-3 py-1 font-medium hover:bg-brand/10">Entrar</button>
            {msg && <span aria-live="polite">{msg}</span>}
          </form>
        ))}
    </div>
  );
}
