"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getSupabase, remoteConfigured } from "@/lib/supabase";
import { setInviteCode } from "@/lib/session";
import { useAuth } from "@/lib/useAuth";
import { Splash } from "./AuthGate";
import { LoginForm } from "./LoginForm";
import { LogoMark } from "./icons";

type Info = { role: "editor" | "worker"; staff_name: string | null };

/** Opened from an invitation link: the person creates her own account and gets the access she was invited with. */
export function InvitePage() {
  const auth = useAuth();
  const router = useRouter();
  const [state, setState] = useState<"loading" | "invalid" | { info: Info }>("loading");

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("c");
    const sb = getSupabase();
    if (!code || !sb) return setState("invalid"); // eslint-disable-line react-hooks/set-state-in-effect
    void sb.rpc("invite_info", { _code: code }).then(({ data, error }) => {
      if (error || !data) return setState("invalid");
      setInviteCode(code); // kept until the account exists, even if she has to confirm her e-mail first
      setState({ info: data as Info });
    });
  }, []);

  const gotAccess = auth.ready && Boolean(auth.email) && (auth.isWorker || auth.isEditor);
  useEffect(() => {
    if (gotAccess) router.replace("/");
  }, [gotAccess, router]);

  if (!remoteConfigured) return <Splash />;
  if (state === "loading" || gotAccess || !auth.ready) return <Splash />;

  const role = state !== "invalid" ? (state.info.role === "worker" ? "trabajador" : "editora") : "";
  const who = state !== "invalid" && state.info.staff_name ? ` (${state.info.staff_name})` : "";

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="anim-fade-up w-full space-y-6">
        <div className="text-center">
          <span className="mx-auto grid h-24 w-24 place-items-center rounded-[1.75rem] bg-white shadow-xl shadow-[#a18354]/25 ring-1 ring-[#a18354]/30">
            <LogoMark width={84} className="!text-[#a18354]" />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Horarios</h1>
          <p className="text-sm text-muted">Hotel Casa 1800</p>
        </div>

        {state === "invalid" ? (
          <div className="glass space-y-3 rounded-3xl p-6 text-center">
            <h2 className="text-lg font-bold">Esta invitación ya no vale</h2>
            <p className="text-sm text-muted">Puede que ya se haya usado o que haya caducado. Pide a la jefa que te envíe una nueva.</p>
            <Link href="/entrar" className="inline-block rounded-xl bg-brand px-4 py-2 font-semibold text-white shadow">Entrar con mi cuenta</Link>
          </div>
        ) : auth.email ? (
          <div className="glass space-y-3 rounded-3xl p-6 text-center">
            <h2 className="text-lg font-bold">Casi está</h2>
            <p className="text-sm text-muted">Estás dentro como {auth.email}, pero esta invitación no se ha podido usar (quizá ya la usaste, o esa cuenta ya tenía acceso).</p>
            <Link href="/" className="inline-block rounded-xl bg-brand px-4 py-2 font-semibold text-white shadow">Ir al horario</Link>
          </div>
        ) : (
          <>
            <div className="glass rounded-3xl p-5 text-center sm:p-6">
              <p className="text-sm text-muted">Te han invitado como</p>
              <p className="text-lg font-bold">{role}{who}</p>
              <p className="mt-1 text-sm text-muted">
                {state.info.role === "worker" ? "Podrás ver el horario y enviar tus peticiones." : "Podrás ver y editar el horario."} Crea tu cuenta con tu correo y una contraseña.
              </p>
            </div>
            <div className="glass rounded-3xl p-5 sm:p-6">
              <LoginForm auth={auth} initialMode="signup" />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
