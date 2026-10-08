"use client";

import { useEffect, useMemo, useReducer, useState } from "react";
import { generateSchedule } from "@/lib/domain/generator";
import { applyEdits, applyRemote, createHistory, redo, undo, type Edit } from "@/lib/domain/history";
import { DEFAULT_STAFF } from "@/lib/domain/roster";
import { buildStaff, readOverrides, writeOverrides, type RosterOverrides } from "@/lib/rosterConfig";
import { diffSchedules } from "@/lib/sync";
import { isActive, type Schedule, type ShiftCode, type Staff } from "@/lib/domain/types";
import { validateSchedule } from "@/lib/domain/validate";
import { MONTHS, SHIFT_STYLE } from "@/lib/ui";
import { SHIFTS, displayCode } from "@/lib/domain/types";
import { downloadText } from "@/lib/download";
import { toCSV, toICS } from "@/lib/export";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useRemoteSchedule } from "@/lib/useRemoteSchedule";
import { AuthBar } from "./AuthBar";
import { ExportMenu } from "./ExportMenu";
import { ChevronLeft, ChevronRight, CheckIcon, LogoMark, RedoIcon, SparklesIcon, UndoIcon } from "./icons";
import { RosterPanel } from "./RosterPanel";
import { ScheduleGrid } from "./ScheduleGrid";
import { StatCards } from "./StatCards";

type Action =
  | { type: "reset"; schedule: Schedule }
  | { type: "edit"; edits: Edit[] }
  | { type: "remote"; staffId: string; date: string; code: ShiftCode }
  | { type: "replace"; schedule: Schedule }
  | { type: "undo" }
  | { type: "redo" };

function reducer(h: ReturnType<typeof createHistory>, a: Action) {
  switch (a.type) {
    case "reset": return createHistory(a.schedule);
    case "edit": return applyEdits(h, a.edits);
    case "remote": return applyRemote(h, a.staffId, a.date, a.code);
    case "replace": {
      // Same people: apply as one undoable step. Different rows (e.g. refuerzo toggled): start fresh.
      const sameRows = Object.keys(a.schedule).length === Object.keys(h.present).length && Object.keys(a.schedule).every((k) => k in h.present);
      if (!sameRows) return createHistory(a.schedule);
      return applyEdits(h, diffSchedules(h.present, a.schedule).map((r) => ({ staffId: r.staff_id, date: r.day, to: r.shift_code })));
    }
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
  return generateSchedule({ year: y, month: m, staff: buildStaff(readOverrides()) }).schedule;
}

export function ScheduleApp() {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [h, dispatch] = useReducer(reducer, undefined, () =>
    createHistory(generateSchedule({ year: ym.year, month: ym.month, staff: DEFAULT_STAFF }).schedule),
  );

  const [overrides, setOverrides] = useState<RosterOverrides>({});
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    // localStorage / the clock are only safe to read after mount
    setOverrides(readOverrides()); // eslint-disable-line react-hooks/set-state-in-effect
    const t = new Date();
    setToday(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
  }, []);
  const staff = useMemo<Staff[]>(() => buildStaff(overrides), [overrides]);

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
    () => validateSchedule(h.present, staff, ym.year, ym.month),
    [h.present, ym, staff],
  );

  const stats = useMemo(() => {
    const days = Object.values(validation.coverage);
    const total = days.length * 3;
    const covered = days.reduce((n, c) => n + Math.min(c.M, 1) + Math.min(c.T, 1) + Math.min(c.N, 1), 0);
    const first = `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
    const last = `${ym.year}-${String(ym.month).padStart(2, "0")}-${String(days.length).padStart(2, "0")}`;
    const people = staff.filter((p) => isActive(p, first) || isActive(p, last)).length;
    return { total, covered, pct: total ? Math.round((covered / total) * 100) : 100, people };
  }, [validation, staff, ym]);

  const shiftMonth = (delta: number) =>
    setYm(({ year, month }) => {
      const d = new Date(year, month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

  const regenerate = (ov: RosterOverrides = overrides) => {
    try { localStorage.removeItem(storageKey(ym.year, ym.month)); } catch {}
    const list = buildStaff(ov);
    // Holidays (V), days out of the roster (B) and JC's rest days are inputs: edit them in the grid, then regenerate around them.
    const unavailable: Record<string, Record<string, "V" | "B">> = {};
    for (const p of list) {
      const before = staff.find((x) => x.id === p.id); // dates as they were: a B outside them came from the old dates, not from a hand edit
      for (const [d, c] of Object.entries(h.present[p.id] ?? {})) {
        if (c === "B" && before && !isActive(before, d)) continue;
        if (c === "V" || c === "B") (unavailable[p.id] ??= {})[d] = c;
      }
    }
    dispatch({
      type: "replace",
      schedule: generateSchedule({
        year: ym.year,
        month: ym.month,
        staff: list,
        seed: Date.now() % 97,
        unavailable,
        jcRestDays: Object.entries(h.present.jc ?? {}).filter(([, c]) => c === "D").map(([d]) => d),
      }).schedule,
    });
  };

  const changeDates = (id: string, field: "activeFrom" | "activeTo", value: string) => {
    const next = { ...overrides, [id]: { ...overrides[id], [field]: value || undefined } };
    setOverrides(next);
    writeOverrides(next);
    regenerate(next);
  };

  const fileBase = `horario-${ym.year}-${String(ym.month).padStart(2, "0")}`;
  const exportCSV = () =>
    downloadText(`${fileBase}.csv`, toCSV(h.present, staff, ym.year, ym.month), "text/csv");
  const exportICS = (person: Staff) =>
    downloadText(`${fileBase}-${person.id}.ics`, toICS(h.present, person, ym.year, ym.month), "text/calendar");

  const iconBtn =
    "glass grid h-10 w-10 place-items-center rounded-xl transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-brand";

  return (
    <>
      <header className="glass top-0 z-30 border-x-0 border-t-0 sm:sticky print:hidden">
        <div className="mx-auto flex w-full max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 shadow-lg shadow-brand/30">
              <LogoMark />
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight">Horarios</h1>
              <p className="text-xs text-muted">Hotel Casa 1800</p>
            </div>
          </div>

          <div className="order-last mx-auto flex w-full items-center justify-between gap-1 rounded-2xl border border-line bg-card-solid/70 p-1 sm:order-none sm:w-auto">
            <button className={`${iconBtn} !h-9 !w-9 border-0 shadow-none`} onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
              <ChevronLeft />
            </button>
            <span key={`${ym.year}-${ym.month}`} className="anim-slide min-w-36 text-center sm:min-w-44 text-base font-bold" aria-live="polite">
              {MONTHS[ym.month - 1]} <span className="font-medium text-muted">{ym.year}</span>
            </span>
            <button className={`${iconBtn} !h-9 !w-9 border-0 shadow-none`} onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
              <ChevronRight />
            </button>
          </div>

          <div className="ml-auto flex items-center gap-2 sm:ml-0">
            <button className={iconBtn} onClick={() => dispatch({ type: "undo" })} disabled={readOnly || !h.past.length} aria-label="Deshacer" title="Deshacer">
              <UndoIcon />
            </button>
            <button className={iconBtn} onClick={() => dispatch({ type: "redo" })} disabled={readOnly || !h.future.length} aria-label="Rehacer" title="Rehacer">
              <RedoIcon />
            </button>
            <ExportMenu onPdf={() => window.print()} onCsv={exportCSV} />
            {remote.draft && (
              <button
                className="rounded-xl border border-brand/40 bg-brand/10 px-3.5 py-2 text-sm font-semibold text-brand transition hover:-translate-y-0.5 hover:bg-brand/20"
                onClick={() => void remote.publish()}
              >
                Publicar mes
              </button>
            )}
            <button
              disabled={readOnly}
              onClick={() => regenerate()}
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <SparklesIcon width={16} height={16} className="transition-transform group-hover:rotate-12 group-hover:scale-125" />
              Generar<span className="hidden sm:inline"> automático</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1500px] space-y-4 p-4">
        {remoteConfigured && <AuthBar auth={auth} status={remote.status} />}

        <StatCards coveragePct={stats.pct} covered={stats.covered} total={stats.total} issues={validation.issues.length} people={stats.people} />

        <h2 className="hidden text-lg font-bold print:block">
          Horario {MONTHS[ym.month - 1]} {ym.year} · Hotel Casa 1800
        </h2>

        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-xs sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 print:hidden" aria-label="Leyenda">
          {(["M", "T", "N", "S", "P", "MZ", "D", "V"] as const).map((c) => (
            <li key={c} className="glass flex shrink-0 items-center gap-2 rounded-full py-1 pl-1 pr-3 font-medium transition hover:-translate-y-0.5 hover:shadow-md">
              <span className={`grid h-6 w-7 place-items-center rounded-full text-[11px] font-bold ${SHIFT_STYLE[c]}`}>{displayCode(c)}</span>
              {SHIFTS[c].label}
              {SHIFTS[c].start && <span className="text-muted">{SHIFTS[c].start}–{SHIFTS[c].end}</span>}
            </li>
          ))}
        </ul>

        {remote.unpublished ? (
          <p className="glass rounded-2xl p-6 text-center font-medium">Este mes todavía no está publicado.</p>
        ) : (
          <ScheduleGrid
            key={`${ym.year}-${ym.month}`}
            readOnly={readOnly}
            today={today}
            year={ym.year}
            month={ym.month}
            staff={staff}
            schedule={h.present}
            validation={validation}
            onEdit={(edits) => dispatch({ type: "edit", edits })}
            onCalendar={exportICS}
          />
        )}

        <section aria-live="polite" className="glass rounded-2xl p-4 text-sm print:hidden">
          {validation.issues.length === 0 ? (
            <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckIcon width={18} height={18} /> Todas las reglas y coberturas se cumplen.
            </p>
          ) : (
            <>
              <p className="font-semibold text-red-600">{validation.issues.length} aviso(s)</p>
              <ul className="mt-2 space-y-1">
                {validation.issues.slice(0, 20).map((i, k) => (
                  <li key={k} className="anim-fade-up flex items-start gap-2" style={{ animationDelay: `${k * 25}ms` }}>
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                    {i.message}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <RosterPanel staff={staff} overrides={overrides} disabled={readOnly} onChange={changeDates} />
      </main>
    </>
  );
}
