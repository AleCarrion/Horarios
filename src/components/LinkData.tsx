"use client";

import { useEffect, useState } from "react";
import { collectLocal, describeLocal, hasLocalData, isLocalDataKey, uploadAll, type LocalData } from "@/lib/migration";
import { getSupabase, remoteConfigured } from "@/lib/supabase";
import type { AuthState } from "@/lib/useAuth";
import { ConfirmDialog } from "./ConfirmDialog";

const flagKey = () => `horarios:linked:${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/[^a-z0-9]/gi, "").slice(-16)}`;

/**
 * First time the manager signs in on a device that already holds data: ask what to do with it,
 * instead of silently mixing it with what the server has.
 */
export function LinkData({ auth }: { auth: AuthState }) {
  const [local, setLocal] = useState<LocalData | null>(null);
  const [server, setServer] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  useEffect(() => {
    if (!remoteConfigured || !auth.ready || !auth.isEditor) return;
    try {
      if (localStorage.getItem(flagKey())) return;
    } catch {
      return;
    }
    const data = collectLocal(localStorage);
    if (!hasLocalData(data)) {
      try { localStorage.setItem(flagKey(), "1"); } catch {}
      return;
    }
    let alive = true;
    void getSupabase()
      ?.from("monthly_schedule")
      .select("day", { count: "exact", head: true })
      .then(({ count }) => {
        if (!alive) return;
        setServer(count ?? 0);
        setLocal(data);
      });
    return () => {
      alive = false;
    };
  }, [auth.ready, auth.isEditor]);

  if (!local) return null;
  const d = describeLocal(local);
  const done = () => {
    try { localStorage.setItem(flagKey(), "1"); } catch {}
    setLocal(null);
  };

  const upload = async () => {
    const sb = getSupabase();
    if (!sb) return;
    setBusy(true);
    setError(null);
    const r = await uploadAll(sb, local);
    setBusy(false);
    if (!r.ok) return setError(`No se ha podido subir (${r.error}). No se ha borrado nada de este dispositivo; puedes reintentarlo.`);
    done();
    window.location.reload();
  };
  const discard = () => {
    try {
      for (const k of Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? "").filter(isLocalDataKey)) localStorage.removeItem(k);
    } catch {}
    done();
    window.location.reload();
  };

  if (confirmDiscard)
    return (
      <ConfirmDialog title="¿Descartar lo de este dispositivo?" confirmLabel="Sí, descartar" onCancel={() => setConfirmDiscard(false)} onConfirm={discard}>
        <p>Se borrarán de este dispositivo {d.months} meses, {d.requests} solicitudes y {d.locks} bloqueos, y se usará lo que hay en el servidor.</p>
        <p className="mt-2 font-semibold">Esto no se puede deshacer. Si dudas, cancela y guarda antes una copia de seguridad.</p>
      </ConfirmDialog>
    );

  return (
    <ConfirmDialog
      title="Hay datos en este dispositivo"
      confirmLabel={busy ? "Subiendo…" : "Subir al servidor"}
      cancelLabel="Más tarde"
      onCancel={() => setLocal(null)}
      onConfirm={() => void upload()}
    >
      <p>
        Este dispositivo guarda {d.months} meses, {d.requests} solicitudes y {d.locks} bloqueos hechos antes de conectar el servidor.
        {server ? ` El servidor ya tiene ${server} casillas de horario.` : " El servidor está vacío."}
      </p>
      <p className="mt-2">
        {server
          ? "Si los subes, las casillas que coincidan se sustituyen por las de este dispositivo; el resto del servidor se conserva."
          : "Súbelos para que estén en todos tus dispositivos."}
      </p>
      {error && <p role="alert" className="mt-2 font-semibold text-red-600">{error}</p>}
      <button type="button" onClick={() => setConfirmDiscard(true)} className="mt-3 text-sm font-semibold text-red-600 underline-offset-2 hover:underline">
        Descartar lo de este dispositivo y usar el servidor
      </button>
    </ConfirmDialog>
  );
}
