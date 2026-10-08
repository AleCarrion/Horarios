"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { generateSchedule } from "@/lib/domain/generator";
import { applyEdits, applyRemote, createHistory, redo, undo, type Edit } from "@/lib/domain/history";
import { DEFAULT_STAFF } from "@/lib/domain/roster";
import { addStaff, changeRole, moveStaff, updateStaff } from "@/lib/domain/team";
import { clearScheduleCache, historyFor, lockedCount, nextStored, scheduleFor, peekFor, prevMonth, readLocks, readStored, scheduleForAsync, setLocked, storageKey, writeLocks, type Locks } from "@/lib/monthStore";
import { readRoster, writeRoster } from "@/lib/staffStore";
import { useRemoteStaff } from "@/lib/useRemoteStaff";
import { diffSchedules } from "@/lib/sync";
import { activeInMonth, isActive, type Role, type Schedule, type ShiftCode, type Staff } from "@/lib/domain/types";
import { validateSchedule } from "@/lib/domain/validate";
import { MONTHS, SHIFT_STYLE } from "@/lib/ui";
import { SHIFTS, displayCode } from "@/lib/domain/types";
import { firstEditable, planDayOff, planRestructure, planShiftSwap, type Plan, type RepairContext } from "@/lib/domain/repair";
import { decide, KIND_LABEL, planForRequest, requestMonth, type ShiftRequest } from "@/lib/domain/requests";
import { readRequests, writeRequests } from "@/lib/requestsStore";
import { downloadText } from "@/lib/download";
import { toCSV, toICS } from "@/lib/export";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useRemoteSchedule } from "@/lib/useRemoteSchedule";
import { AuthBar } from "./AuthBar";
import { ExportMenu } from "./ExportMenu";
import { ChevronLeft, ChevronRight, CheckIcon, InboxIcon, LockIcon, LogoMark, RedoIcon, SparklesIcon, UndoIcon } from "./icons";
import { RequestsPanel } from "./RequestsPanel";
import { TeamPanel } from "./TeamPanel";
import { PlanDialog } from "./PlanDialog";
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

/** Immediate content for a month: saved, already planned, or a quick plan without history (upgraded right after). */
function load(y: number, m: number): Schedule {
  const staff = readRoster();
  return peekFor(y, m, staff) ?? generateSchedule({ year: y, month: m, staff }).schedule;
}

export function ScheduleApp() {
  const now = new Date();
  const [ym, setYm] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 });
  const [h, dispatch] = useReducer(reducer, undefined, () =>
    createHistory(generateSchedule({ year: ym.year, month: ym.month, staff: DEFAULT_STAFF }).schedule),
  );

  const [staff, setStaff] = useState<Staff[]>(DEFAULT_STAFF);
  const [today, setToday] = useState<string | null>(null);
  const [locks, setLocks] = useState<Locks>({});
  const [plan, setPlan] = useState<{ plan: Plan; title: string; team?: Staff[]; request?: ShiftRequest } | null>(null);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  useEffect(() => {
    // localStorage / the clock are only safe to read after mount
    setStaff(readRoster()); // eslint-disable-line react-hooks/set-state-in-effect
    setRequests(readRequests());
    const t = new Date();
    setToday(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
  }, []);

  // People who are not on the roster at all this month (baja before it starts) are hidden from the grid.
  const visible = useMemo(() => staff.filter((p) => activeInMonth(p, ym.year, ym.month)), [staff, ym]);

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

  // The previous month (streaks and rest runs carry over); planned in the background so the page never freezes.
  const [history, setHistory] = useState<Schedule | undefined>(undefined);
  const dirty = useRef(false);
  useEffect(() => {
    dirty.current = h.changes.length > 0;
  });

  useEffect(() => {
    dispatch({ type: "reset", schedule: load(ym.year, ym.month) });
    setLocks(readLocks(ym.year, ym.month)); // eslint-disable-line react-hooks/set-state-in-effect
    let alive = true;
    const p = prevMonth(ym.year, ym.month);
    void (async () => {
      const prev = await scheduleForAsync(p.y, p.m, readRoster(), () => alive);
      if (!alive) return;
      setHistory(prev ?? undefined);
      const full = await scheduleForAsync(ym.year, ym.month, readRoster(), () => alive);
      // nothing saved and nothing edited yet: show the plan that continues from last month
      if (alive && full && !dirty.current && !readStored(ym.year, ym.month)) dispatch({ type: "reset", schedule: full });
    })();
    return () => {
      alive = false;
    };
  }, [ym]);

  useEffect(() => {
    if (!h.changes.length) return;
    try { localStorage.setItem(storageKey(ym.year, ym.month), JSON.stringify(h.present)); clearScheduleCache(); } catch {}
  }, [h.present, h.changes.length, ym]);


  const shown = plan?.plan.schedule ?? h.present; // while a request is previewed the grid shows it
  const validation = useMemo(
    () => validateSchedule(shown, visible, ym.year, ym.month, history),
    [shown, ym, visible, history],
  );

  const stats = useMemo(() => {
    const days = Object.values(validation.coverage);
    const total = days.length * 3;
    const covered = days.reduce((n, c) => n + Math.min(c.M, 1) + Math.min(c.T, 1) + Math.min(c.N, 1), 0);
    const first = `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
    const last = `${ym.year}-${String(ym.month).padStart(2, "0")}-${String(days.length).padStart(2, "0")}`;
    const people = visible.filter((p) => isActive(p, first) || isActive(p, last)).length;
    return { total, covered, pct: total ? Math.round((covered / total) * 100) : 100, people };
  }, [validation, visible, ym]);

  const shiftMonth = (delta: number) =>
    setYm(({ year, month }) => {
      const d = new Date(year, month - 1 + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() + 1 };
    });

  const regenerate = (list: Staff[] = staff) => {
    try { localStorage.removeItem(storageKey(ym.year, ym.month)); clearScheduleCache(); } catch {}
    // Holidays (V), days out of the roster (B) and JC's rest days are inputs: edit them in the grid, then regenerate around them.
    const unavailable: Record<string, Record<string, "V" | "B">> = {};
    for (const p of list) {
      const before = staff.find((x) => x.id === p.id); // dates as they were: a B outside them came from the old dates, not from a hand edit
      for (const [d, c] of Object.entries(h.present[p.id] ?? {})) {
        if (c === "B" && before && !isActive(before, d)) continue;
        if (c === "V" || c === "B") (unavailable[p.id] ??= {})[d] = c;
      }
    }
    const night = list.find((p) => p.role === "night_auditor");
    dispatch({
      type: "replace",
      schedule: generateSchedule({
        year: ym.year,
        month: ym.month,
        staff: list,
        seed: Date.now() % 97,
        history,
        unavailable,
        // manager-locked cells stay exactly as they are
        pinned: Object.fromEntries(
          list.map((p) => [p.id, Object.fromEntries(Object.keys(locks[p.id] ?? {}).filter((d) => locks[p.id][d] && h.present[p.id]?.[d]).map((d) => [d, h.present[p.id][d]]))]),
        ),
        jcRestDays: night
          ? Object.entries(h.present[night.id] ?? {}).filter(([, c]) => c === "D").map(([d]) => d)
          : undefined,
      }).schedule,
    });
  };

  // --- team: reorder / change puesto / rename / add / remove.
  // Order and names apply at once; anything that changes who works (puesto, dates, add, remove) is planned
  // around the rest of the month and shown as a preview first.
  const day = (iso: string, n: number) => {
    const [y, m, d] = iso.split("-").map(Number);
    const t = new Date(Date.UTC(y, m - 1, d + n));
    return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
  };
  const monthStart = `${ym.year}-${String(ym.month).padStart(2, "0")}-01`;
  /** First day that automatic changes may touch (today + protected days), or the 1st of the month. */
  const editableStart = () => {
    const f = firstEditable({ today: today ?? undefined });
    return f && f > monthStart ? f : monthStart;
  };
  const saveTeam = (next: Staff[]) => {
    setStaff(next);
    writeRoster(next);
  };
  const proposeTeam = (next: Staff[], title: string) => {
    if (next === staff) return;
    const result = planRestructure(
      { year: ym.year, month: ym.month, staff, schedule: h.present, today: today ?? undefined, history, next: nextStored(ym.year, ym.month), locked: locks },
      next,
      monthStart,
    );
    setPlan({ plan: result, title, team: next });
  };
  const onMovePerson = (id: string, role: Role, beforeId: string | null) => {
    const next = moveStaff(staff, id, role, beforeId);
    if (next === staff) return;
    const person = staff.find((x) => x.id === id);
    if (person?.role === role) saveTeam(next);
    else proposeTeam(next, `${person?.name}: nuevo puesto`);
  };
  const nudge = (id: string, dir: -1 | 1) => {
    const me = staff.find((x) => x.id === id);
    if (!me) return;
    const peers = staff.filter((x) => x.role === me.role);
    const i = peers.findIndex((x) => x.id === id);
    const j = i + dir;
    if (j < 0 || j >= peers.length) return;
    const before = dir === -1 ? peers[j].id : (peers[j + 1]?.id ?? null);
    saveTeam(moveStaff(staff, id, me.role, before));
  };
  const changeDates = (id: string, field: "activeFrom" | "activeTo", value: string) =>
    proposeTeam(updateStaff(staff, id, { [field]: value || undefined }), `${staff.find((x) => x.id === id)?.name}: ${field === "activeFrom" ? "alta" : "baja"}`);
  const addPerson = (name: string, role: Role) => {
    const next = addStaff(staff, { name, role });
    const added = next.find((x) => !staff.some((y) => y.id === x.id));
    // a new person starts on the first day that can still change, never in the past
    proposeTeam(added ? updateStaff(next, added.id, { activeFrom: editableStart() }) : next, `Nueva persona: ${name.trim()}`);
  };
  /** "Eliminar" = baja from the first editable day: they stay in past months and disappear from future ones. */
  const removePerson = (id: string) => {
    const person = staff.find((x) => x.id === id);
    proposeTeam(updateStaff(staff, id, { activeTo: day(editableStart(), -1) }), `${person?.name}: baja`);
  };

  const staffRemote = useRemoteStaff({
    auth,
    staff,
    onLoaded: (team) => {
      setStaff(team);
      writeRoster(team);
    },
  });

  // --- day off / holidays requests: plan the whole month around them and show a preview first
  const requestDays = (staffId: string, from: string, kind: "D" | "V", days: number) => {
    const person = staff.find((x) => x.id === staffId);
    const all = Object.keys(h.present[staffId] ?? {}).sort();
    const to = all[Math.min(all.indexOf(from) + days - 1, all.length - 1)] ?? from;
    const result = planDayOff(
      { year: ym.year, month: ym.month, staff, schedule: h.present, today: today ?? undefined, history, next: nextStored(ym.year, ym.month), locked: locks },
      staffId,
      from,
      kind,
      to,
    );
    const label = kind === "V" ? "Vacaciones" : "Libre solicitado";
    setPlan({
      plan: result,
      title: `${label} · ${person?.name} · ${Number(from.slice(8))}${to !== from ? `–${Number(to.slice(8))}` : ""} ${MONTHS[ym.month - 1].toLowerCase()}`,
    });
  };
  const requestSwap = (a: string, b: string, date: string, returnDate?: string) => {
    const pa = staff.find((x) => x.id === a);
    const pb = staff.find((x) => x.id === b);
    const result = planShiftSwap({ year: ym.year, month: ym.month, staff, schedule: h.present, today: today ?? undefined, history, next: nextStored(ym.year, ym.month), locked: locks }, a, b, date, returnDate);
    setPlan({
      plan: result,
      title: `Cambio de turno · ${pa?.name} ↔ ${pb?.name} · ${Number(date.slice(8))}${returnDate ? ` y ${Number(returnDate.slice(8))}` : ""} ${MONTHS[ym.month - 1].toLowerCase()}`,
    });
  };
  const applyPlan = () => {
    if (!plan) return;
    if (plan.team) saveTeam(plan.team);
    if (plan.request) saveRequests(requests.map((x) => (x.id === plan.request!.id ? decide(x, "approved") : x)));
    dispatch({ type: "replace", schedule: plan.plan.schedule });
    if (plan.plan.pins.length) {
      // what was asked for (and approved) stays as decided
      const next = setLocked(locks, plan.plan.pins, true);
      setLocks(next);
      writeLocks(ym.year, ym.month, next);
    }
    setPlan(null);
  };
  const previewCells = useMemo(() => new Set(plan && !plan.team ? plan.plan.changes.map((c) => `${c.staffId}|${c.date}`) : []), [plan]);

  // --- requests inbox: every request is planned on its own month and approved through the same preview
  const saveRequests = (next: ShiftRequest[]) => {
    setRequests(next);
    writeRequests(next);
  };
  const ctxFor = (y: number, m: number): RepairContext => {
    const current = y === ym.year && m === ym.month;
    return {
      year: y,
      month: m,
      staff,
      schedule: current ? h.present : scheduleFor(y, m, staff),
      today: today ?? undefined,
      history: current ? history : historyFor(y, m, staff),
      next: nextStored(y, m),
      locked: current ? locks : readLocks(y, m),
    };
  };
  // a new object whenever the schedule, locks, team or date change: the inbox recalculates its traffic lights
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const requestsVersion = useMemo(() => ({ present: h.present, locks, staff, today }), [h.present, locks, staff, today]);
  const evaluateRequest = (r: ShiftRequest): Plan | null => {
    const { year, month } = requestMonth(r);
    return planForRequest(ctxFor(year, month), r);
  };
  const reviewRequest = (r: ShiftRequest, p: Plan) => {
    const { year, month } = requestMonth(r);
    setYm({ year, month }); // show the month the request is about
    setPanelOpen(false);
    const who = staff.find((x) => x.id === r.staffId)?.name;
    setPlan({ plan: p, title: `${KIND_LABEL[r.kind]} · ${who} · ${Number(r.date.slice(8))}${r.endDate && r.endDate !== r.date ? `–${Number(r.endDate.slice(8))}` : ""} ${MONTHS[month - 1].toLowerCase()}`, request: r });
  };
  const rejectRequest = (r: ShiftRequest, note: string) => saveRequests(requests.map((x) => (x.id === r.id ? decide(x, "rejected", note) : x)));

  const changeLocks = (staffId: string, dates: string[], on: boolean) => {
    const next = setLocked(locks, dates.map((date) => ({ staffId, date })), on);
    setLocks(next);
    writeLocks(ym.year, ym.month, next);
  };
  /** A manual edit is a decision: lock it so later re-plans do not undo it. */
  const editCells = (edits: { staffId: string; date: string; to: ShiftCode }[]) => {
    dispatch({ type: "edit", edits });
    const next = setLocked(locks, edits, true);
    setLocks(next);
    writeLocks(ym.year, ym.month, next);
  };
  const unlockAll = () => {
    setLocks({});
    writeLocks(ym.year, ym.month, {});
  };

  const fileBase = `horario-${ym.year}-${String(ym.month).padStart(2, "0")}`;
  const exportCSV = () =>
    downloadText(`${fileBase}.csv`, toCSV(h.present, visible, ym.year, ym.month), "text/csv");
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
            <button
              onClick={() => setPanelOpen(true)}
              aria-label={`Solicitudes (${requests.filter((r) => r.status === "pending").length} pendientes)`}
              title="Solicitudes"
              className={`${iconBtn} relative`}
            >
              <InboxIcon />
              {requests.some((r) => r.status === "pending") && (
                <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white shadow">
                  {requests.filter((r) => r.status === "pending").length}
                </span>
              )}
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
        {remoteConfigured && <AuthBar auth={auth} status={staffRemote.pending && remote.status === "synced" ? "pending" : remote.status} />}

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

        {lockedCount(locks) > 0 && (
          <p className="glass anim-fade-up flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm print:hidden">
            <LockIcon width={14} height={14} className="text-muted" />
            {lockedCount(locks)} casilla{lockedCount(locks) === 1 ? "" : "s"} bloqueada{lockedCount(locks) === 1 ? "" : "s"}: no se mueven al reajustar ni al generar.
            <button onClick={unlockAll} className="font-semibold text-brand underline-offset-2 hover:underline">Quitar todos los bloqueos</button>
          </p>
        )}

        {remote.unpublished ? (
          <p className="glass rounded-2xl p-6 text-center font-medium">Este mes todavía no está publicado.</p>
        ) : (
          <ScheduleGrid
            key={`${ym.year}-${ym.month}`}
            readOnly={readOnly}
            today={today}
            year={ym.year}
            month={ym.month}
            staff={visible}
            schedule={plan?.team ? h.present : shown}
            validation={validation}
            onEdit={editCells}
            locked={locks}
            onLock={readOnly ? undefined : changeLocks}
            onCalendar={exportICS}
            onMove={readOnly ? undefined : onMovePerson}
            onPlan={readOnly ? undefined : requestDays}
            onSwap={readOnly ? undefined : requestSwap}
            preview={previewCells}
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

        <TeamPanel
          staff={staff}
          disabled={readOnly}
          onRename={(id, name) => saveTeam(updateStaff(staff, id, { name }))}
          onRole={(id, role) => proposeTeam(changeRole(staff, id, role), `${staff.find((x) => x.id === id)?.name}: nuevo puesto`)}
          onDates={changeDates}
          onNudge={nudge}
          onRemove={removePerson}
          onAdd={addPerson}
        />
      </main>
      <RequestsPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        requests={requests}
        staff={staff}
        evaluate={evaluateRequest}
        onCreate={(rs) => saveRequests([...requests, ...rs])}
        onReview={reviewRequest}
        onReject={rejectRequest}
        version={requestsVersion}
        disabled={readOnly}
      />
      {plan && <PlanDialog plan={plan.plan} title={plan.title} staff={plan.team ?? staff} onApply={applyPlan} onCancel={() => setPlan(null)} />}
    </>
  );
}
