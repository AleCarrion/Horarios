"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { generateSchedule } from "@/lib/domain/generator";
import { applyEdit, applyRemote, createHistory, redo, undo } from "@/lib/domain/history";
import { DEFAULT_STAFF } from "@/lib/domain/roster";
import type { Schedule } from "@/lib/domain/types";
import { validateSchedule } from "@/lib/domain/validate";
import { MONTHS, SHIFT_STYLE } from "@/lib/ui";
import { SHIFTS } from "@/lib/domain/types";
import { downloadText } from "@/lib/download";
import { toCSV, toICS } from "@/lib/export";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useRemoteSchedule } from "@/lib/useRemoteSchedule";
import { AuthBar } from "./AuthBar";
import { ScheduleGrid } from "./ScheduleGrid";

type Action =
  | { type: "reset"; schedule: Schedule }
  | { type: "edit"; staffId: string; date: string; code: Parameters<typeof applyEdit>[3] }
  | { type: "remote"; staffId: string; date: string; code: Parameters<typeof applyEdit>[3] }
  | { type: "undo" }
  | { type: "redo" };

function reducer(h: ReturnType<typeof createHistory>, a: Action) {
  switch (a.type) {
    case "reset": return createHistory(a.schedule);
    case "edit": return applyEdit(h, a.staffId, a.date, a.code);
    case "remote": return applyRemote(h, a.staffId, a.date, a.code);
    case "undo": return undo(h);
    case "redo": return redo(h);
  }
}

const storageKey = (y: number, m: number) => `horarios:${y}-${m}`;

function load(y: number, m: number): Schedule {
  try {
    const raw = localStorage.getItem(storageKey(y, m));
    if (raw) return JSON.parse(raw) as Schedule;
  } catch {}
  return generateSchedule({ year: y, month: m, staff: DEFAULT_STAFF }).schedule;
}

export function ScheduleApp() {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [icsPerson, setIcsPerson] = useState(DEFAULT_STAFF[0].id);
  const [h, dispatch] = useReducer(reducer, undefined, () =>
    createHistory(generateSchedule({ year: ym.year, month: ym.month, staff: DEFAULT_STAFF }).schedule),
  );

  const auth = useAuth();
  const remote = useRemoteSchedule({
    year: ym.year,
    month: ym.month,
    present: h.present,
    auth,
    onLoaded: (s) => dispatch({ type: "reset", schedule: s ?? load(ym.year, ym.month) }),
    onRemoteCell: (r) => dispatch({ type: "remote", staffId: r.staff_id, date: r.day, code: r.shift_code }),
  });
  const readOnly = remoteConfigured && !remote.canEdit;

  useEffect(() => {
    dispatch({ type: "reset", schedule: load(ym.year, ym.month) });
  }, [ym]);

  useEffect(() => {
    if (!h.changes.length) return;
    try { localStorage.setItem(storageKey(ym.year, ym.month), JSON.stringify(h.present)); } catch {}
  }, [h.present, h.changes.length, ym]);

  const validation = useMemo(
    () => validateSchedule(h.present, DEFAULT_STAFF, ym.year, ym.month),
    [h.present, ym],
  );

  const shiftMonth = (delta: number) =>
    setYm(({ year, month }) => {
      const d = new Date(year, month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

  const regenerate = () => {
    try { localStorage.removeItem(storageKey(ym.year, ym.month)); } catch {}
    dispatch({
      type: "reset",
      schedule: generateSchedule({ year: ym.year, month: ym.month, staff: DEFAULT_STAFF, seed: Date.now() % 97 }).schedule,
    });
  };

  const fileBase = `horario-${ym.year}-${String(ym.month).padStart(2, "0")}`;
  const exportCSV = () =>
    downloadText(`${fileBase}.csv`, toCSV(h.present, DEFAULT_STAFF, ym.year, ym.month), "text/csv");
  const exportICS = () => {
    const person = DEFAULT_STAFF.find((p) => p.id === icsPerson)!;
    downloadText(`${fileBase}-${person.id}.ics`, toICS(h.present, person, ym.year, ym.month), "text/calendar");
  };

  const btn =
    "rounded-lg border border-brand/30 px-3 py-2 text-sm font-medium hover:bg-brand/10 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand";

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1500px] space-y-4 p-4">
      {remoteConfigured && <AuthBar auth={auth} status={remote.status} />}
      <header className="flex flex-wrap items-center gap-3 print:hidden">
        <h1 className="text-xl font-bold text-brand">Horarios · Casa 1800</h1>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button className={btn} onClick={() => shiftMonth(-1)} aria-label="Mes anterior">‹</button>
          <span className="min-w-36 text-center font-semibold" aria-live="polite">
            {MONTHS[ym.month - 1]} {ym.year}
          </span>
          <button className={btn} onClick={() => shiftMonth(1)} aria-label="Mes siguiente">›</button>
          <button className={btn} onClick={() => dispatch({ type: "undo" })} disabled={readOnly || !h.past.length}>Deshacer</button>
          <button className={btn} onClick={() => dispatch({ type: "redo" })} disabled={readOnly || !h.future.length}>Rehacer</button>
          {remote.draft && (
            <button className={btn} onClick={() => void remote.publish()}>Publicar mes</button>
          )}
          <button
            disabled={readOnly}
            className="rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-brand"
            onClick={regenerate}
          >
            Generar automático
          </button>
        </div>
      </header>

      <h2 className="hidden text-lg font-bold print:block">
        Horario {MONTHS[ym.month - 1]} {ym.year} · Hotel Casa 1800
      </h2>

      <div className="flex flex-wrap items-center gap-2 print:hidden" role="group" aria-label="Exportar">
        <span className="text-sm font-medium">Exportar:</span>
        <button className={btn} onClick={() => window.print()}>PDF / Imprimir</button>
        <button className={btn} onClick={exportCSV}>CSV (Excel)</button>
        <label className="sr-only" htmlFor="ics-person">Persona para iCal</label>
        <select
          id="ics-person"
          value={icsPerson}
          onChange={(e) => setIcsPerson(e.target.value)}
          className="rounded-lg border border-brand/30 bg-transparent px-2 py-2 text-sm"
        >
          {DEFAULT_STAFF.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className={btn} onClick={exportICS}>iCal (.ics)</button>
      </div>

      <ul className="flex flex-wrap gap-2 text-xs" aria-label="Leyenda">
        {(["M", "T", "N", "S", "P", "MZ", "D"] as const).map((c) => (
          <li key={c} className={`rounded px-2 py-1 font-semibold ${SHIFT_STYLE[c]}`}>
            {c} {SHIFTS[c].label} {SHIFTS[c].start && `${SHIFTS[c].start}-${SHIFTS[c].end}`}
          </li>
        ))}
      </ul>

      {remote.unpublished ? (
        <p className="rounded-xl border border-slate-300/60 bg-white p-4 dark:bg-slate-900">
          Este mes todavía no está publicado.
        </p>
      ) : (
      <ScheduleGrid
        readOnly={readOnly}
        year={ym.year}
        month={ym.month}
        staff={DEFAULT_STAFF}
        schedule={h.present}
        validation={validation}
        onEdit={(staffId, date, code) => dispatch({ type: "edit", staffId, date, code })}
      />
      )}

      <section aria-live="polite" className="print:hidden rounded-xl border border-slate-300/60 bg-white p-3 text-sm dark:bg-slate-900">
        {validation.issues.length === 0 ? (
          <p className="font-medium text-emerald-700">✓ Todas las reglas y coberturas se cumplen.</p>
        ) : (
          <>
            <p className="font-semibold text-red-700">{validation.issues.length} aviso(s)</p>
            <ul className="mt-1 list-disc pl-5">
              {validation.issues.slice(0, 20).map((i, k) => <li key={k}>{i.message}</li>)}
            </ul>
          </>
        )}
      </section>
    </main>
  );
}
