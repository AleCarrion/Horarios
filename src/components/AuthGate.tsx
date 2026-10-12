"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { LogoMark } from "./icons";

export function Splash() {
  return (
    <main className="grid min-h-[70vh] place-items-center" aria-busy="true">
      <span className="grid h-16 w-16 animate-pulse place-items-center rounded-2xl bg-white shadow-lg shadow-[#a18354]/25 ring-1 ring-[#a18354]/30">
        <LogoMark width={42} className="!text-[#a18354]" />
      </span>
    </main>
  );
}

/** Screen for a signed-in person whose e-mail has not been given access by the admin. */
function NoAccess({ email, onSignOut }: { email: string; onSignOut: () => void }) {
  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center p-4">
      <div className="glass anim-fade-up w-full space-y-3 rounded-3xl p-6 text-center">
        <h1 className="text-xl font-bold">Todavía no tienes acceso</h1>
        <p className="text-sm text-muted">
          Has entrado como <strong className="text-foreground">{email}</strong>, pero ese correo no está dado de alta en el hotel.
          Pide a la jefa que te envíe una invitación y ábrela desde este mismo dispositivo.
        </p>
        <button onClick={onSignOut} className="rounded-xl bg-brand-solid px-4 py-2 font-semibold text-white shadow">Salir</button>
      </div>
    </main>
  );
}

/**
 * With Supabase connected, everything needs an account of the hotel: the app opens on the sign-in page.
 * Without Supabase (local mode) there is nothing to sign in to.
 */
export function AuthGate({ children, editorsOnly = false }: { children: ReactNode; /** Workers are sent back to the schedule (Equipo, Reglas, Accesos are not for them). */ editorsOnly?: boolean }) {
  const auth = useAuth();
  const router = useRouter();

  const away = editorsOnly && remoteConfigured && auth.ready && auth.isWorker;
  useEffect(() => {
    if (away) router.replace("/");
  }, [away, router]);

  const toLogin = remoteConfigured && auth.ready && (!auth.email || auth.recovery);
  useEffect(() => {
    if (toLogin) router.replace("/entrar");
  }, [toLogin, router]);

  if (!remoteConfigured) return <>{children}</>;
  if (!auth.ready || toLogin || away) return <Splash />;
  if (!auth.isEditor && !auth.isWorker) return <NoAccess email={auth.email!} onSignOut={() => void auth.signOut()} />;
  return <>{children}</>;
}
