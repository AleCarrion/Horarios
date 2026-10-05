"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { daysInMonth, toISO } from "./domain/dates";
import type { Schedule, ShiftCode } from "./domain/types";
import { getSupabase, remoteConfigured } from "./supabase";
import { coalesce, diffSchedules, rowsToSchedule, scheduleToRows, type Row } from "./sync";
import type { AuthState } from "./useAuth";

const QUEUE_KEY = "horarios:queue";

const readQueue = (): Row[] => {
  try {
    return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? "[]") as Row[];
  } catch {
    return [];
  }
};
const writeQueue = (q: Row[]) => {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  } catch {}
};

interface Args {
  year: number;
  month: number;
  present: Schedule;
  auth: AuthState;
  /** Called with the month stored in Supabase (null = nothing published yet). */
  onLoaded: (schedule: Schedule | null) => void;
  onRemoteCell: (row: Row) => void;
}

export function useRemoteSchedule({ year, month, present, auth, onLoaded, onRemoteCell }: Args) {
  const sb = getSupabase();
  const canEdit = Boolean(sb) && auth.isEditor;
  const [draft, setDraft] = useState(false);
  const [unpublished, setUnpublished] = useState(false);
  const [pending, setPending] = useState(() => (typeof window === "undefined" ? 0 : readQueue().length));
  const [loaded, setLoaded] = useState("");
  const key = `${year}-${month}`;
  const base = useRef<Schedule>({});
  const presentRef = useRef(present);
  useEffect(() => {
    presentRef.current = present;
  });
  const cb = useRef({ onLoaded, onRemoteCell });
  useEffect(() => {
    cb.current = { onLoaded, onRemoteCell };
  });

  const flush = useCallback(async () => {
    if (!sb || !canEdit) return;
    const sent = readQueue();
    if (!sent.length) return setPending(0);
    const { error } = await sb.from("monthly_schedule").upsert(sent, { onConflict: "staff_id,day" });
    if (error) return setPending(sent.length);
    // keep anything enqueued while the request was in flight
    const same = (a: Row, b: Row) => a.staff_id === b.staff_id && a.day === b.day && a.shift_code === b.shift_code;
    const rest = readQueue().filter((r) => !sent.some((s) => same(s, r)));
    writeQueue(rest);
    setPending(rest.length);
  }, [sb, canEdit]);

  // Load the month and listen for other sessions' changes.
  useEffect(() => {
    if (!sb || !auth.ready) return;
    let alive = true;
    const first = toISO(year, month, 1);
    const last = toISO(year, month, daysInMonth(year, month));
    sb.from("monthly_schedule")
      .select("staff_id, day, shift_code")
      .gte("day", first)
      .lte("day", last)
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) {
          // Offline: keep the locally cached month and queue edits against it.
          base.current = presentRef.current;
          setLoaded(key);
          return;
        }
        if (data.length) {
          const s = rowsToSchedule(data as Row[]);
          base.current = s;
          setDraft(false);
          setUnpublished(false);
          cb.current.onLoaded(s);
        } else {
          base.current = {};
          setDraft(canEdit);
          setUnpublished(!canEdit);
          cb.current.onLoaded(null);
        }
        setLoaded(key);
      });
    const channel = sb
      .channel(`schedule-${year}-${month}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "monthly_schedule" }, (p) => {
        const row = p.new as Row | undefined;
        if (!row?.day || row.day < first || row.day > last) return;
        if (base.current[row.staff_id]?.[row.day] === row.shift_code) return;
        base.current = { ...base.current, [row.staff_id]: { ...base.current[row.staff_id], [row.day]: row.shift_code } };
        cb.current.onRemoteCell(row);
      })
      .subscribe();
    return () => {
      alive = false;
      void sb.removeChannel(channel);
    };
  }, [sb, year, month, key, auth.ready, canEdit]);

  // Local edits (including undo/redo/regenerate) -> queue -> Supabase.
  useEffect(() => {
    if (!canEdit || draft || loaded !== key) return;
    const rows = diffSchedules(base.current, present);
    if (!rows.length) return;
    base.current = present;
    const q = coalesce([...readQueue(), ...rows]);
    writeQueue(q);
    setPending(q.length);
    void flush();
  }, [present, canEdit, draft, loaded, key, flush]);

  // Retry when the connection returns and periodically while something is pending.
  useEffect(() => {
    if (!canEdit) return;
    const t = setInterval(() => void flush(), 30000);
    const first = setTimeout(() => void flush(), 0);
    window.addEventListener("online", flush);
    return () => {
      clearInterval(t);
      clearTimeout(first);
      window.removeEventListener("online", flush);
    };
  }, [canEdit, flush]);

  const publish = useCallback(async () => {
    if (!sb || !canEdit) return;
    const rows = scheduleToRows(present);
    const { error } = await sb.from("monthly_schedule").upsert(rows, { onConflict: "staff_id,day" });
    if (!error) {
      base.current = present;
      setDraft(false);
    }
  }, [sb, canEdit, present]);

  const status = !remoteConfigured
    ? "local"
    : !canEdit
      ? "readonly"
      : draft
        ? "draft"
        : pending > 0
          ? "pending"
          : "synced";

  return { status, canEdit, draft, unpublished, publish } as const;
}

export type { ShiftCode };
