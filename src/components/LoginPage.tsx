"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { setGuest } from "@/lib/session";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { Splash } from "./AuthGate";
import { LoginForm } from "./LoginForm";
import { LogoMark } from "./icons";

/** The first screen when Supabase is connected. */
export function LoginPage() {
  const auth = useAuth();
  const router = useRouter();
  const done = !remoteConfigured || (auth.ready && Boolean(auth.email) && !auth.recovery);
  useEffect(() => {
    if (done) router.replace("/");
  }, [done, router]);
  if (!auth.ready && remoteConfigured) return <Splash />;
  if (done) return <Splash />;

  return (
    <main className="mx-auto grid min-h-dvh w-full max-w-md place-items-center p-4 pt-[calc(1rem+env(safe-area-inset-top))]">
      <div className="anim-fade-up w-full space-y-6">
        <div className="text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-brand to-brand-2 shadow-xl shadow-brand/30">
            <LogoMark width={38} height={38} />
          </span>
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Horarios</h1>
          <p className="text-sm text-muted">Hotel Casa 1800</p>
        </div>
        <div className="glass rounded-3xl p-5 sm:p-6">
          <LoginForm auth={auth} />
        </div>
        <p className="text-center text-sm">
          <button
            type="button"
            onClick={() => {
              setGuest(true);
              router.push("/");
            }}
            className="font-semibold text-muted underline-offset-2 hover:text-foreground hover:underline"
          >
            Solo quiero ver el horario
          </button>
        </p>
      </div>
    </main>
  );
}
