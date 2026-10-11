"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { cooldownLeft, friendlyAuthError, passwordProblem } from "@/lib/loginGuard";
import type { AuthState } from "@/lib/useAuth";

export type SyncStatus = "local" | "synced" | "pending" | "readonly" | "draft";

const LABEL: Record<SyncStatus, string> = {
  local: "Modo local (sin Supabase)",
  synced: "Sincronizado",
  pending: "Cambios pendientes de enviar",
  readonly: "Solo lectura",
  draft: "Borrador sin publicar",
};

type Mode = "login" | "signup" | "reset" | "link";

const input = "min-w-0 rounded-xl border border-line bg-card-solid/60 px-3 py-1.5";
const linkBtn = "text-xs font-semibold text-brand underline-offset-2 hover:underline";

export function AuthBar({ auth, status }: { auth: AuthState; status: SyncStatus }) {
  const [mode, setMode] = useState<Mode>("login");
  const [mail, setMail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [msg, setMsg] = useState<{ text: string; bad: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (sentAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [sentAt]);
  const wait = cooldownLeft(sentAt, now);
  const emailMode = mode === "reset" || mode === "link";

  const fail = (text: string) => setMsg({ text: friendlyAuthError(text), bad: true });
  const ok = (text: string) => setMsg({ text, bad: false });
  const sentEmail = () => {
    setSentAt(Date.now());
    setNow(Date.now());
  };
  const go = (m: Mode) => {
    setMode(m);
    setMsg(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || (emailMode && wait > 0)) return;
    setMsg(null);
    setBusy(true);
    try {
      if (mode === "login") {
        const err = await auth.signInPassword(mail.trim(), password);
        if (err) fail(err);
      } else if (mode === "signup") {
        const problem = passwordProblem(password);
        if (problem) return setMsg({ text: problem, bad: true });
        const r = await auth.signUp(mail.trim(), password);
        if (r.error) fail(r.error);
        else if (r.needsConfirm) {
          ok("Cuenta creada. Te hemos enviado un correo: pulsa el enlace para confirmarla y luego entra con tu contraseña.");
          sentEmail();
        }
      } else if (mode === "reset") {
        const err = await auth.resetPassword(mail.trim());
        if (err) fail(err);
        else {
          ok("Si ese correo tiene cuenta, te llegará un enlace para elegir una contraseña nueva.");
          sentEmail();
        }
      } else {
        const err = await auth.signIn(mail.trim());
        if (err) fail(err);
        else {
          ok("Te hemos enviado un enlace de acceso al correo.");
          sentEmail();
        }
      }
    } finally {
      setBusy(false);
    }
  };

  const saveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const problem = passwordProblem(newPassword);
    if (problem) return setMsg({ text: problem, bad: true });
    const err = await auth.setPassword(newPassword);
    if (err) fail(err);
    else {
      setNewPassword("");
      ok("Contraseña cambiada.");
    }
  };

  const message = msg && (
    <span role={msg.bad ? "alert" : "status"} aria-live="polite" className={`basis-full text-xs font-semibold ${msg.bad ? "text-red-600" : "text-emerald-600"}`}>
      {msg.text}
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
      <span className="glass rounded-full px-3 py-1 font-medium" role="status">
        {LABEL[status]}
      </span>
      {status !== "local" &&
        (auth.recovery ? (
          <form className="flex flex-wrap items-center gap-2" onSubmit={saveNewPassword}>
            <label className="sr-only" htmlFor="new-password">Contraseña nueva</label>
            <input id="new-password" type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Elige tu contraseña nueva" className={input} />
            <button className="rounded-xl bg-brand px-3 py-1.5 font-semibold text-white">Guardar contraseña</button>
            {message}
          </form>
        ) : auth.email ? (
          <>
            <span>{auth.email}{auth.isAdmin ? " · administradora" : auth.isEditor ? " · editora" : ""}</span>
            {auth.isAdmin && <Link href="/acceso" className="font-semibold text-brand underline-offset-2 hover:underline">Accesos</Link>}
            <button className="underline" onClick={() => void auth.signOut()}>Salir</button>
            {message}
          </>
        ) : (
          <form className="flex flex-wrap items-center gap-2" onSubmit={submit}>
            <label className="sr-only" htmlFor="login-mail">Correo</label>
            <input id="login-mail" type="email" autoComplete="email" required value={mail} onChange={(e) => setMail(e.target.value)} placeholder="correo" className={input} />
            {!emailMode && (
              <>
                <label className="sr-only" htmlFor="login-password">Contraseña</label>
                <input
                  id="login-password"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === "signup" ? "elige una contraseña" : "contraseña"}
                  className={input}
                />
              </>
            )}
            <button disabled={busy || (emailMode && wait > 0)} className="rounded-xl bg-brand px-3 py-1.5 font-semibold text-white transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-50">
              {emailMode && wait > 0 ? `Espera ${wait} s` : { login: "Entrar", signup: "Crear cuenta", reset: "Enviar enlace", link: "Enviar enlace" }[mode]}
            </button>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {mode === "login" ? (
                <>
                  <button type="button" className={linkBtn} onClick={() => go("signup")}>Crear cuenta</button>
                  <button type="button" className={linkBtn} onClick={() => go("reset")}>He olvidado la contraseña</button>
                  <button type="button" className={linkBtn} onClick={() => go("link")}>Entrar con enlace</button>
                </>
              ) : (
                <button type="button" className={linkBtn} onClick={() => go("login")}>← Ya tengo cuenta</button>
              )}
            </span>
            {message}
          </form>
        ))}
    </div>
  );
}
