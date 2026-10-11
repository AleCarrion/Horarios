"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { isGuest } from "@/lib/session";
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

/**
 * With Supabase connected, the app opens on the sign-in page. A person can still choose "just look at the schedule"
 * (read-only, kept for this tab only). Without Supabase (local mode) there is nothing to sign in to.
 */
export function AuthGate({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const router = useRouter();
  const [guest, setGuest] = useState<boolean | null>(null);
  useEffect(() => {
    setGuest(isGuest()); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const toLogin = remoteConfigured && auth.ready && guest !== null && ((!auth.email && !guest) || auth.recovery);
  useEffect(() => {
    if (toLogin) router.replace("/entrar");
  }, [toLogin, router]);

  if (!remoteConfigured) return <>{children}</>;
  if (!auth.ready || guest === null || toLogin) return <Splash />;
  return <>{children}</>;
}
