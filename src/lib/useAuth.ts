"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "./supabase";

export interface AuthState {
  ready: boolean;
  email: string | null;
  isEditor: boolean;
  /** Can invite and remove other editors (see /acceso). */
  isAdmin: boolean;
  signIn: (email: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const sb = getSupabase();
  const [ready, setReady] = useState(!sb);
  const [email, setEmail] = useState<string | null>(null);
  const [isEditor, setIsEditor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    if (!sb) return;
    const apply = async (userId: string | undefined, mail: string | undefined) => {
      setEmail(mail ?? null);
      if (!userId) {
        setIsEditor(false);
        setIsAdmin(false);
      } else {
        // The server decides what this e-mail may do: invited -> editor/admin; first person ever -> admin; otherwise nothing.
        const { data: access, error } = await sb.rpc("claim_access");
        if (error) {
          // server without migration 0007 yet: the old rule (a row in `editors`)
          const { data } = await sb.from("editors").select("user_id").eq("user_id", userId).maybeSingle();
          setIsEditor(Boolean(data));
          setIsAdmin(false);
        } else {
          setIsEditor(access === "admin" || access === "editor");
          setIsAdmin(access === "admin");
        }
      }
      setReady(true);
    };
    sb.auth.getSession().then(({ data }) => apply(data.session?.user.id, data.session?.user.email));
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      void apply(session?.user.id, session?.user.email);
    });
    return () => sub.subscription.unsubscribe();
  }, [sb]);

  const signIn = useCallback(
    async (mail: string) => {
      if (!sb) return "Supabase no configurado";
      const { error } = await sb.auth.signInWithOtp({
        email: mail,
        options: { emailRedirectTo: window.location.origin },
      });
      return error ? error.message : null;
    },
    [sb],
  );
  const signOut = useCallback(async () => {
    await sb?.auth.signOut();
  }, [sb]);

  return { ready, email, isEditor, isAdmin, signIn, signOut };
}
