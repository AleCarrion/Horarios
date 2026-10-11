"use client";

import { useEffect, useState } from "react";
import { cooldownLeft, friendlyAuthError, passwordProblem } from "@/lib/loginGuard";
import { enabledProviders, PROVIDER_LABEL, type OAuthProvider } from "@/lib/oauth";
import type { AuthState } from "@/lib/useAuth";

export type Mode = "login" | "signup" | "reset" | "link";

const input = "w-full min-w-0 rounded-xl border border-line bg-card-solid px-3 py-2.5 text-base";
const linkBtn = "text-sm font-semibold text-brand underline-offset-2 hover:underline";

/** E-mail + password form (sign in, create account, forgot password, sign-in link) and the "choose a new password" step. */
export function LoginForm({ auth, initialMode = "login" }: { auth: AuthState; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);
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
    <p role={msg.bad ? "alert" : "status"} aria-live="polite" className={`text-sm font-semibold ${msg.bad ? "text-red-600" : "text-emerald-600"}`}>
      {msg.text}
    </p>
  );
  const primary = "w-full rounded-xl bg-gradient-to-r from-brand to-brand-2 px-4 py-3 text-base font-semibold text-white shadow transition hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-50";

  if (auth.recovery)
    return (
      <form className="space-y-3" onSubmit={saveNewPassword}>
        <h2 className="text-lg font-bold">Elige tu contraseña nueva</h2>
        <label className="sr-only" htmlFor="new-password">Contraseña nueva</label>
        <input id="new-password" type="password" autoComplete="new-password" required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Contraseña nueva" className={input} />
        <button className={primary}>Guardar contraseña</button>
        {message}
      </form>
    );

  const providers = enabledProviders();
  const social = async (p: OAuthProvider) => {
    setMsg(null);
    const err = await auth.signInOAuth(p);
    if (err) fail(err);
  };
  const GoogleMark = () => (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.2 5.5-4.7 7.2l7.6 5.9c4.4-4.1 6.9-10.1 6.9-17.6z"/><path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"/></svg>
  );
  const AppleMark = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.4 12.6c0-2.5 2-3.6 2.1-3.7-1.2-1.7-3-1.9-3.6-2-1.5-.2-3 .9-3.8.9-.8 0-2-.9-3.3-.8-1.7 0-3.3 1-4.2 2.5-1.8 3.1-.5 7.7 1.3 10.2.9 1.2 1.9 2.6 3.2 2.5 1.3-.1 1.8-.8 3.3-.8s2 .8 3.3.8c1.4 0 2.3-1.2 3.1-2.5 1-1.4 1.4-2.8 1.4-2.9-.1 0-2.8-1.1-2.8-4.2zM13.9 5c.7-.9 1.2-2.1 1-3.3-1 0-2.3.7-3 1.6-.7.8-1.2 2-1.1 3.2 1.2.1 2.4-.6 3.1-1.5z"/></svg>
  );
  const title = { login: "Entrar", signup: "Crear cuenta", reset: "Recuperar la contraseña", link: "Entrar con un enlace" }[mode];
  const hint = {
    login: "Con tu correo y tu contraseña.",
    signup: "Elige tu correo y una contraseña. Después, la administradora decide qué puedes hacer.",
    reset: "Te enviaremos un correo para elegir una contraseña nueva.",
    link: "Te enviaremos un enlace al correo; al abrirlo, entras sin contraseña.",
  }[mode];

  return (
    <form className="space-y-3" onSubmit={submit}>
      <div>
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted">{hint}</p>
      </div>
      <label className="sr-only" htmlFor="login-mail">Correo</label>
      <input id="login-mail" type="email" autoComplete="email" required value={mail} onChange={(e) => setMail(e.target.value)} placeholder="Correo" className={input} />
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
            placeholder={mode === "signup" ? "Contraseña (8+, letras y números)" : "Contraseña"}
            className={input}
          />
        </>
      )}
      <button disabled={busy || (emailMode && wait > 0)} className={primary}>
        {emailMode && wait > 0 ? `Espera ${wait} s` : { login: "Entrar", signup: "Crear cuenta", reset: "Enviar correo", link: "Enviar enlace" }[mode]}
      </button>
      {message}
      {providers.length > 0 && (mode === "login" || mode === "signup") && (
        <div className="space-y-2 pt-1">
          <p className="flex items-center gap-3 text-xs text-muted before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">o</p>
          {providers.map((p) => (
            <button key={p} type="button" onClick={() => void social(p)} className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-line bg-card-solid px-4 py-3 text-base font-semibold transition hover:-translate-y-0.5 hover:shadow-md active:scale-[0.99]">
              {p === "google" ? <GoogleMark /> : <AppleMark />}
              Continuar con {PROVIDER_LABEL[p]}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-1">
        {mode === "login" ? (
          <>
            <button type="button" className={linkBtn} onClick={() => go("signup")}>Crear cuenta</button>
            <button type="button" className={linkBtn} onClick={() => go("reset")}>He olvidado la contraseña</button>
            <button type="button" className={linkBtn} onClick={() => go("link")}>Entrar con enlace</button>
          </>
        ) : (
          <button type="button" className={linkBtn} onClick={() => go("login")}>← Ya tengo cuenta</button>
        )}
      </div>
    </form>
  );
}
