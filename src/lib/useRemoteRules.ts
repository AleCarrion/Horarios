"use client";

import { useCallback, useEffect, useRef } from "react";
import type { Rules } from "./domain/ruleset";
import { fromRulesRow, toRulesRow } from "./rulesSync";
import { getSupabase } from "./supabase";
import type { AuthState } from "./useAuth";
import { channelName } from "./realtime";

/** The hotel's rules are shared between devices through `public.app_rules`. */
export function useRemoteRules(auth: AuthState, onRemote: (r: Rules) => void) {
  const sb = getSupabase();
  const canEdit = Boolean(sb) && auth.isEditor;
  const cb = useRef(onRemote);
  useEffect(() => {
    cb.current = onRemote;
  });

  useEffect(() => {
    if (!sb || !auth.ready) return;
    let alive = true;
    void sb
      .from("app_rules")
      .select("rules")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (alive && !error && data) cb.current(fromRulesRow(data));
      });
    const channel = sb
      .channel(channelName("rules"))
      .on("postgres_changes", { event: "*", schema: "public", table: "app_rules" }, (p) => {
        const row = p.new as { rules?: unknown } | undefined;
        if (row?.rules) cb.current(fromRulesRow({ rules: row.rules }));
      })
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(channel);
    };
  }, [sb, auth.ready]);

  const save = useCallback(
    async (r: Rules) => {
      if (!sb || !canEdit) return;
      await sb.from("app_rules").upsert(toRulesRow(r), { onConflict: "id" });
    },
    [sb, canEdit],
  );
  return { save } as const;
}
