"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Staff } from "./domain/types";
import { fromStaffRows, toStaffRows, type StaffRow } from "./staffSync";
import { getSupabase } from "./supabase";
import type { AuthState } from "./useAuth";

interface Args {
  auth: AuthState;
  staff: Staff[];
  /** The team stored in Supabase (also called after other sessions change it). */
  onLoaded: (staff: Staff[]) => void;
}

/**
 * Keeps the team (names, puestos, order, alta/baja) in `public.staff`.
 * Editors write; everyone reads. With no rows yet, the first editor publishes their local team.
 */
export function useRemoteStaff({ auth, staff, onLoaded }: Args) {
  const sb = getSupabase();
  const canEdit = Boolean(sb) && auth.isEditor;
  const [loaded, setLoaded] = useState(false);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState(false);
  const synced = useRef(""); // JSON of the rows the server is known to have
  const known = useRef<Set<string>>(new Set()); // every id that exists in the table (active or not)
  const cb = useRef(onLoaded);
  useEffect(() => {
    cb.current = onLoaded;
  });

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.from("staff").select("*");
    if (error || !data) return setLoaded(true); // offline: keep the local team
    const rows = data as StaffRow[];
    known.current = new Set(rows.map((r) => r.id));
    if (rows.some((r) => r.active)) {
      const team = fromStaffRows(rows);
      synced.current = JSON.stringify(toStaffRows(team));
      cb.current(team);
    } else synced.current = "";
    setLoaded(true);
  }, [sb]);

  useEffect(() => {
    if (!sb || !auth.ready) return;
    const first = setTimeout(() => void load(), 0);
    const channel = sb
      .channel("staff-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "staff" }, () => void load())
      .subscribe();
    return () => {
      clearTimeout(first);
      void sb.removeChannel(channel);
    };
  }, [sb, auth.ready, load]);

  // Local team changes -> Supabase (editors only, after the first load so we never overwrite before reading).
  useEffect(() => {
    if (!sb || !canEdit || !loaded) return;
    const rows = toStaffRows(staff);
    const json = JSON.stringify(rows);
    if (json === synced.current) return;
    let alive = true;
    void (async () => {
      const gone = [...known.current].filter((id) => !rows.some((r) => r.id === id));
      if (gone.length) {
        const { error } = await sb.from("staff").update({ active: false }).in("id", gone);
        if (error) return alive && setPending(true);
      }
      const { error } = await sb.from("staff").upsert(rows, { onConflict: "id" });
      if (!alive) return;
      if (error) return setPending(true);
      rows.forEach((r) => known.current.add(r.id));
      synced.current = json;
      setPending(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, canEdit, loaded, staff, retry]);

  // Retry when back online or every 30 s while something is pending.
  useEffect(() => {
    if (!pending) return;
    const again = () => setRetry((n) => n + 1);
    const t = setInterval(again, 30000);
    window.addEventListener("online", again);
    return () => {
      clearInterval(t);
      window.removeEventListener("online", again);
    };
  }, [pending]);

  return { pending, loaded } as const;
}
