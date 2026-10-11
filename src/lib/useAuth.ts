"use client";

import { useCallback, useEffect, useState } from "react";
import { isRecovery, setRecovery, setStoredRole } from "./session";
import { getSupabase } from "./supabase";

export interface AuthState {
  ready: boolean;
  email: string | null;
  isEditor: boolean;
  /** Can invite and remove other editors (see /acceso). */
  isAdmin: boolean;
  /** Sees the schedule and sends her own requests, but changes nothing. */
  isWorker: boolean;
  /** Workers: the person of the team they are. */
  staffId: string | null;
  /** Link by e-mail (no password). */
  signIn: (email: string) => Promise<string | null>;
  /** Classic e-mail + password. Each returns an error message in Spanish-ready form, or null. */
  signInPassword: (email: string, password: string) => Promise<string | null>;
  /** Creates the account; `needsConfirm` is true when Supabase asks to confirm the e-mail first. */
  signUp: (email: string, password: string) => Promise<{ error: string | null; needsConfirm: boolean }>;
  resetPassword: (email: string) => Promise<string | null>;
  /** True after opening the "reset password" link: the person must choose a new password. */
  recovery: boolean;
  setPassword: (password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const sb = getSupabase();
  const [ready, setReady] = useState(!sb);
  const [email, setEmail] = useState<string | null>(null);
  const [isEditor, setIsEditor] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isWorker, setIsWorker] = useState(false);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [recovery, setRecoveryState] = useState(false);

  useEffect(() => {
    if (!sb) return;
    if (isRecovery()) setRecoveryState(true); // eslint-disable-line react-hooks/set-state-in-effect
    const apply = async (userId: string | undefined, mail: string | undefined) => {
      setEmail(mail ?? null);
      if (!userId) {
        setIsEditor(false);
        setIsAdmin(false);
        setIsWorker(false);
        setStaffId(null);
        setStoredRole(null);
      } else {
        // The server decides what this e-mail may do: invited -> editor/admin; first person ever -> admin; otherwise nothing.
        const { data: access, error } = await sb.rpc("claim_access");
        if (error) {
          // server without migration 0007 yet: the old rule (a row in `editors`)
          const { data } = await sb.from("editors").select("user_id").eq("user_id", userId).maybeSingle();
          setIsEditor(Boolean(data));
          setIsAdmin(false);
          setIsWorker(false);
          setStoredRole(data ? "editor" : null);
        } else {
          setIsEditor(access === "admin" || access === "editor");
          setIsAdmin(access === "admin");
          setIsWorker(access === "worker");
          setStoredRole(access === "admin" || access === "editor" || access === "worker" ? access : null);
          if (access === "worker") {
            const { data: me } = await sb.from("editors").select("staff_id").eq("user_id", userId).maybeSingle();
            setStaffId((me?.staff_id as string | null) ?? null);
          } else setStaffId(null);
        }
      }
      setReady(true);
    };
    sb.auth.getSession().then(({ data }) => apply(data.session?.user.id, data.session?.user.email));
    const { data: sub } = sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") {
        setRecovery(true); // survives the move to the sign-in page
        setRecoveryState(true);
      }
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
  const signInPassword = useCallback(
    async (mail: string, password: string) => {
      if (!sb) return "Supabase no configurado";
      const { error } = await sb.auth.signInWithPassword({ email: mail, password });
      return error ? error.message : null;
    },
    [sb],
  );
  const signUp = useCallback(
    async (mail: string, password: string) => {
      if (!sb) return { error: "Supabase no configurado", needsConfirm: false };
      const { data, error } = await sb.auth.signUp({ email: mail, password, options: { emailRedirectTo: window.location.origin } });
      return { error: error ? error.message : null, needsConfirm: !error && !data.session };
    },
    [sb],
  );
  const resetPassword = useCallback(
    async (mail: string) => {
      if (!sb) return "Supabase no configurado";
      const { error } = await sb.auth.resetPasswordForEmail(mail, { redirectTo: window.location.origin });
      return error ? error.message : null;
    },
    [sb],
  );
  const setPassword = useCallback(
    async (password: string) => {
      if (!sb) return "Supabase no configurado";
      const { error } = await sb.auth.updateUser({ password });
      if (!error) {
        setRecovery(false);
        setRecoveryState(false);
      }
      return error ? error.message : null;
    },
    [sb],
  );
  const signOut = useCallback(async () => {
    await sb?.auth.signOut();
  }, [sb]);

  return { ready, email, isEditor, isAdmin, isWorker, staffId, signIn, signInPassword, signUp, resetPassword, recovery, setPassword, signOut };
}
