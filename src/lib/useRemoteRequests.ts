"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ShiftRequest } from "./domain/requests";
import { fromRequestRows, mergeRequests, toRequestRow, type RequestRow } from "./requestsSync";
import { getSupabase } from "./supabase";
import type { AuthState } from "./useAuth";

interface Args {
  auth: AuthState;
  requests: ShiftRequest[];
  /** All requests as the server has them plus any that only exist on this device. */
  onLoaded: (requests: ShiftRequest[]) => void;
}

/** Requests live in `public.requests`; editors write, and new/changed ones are uploaded as they happen. */
export function useRemoteRequests({ auth, requests, onLoaded }: Args) {
  const sb = getSupabase();
  const canEdit = Boolean(sb) && auth.isEditor;
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const synced = useRef(new Map<string, string>()); // id -> JSON of the row the server has
  const latest = useRef(requests);
  const cb = useRef(onLoaded);
  useEffect(() => {
    latest.current = requests;
    cb.current = onLoaded;
  });

  const load = useCallback(async () => {
    if (!sb) return;
    const { data, error } = await sb.from("requests").select("*");
    if (error || !data) return setLoaded(true); // offline: keep what this device has
    const rows = data as RequestRow[];
    synced.current = new Map(rows.map((r) => [r.id, JSON.stringify(toRequestRow(fromRequestRows([r])[0]))]));
    const merged = mergeRequests(fromRequestRows(rows), latest.current);
    if (JSON.stringify(merged) !== JSON.stringify(latest.current)) cb.current(merged);
    setLoaded(true);
  }, [sb]);

  useEffect(() => {
    if (!sb || !auth.ready) return;
    const first = setTimeout(() => void load(), 0);
    const channel = sb
      .channel("requests-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "requests" }, () => void load())
      .subscribe();
    return () => {
      clearTimeout(first);
      void sb.removeChannel(channel);
    };
  }, [sb, auth.ready, load]);

  // New or changed requests -> Supabase
  useEffect(() => {
    if (!sb || !canEdit || !loaded) return;
    const rows = requests.map(toRequestRow).filter((r) => synced.current.get(r.id) !== JSON.stringify(r));
    if (!rows.length) return;
    let alive = true;
    void (async () => {
      const { error } = await sb.from("requests").upsert(rows, { onConflict: "id" });
      if (!alive) return;
      if (error) return setPending(true);
      rows.forEach((r) => synced.current.set(r.id, JSON.stringify(r)));
      setPending(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, canEdit, loaded, requests, retry]);

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
