"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { daysInMonth, toISO } from "./domain/dates";
import { diffLocks, locksFromRows, locksToRows, unionLocks, type LockRow } from "./locksSync";
import { readLocks, type Locks } from "./monthStore";
import { getSupabase } from "./supabase";
import type { AuthState } from "./useAuth";

interface Args {
  auth: AuthState;
  year: number;
  month: number;
  locks: Locks;
  /** Locks of the month: the server's plus any only this device has. */
  onLoaded: (locks: Locks) => void;
}

/** Locked cells of the displayed month live in `public.locked_cells` (editors only). */
export function useRemoteLocks({ auth, year, month, locks, onLoaded }: Args) {
  const sb = getSupabase();
  const canEdit = Boolean(sb) && auth.isEditor;
  const key = `${year}-${month}`;
  const [loadedKey, setLoadedKey] = useState("");
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const synced = useRef<Locks>({}); // what the server has for this month
  const cb = useRef(onLoaded);
  useEffect(() => {
    cb.current = onLoaded;
  });

  const range = useCallback(() => ({ first: toISO(year, month, 1), last: toISO(year, month, daysInMonth(year, month)) }), [year, month]);

  const load = useCallback(
    async (merge: boolean) => {
      if (!sb) return;
      const { first, last } = range();
      const { data, error } = await sb.from("locked_cells").select("staff_id, day").gte("day", first).lte("day", last);
      if (error || !data) return setLoadedKey(key); // offline: keep local locks
      const server = locksFromRows(data as LockRow[]);
      synced.current = server;
      // first load of the month: nothing local is lost; later reloads: the server is the truth
      cb.current(merge ? unionLocks(server, readLocks(year, month)) : server);
      setLoadedKey(key);
    },
    [sb, range, key, year, month],
  );

  useEffect(() => {
    if (!sb || !auth.ready) return;
    const first = setTimeout(() => void load(true), 0);
    const channel = sb
      .channel(`locks-${key}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "locked_cells" }, () => void load(false))
      .subscribe();
    return () => {
      clearTimeout(first);
      void sb.removeChannel(channel);
    };
  }, [sb, auth.ready, key, load]);

  // Local changes -> server
  useEffect(() => {
    if (!sb || !canEdit || loadedKey !== key) return;
    const { add, remove } = diffLocks(synced.current, locks);
    if (!add.length && !remove.length) return;
    let alive = true;
    const snapshot = locks;
    void (async () => {
      const results = await Promise.all([
        add.length ? sb.from("locked_cells").upsert(add, { onConflict: "staff_id,day" }) : Promise.resolve({ error: null }),
        ...remove.map((r) => sb.from("locked_cells").delete().eq("staff_id", r.staff_id).eq("day", r.day)),
      ]);
      if (!alive) return;
      if (results.some((r) => r.error)) return setPending(true);
      synced.current = locksFromRows(locksToRows(snapshot));
      setPending(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, canEdit, loadedKey, key, locks, retry]);

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

  return { pending } as const;
}
