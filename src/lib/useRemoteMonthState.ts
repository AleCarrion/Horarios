"use client";

import { useCallback, useEffect, useRef } from "react";
import type { MonthState } from "./domain/monthStatus";
import { fromMonthRow, sameState, toMonthRow, type MonthRow } from "./monthStateSync";
import { getSupabase } from "./supabase";
import type { AuthState } from "./useAuth";
import { channelName } from "./realtime";

interface Args {
  auth: AuthState;
  year: number;
  month: number;
  /** The server's decision for this month (null = draft) — also called when another device changes it. */
  onRemote: (s: MonthState | null) => void;
}

/** Published / reopened state of the displayed month, shared between devices through `public.schedule_months`. */
export function useRemoteMonthState({ auth, year, month, onRemote }: Args) {
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
      .from("schedule_months")
      .select("year, month, status, changed_at")
      .eq("year", year)
      .eq("month", month)
      .maybeSingle()
      .then(({ data, error }) => {
        if (alive && !error && data) cb.current(fromMonthRow(data as MonthRow));
      });
    const channel = sb
      .channel(channelName(`month-${year}-${month}`))
      .on("postgres_changes", { event: "*", schema: "public", table: "schedule_months" }, (p) => {
        const row = p.new as MonthRow | undefined;
        if (row && row.year === year && row.month === month) cb.current(fromMonthRow(row));
      })
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(channel);
    };
  }, [sb, auth.ready, year, month]);

  const save = useCallback(
    async (s: MonthState | null) => {
      if (!sb || !canEdit) return;
      await sb.from("schedule_months").upsert(toMonthRow(year, month, s), { onConflict: "year,month" });
    },
    [sb, canEdit, year, month],
  );
  return { save } as const;
}

export { sameState };
