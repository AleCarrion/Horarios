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
  const workerOf = sb && auth.isWorker ? auth.staffId : null; // a worker only ever touches her own requests
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(0);
  const synced = useRef(new Map<string, string>()); // id -> JSON of the row the server has
  const ownIds = useRef<Set<string> | null>(null);
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

  // Worker: new own requests -> insert; own pending requests removed on this device -> delete (cancelled)
  useEffect(() => {
    if (!sb || !workerOf || !loaded) return;
    const mine = requests.filter((r) => r.staffId === workerOf);
    const fresh = mine.map(toRequestRow).filter((r) => !synced.current.has(r.id));
    // only what the worker removed since the last look is a cancellation (a request the server has but this device has not loaded yet is not)
    const before = ownIds.current;
    ownIds.current = new Set(mine.map((r) => r.id));
    const gone = before ? [...before].filter((id) => synced.current.has(id) && !ownIds.current!.has(id)) : [];
    if (!fresh.length && !gone.length) return;
    let alive = true;
    void (async () => {
      const results = await Promise.all([
        fresh.length ? sb.from("requests").insert(fresh) : Promise.resolve({ error: null }),
        ...gone.map((id) => sb.from("requests").delete().eq("id", id)),
      ]);
      if (!alive) return;
      if (results.some((r) => r.error)) return setPending(true);
      fresh.forEach((r) => synced.current.set(r.id, JSON.stringify(r)));
      gone.forEach((id) => synced.current.delete(id));
      setPending(false);
    })();
    return () => {
      alive = false;
    };
  }, [sb, workerOf, loaded, requests, retry]);

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
