"use client";

import { useEffect, useState } from "react";
import { cooldownLeft, friendlyAuthError, passwordProblem } from "@/lib/loginGuard";
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
  const primary = "w-full rounded-xl bg-gradient-to-r from-brand-solid to-brand-2-solid px-4 py-3 text-base font-semibold text-white shadow transition hover:-translate-y-0.5 active:scale-[0.99] disabled:opacity-50";

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
