"use client";

import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { generateSchedule } from "@/lib/domain/generator";
import { applyEdits, applyRemote, createHistory, redo, undo, type Edit } from "@/lib/domain/history";
import { DEFAULT_STAFF } from "@/lib/domain/roster";
import { monthDates, weeksOf } from "@/lib/domain/dates";
import { moveStaff } from "@/lib/domain/team";
import { applyTeamChange, planTeamChange, type MonthPlan } from "@/lib/teamPlanning";
import { useTeam } from "@/lib/useTeam";
import { clearScheduleCache, historyFor, lockedCount, nextStored, scheduleFor, peekFor, prevMonth, readLocks, readStored, scheduleForAsync, setLocked, storageKey, writeLocks, type Locks } from "@/lib/monthStore";
import { readRoster } from "@/lib/staffStore";
import { useRemoteLocks } from "@/lib/useRemoteLocks";
import { useRemoteRequests } from "@/lib/useRemoteRequests";
import { diffSchedules } from "@/lib/sync";
import { activeInMonth, isActive, type Role, type Schedule, type ShiftCode, type Staff } from "@/lib/domain/types";
import { validateSchedule } from "@/lib/domain/validate";
import { MONTHS, SHIFT_STYLE } from "@/lib/ui";
import { SHIFTS, displayCode } from "@/lib/domain/types";
import { planAbsence, planDayOff, planFix, planShiftPref, planShiftSwap, type Plan, type RepairContext } from "@/lib/domain/repair";
import { decide, KIND_LABEL, planForRequest, requestMonth, type ShiftRequest } from "@/lib/domain/requests";
import { readRequests, writeRequests } from "@/lib/requestsStore";
import { downloadText } from "@/lib/download";
import { backupName, createBackup, describeBackup, parseBackup, restoreBackup, type Backup } from "@/lib/backup";
import { toCSV, toICS } from "@/lib/export";
import { remoteConfigured } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { useRemoteSchedule } from "@/lib/useRemoteSchedule";
import { AuthBar } from "./AuthBar";
import { ExportMenu } from "./ExportMenu";
import { ChevronLeft, ChevronRight, CheckIcon, ClockIcon, DownloadIcon, InboxIcon, LockIcon, LogoMark, MoreIcon, PrinterIcon, TableIcon, RedoIcon, SparklesIcon, UndoIcon } from "./icons";
import { RequestsPanel } from "./RequestsPanel";
import { ActionSheet, type SheetAction } from "./ActionSheet";
import { AppNav } from "./AppNav";
import { MobileTabBar } from "./MobileTabBar";
import { ConfirmDialog } from "./ConfirmDialog";
import { PlanDialog } from "./PlanDialog";
import { MonthSummary } from "./MonthSummary";
import { suggestFor } from "@/lib/domain/suggest";
import { HistoryPanel } from "./HistoryPanel";
import { appendEntry, diffCells, type LogEntry } from "@/lib/domain/changeLog";
import { readLog, writeLog } from "@/lib/changeLogStore";
import { DEFAULT_RULES, localHolidaysOf, type Rules } from "@/lib/domain/ruleset";
import { readRules } from "@/lib/rulesStore";
import { isMonthClosed, monthLabel, type MonthState } from "@/lib/domain/monthStatus";
import { readMonthState, writeMonthState } from "@/lib/monthStatusStore";
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
  const [h, rawDispatch] = useReducer(reducer, undefined, () =>
    createHistory(generateSchedule({ year: ym.year, month: ym.month, staff: DEFAULT_STAFF }).schedule),
  );

  // Every change made by hand is written to this month's change log (what, who it touched, when), so it can be reviewed and undone cell by cell.
  const lastAction = useRef<Action["type"] | null>(null);
  const logLabel = useRef<string | null>(null);
  const logBase = useRef<Schedule | null>(null);
  const dispatch = (a: Action) => {
    lastAction.current = a.type;
    rawDispatch(a);
  };
  const [log, setLog] = useState<LogEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const [today, setToday] = useState<string | null>(null);
  const [locks, setLocks] = useState<Locks>({});
  const [plan, setPlan] = useState<{ plan: Plan; title: string; request?: ShiftRequest; retry?: (locked: Locks) => void } | null>(null);
  const [teamProposal, setTeamProposal] = useState<{ title: string; next: Staff[]; plans: MonthPlan[] } | null>(null);
  const [requests, setRequests] = useState<ShiftRequest[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  // On phones the month is shown a week at a time: 7 big columns instead of 31 tiny ones
  const [rules, setRules] = useState<Rules>(DEFAULT_RULES);
  const [view, setView] = useState<"week" | "month">("month");
  const [weekIdx, setWeekIdx] = useState(0);
  useEffect(() => {
    // localStorage / the clock are only safe to read after mount
    setRequests(readRequests()); // eslint-disable-line react-hooks/set-state-in-effect
    setRules(readRules());
    if (window.matchMedia("(max-width: 639px)").matches) setView("week");
    if (new URLSearchParams(window.location.search).get("solicitudes")) setPanelOpen(true);
    const t = new Date();
    setToday(`${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`);
  }, []);

  const auth = useAuth();
  const team = useTeam(auth);
  const staff = team.staff;

  // People who are not on the roster at all this month (baja before it starts) are hidden from the grid.
  const visible = useMemo(() => staff.filter((p) => activeInMonth(p, ym.year, ym.month)), [staff, ym]);

  const remote = useRemoteSchedule({
    year: ym.year,
    month: ym.month,
    present: h.present,
    auth,
    onLoaded: (s) => dispatch({ type: "reset", schedule: s ?? load(ym.year, ym.month) }),
    onRemoteCell: (r) => dispatch({ type: "remote", staffId: r.staff_id, date: r.day, code: r.shift_code }),
  });
  const remoteReadOnly = remoteConfigured && !remote.canEdit;
  // a published month, or one that is over, is not edited by accident: reopen it first
  const [monthState, setMonthState] = useState<MonthState | null>(null);
  useEffect(() => {
    setMonthState(readMonthState(ym.year, ym.month)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [ym]);
  const label = monthLabel(monthState, ym.year, ym.month, today);
  const closed = isMonthClosed(monthState, ym.year, ym.month, today);
  const readOnly = remoteReadOnly || closed;
  const setState = (s: MonthState | null) => {
    setMonthState(s);
    writeMonthState(ym.year, ym.month, s);
  };

  const weeks = useMemo(() => weeksOf(monthDates(ym.year, ym.month)), [ym]);
  useEffect(() => {
    const i = today ? weeks.findIndex((w) => w.includes(today)) : -1;
    setWeekIdx(i >= 0 ? i : 0); // eslint-disable-line react-hooks/set-state-in-effect
  }, [weeks, today]);
  const swipe = useRef<number | null>(null);
  const goWeek = (d: number) => setWeekIdx((i) => Math.min(weeks.length - 1, Math.max(0, i + d)));
  const weekLabel = (() => {
    const w = weeks[Math.min(weekIdx, weeks.length - 1)] ?? [];
    return w.length ? `${Number(w[0].slice(8))}–${Number(w.at(-1)!.slice(8))} ${MONTHS[ym.month - 1].slice(0, 3).toLowerCase()}` : "";
  })();

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


  useEffect(() => {
    setLog(readLog(ym.year, ym.month)); // eslint-disable-line react-hooks/set-state-in-effect
  }, [ym]);
  useEffect(() => {
    const act = lastAction.current;
    lastAction.current = null;
    const base = logBase.current;
    logBase.current = h.present;
    if (!act || !base || act === "reset" || act === "remote") return;
    const cells = diffCells(base, h.present);
    if (!cells.length) return;
    const label = logLabel.current ?? { edit: "Edición manual", undo: "Deshacer", redo: "Rehacer", replace: "Cambio automático" }[act];
    logLabel.current = null;
    setLog((cur) => {
      const next = appendEntry(cur, { at: new Date().toISOString(), label, cells });
      writeLog(ym.year, ym.month, next);
      return next;
    });
  }, [h.present, ym]);

  const shown = plan?.plan.schedule ?? h.present; // while a request is previewed the grid shows it
  const validation = useMemo(
    () => validateSchedule(shown, visible, ym.year, ym.month, history, rules),
    [shown, ym, visible, history, rules],
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
    const unavailable: Record<string, Record<string, "V" | "A" | "B">> = {};
    for (const p of list) {
      const before = staff.find((x) => x.id === p.id); // dates as they were: a B outside them came from the old dates, not from a hand edit
      for (const [d, c] of Object.entries(h.present[p.id] ?? {})) {
        if (c === "B" && before && !isActive(before, d)) continue;
        if (c === "V" || c === "A" || c === "B") (unavailable[p.id] ??= {})[d] = c;
      }
    }
    const night = list.find((p) => p.role === "night_auditor");
    logLabel.current = "Generar automático";
    dispatch({
      type: "replace",
      schedule: generateSchedule({
        year: ym.year,
        month: ym.month,
        staff: list,
        rules,
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

  // --- team: a drag in the grid that changes someone's puesto is planned over every affected month and previewed;
  // the rest of the team management (add, baja, dates, names) lives on the Equipo page.
  const onMovePerson = (id: string, role: Role, beforeId: string | null) => {
    const next = moveStaff(staff, id, role, beforeId);
    if (next === staff || !today) return;
    const person = staff.find((x) => x.id === id);
    if (person?.role === role) return team.saveTeam(next);
    setTeamProposal({ title: `${person?.name}: nuevo puesto`, next, plans: planTeamChange(staff, next, today) });
  };
  const applyTeamProposal = () => {
    if (!teamProposal) return;
    applyTeamChange(teamProposal.next, teamProposal.plans);
    team.saveTeam(teamProposal.next);
    dispatch({ type: "reset", schedule: load(ym.year, ym.month) });
    setTeamProposal(null);
  };

  // --- day off / holidays requests: plan the whole month around them and show a preview first
  /** Plans, adds the ways out when it does not fit, and shows the preview. `retry` re-opens it after the manager released some locks. */
  const present = (title: string, ctx: RepairContext, run: (c: RepairContext) => Plan, retry: (locked: Locks) => void, request?: ShiftRequest) => {
    const p = run(ctx);
    setPlan({ plan: { ...p, suggestions: suggestFor(ctx, p, run) }, title, request, retry });
  };
  const requestDays = (staffId: string, from: string, kind: "D" | "V" | "A" | "M" | "T" | "N", days: number, lockedNow: Locks = locks) => {
    const person = staff.find((x) => x.id === staffId);
    const all = Object.keys(h.present[staffId] ?? {}).sort();
    const to = all[Math.min(all.indexOf(from) + days - 1, all.length - 1)] ?? from;
    const ctx: RepairContext = { year: ym.year, month: ym.month, staff, schedule: h.present, today: today ?? undefined, history, next: nextStored(ym.year, ym.month), locked: lockedNow, rules };
    const run = (c: RepairContext) => (kind === "M" || kind === "T" || kind === "N" ? planShiftPref(c, staffId, from, to, kind) : kind === "A" ? planAbsence(c, staffId, from, to) : planDayOff(c, staffId, from, kind, to));
    const label = kind === "V" ? "Vacaciones" : kind === "A" ? "Ausencia imprevista" : kind === "D" ? "Libre solicitado" : `Turno pedido (${{ M: "mañanas", T: "tardes", N: "noches" }[kind]})`;
    present(`${label} · ${person?.name} · ${Number(from.slice(8))}${to !== from ? `–${Number(to.slice(8))}` : ""} ${MONTHS[ym.month - 1].toLowerCase()}`, ctx, run, (l) => requestDays(staffId, from, kind, days, l));
  };
  const requestSwap = (a: string, b: string, date: string, returnDate?: string, lockedNow: Locks = locks) => {
    const pa = staff.find((x) => x.id === a);
    const pb = staff.find((x) => x.id === b);
    const ctx: RepairContext = { year: ym.year, month: ym.month, staff, schedule: h.present, today: today ?? undefined, history, next: nextStored(ym.year, ym.month), locked: lockedNow, rules };
    present(
      `Cambio de turno · ${pa?.name} ↔ ${pb?.name} · ${Number(date.slice(8))}${returnDate ? ` y ${Number(returnDate.slice(8))}` : ""} ${MONTHS[ym.month - 1].toLowerCase()}`,
      ctx,
      (c) => planShiftSwap(c, a, b, date, returnDate),
      (l) => requestSwap(a, b, date, returnDate, l),
    );
  };
  const fixIssues = (lockedNow: Locks = locks) => {
    const ctx: RepairContext = { year: ym.year, month: ym.month, staff, schedule: h.present, today: today ?? undefined, history, next: nextStored(ym.year, ym.month), locked: lockedNow, rules };
    present(`Arreglar avisos · ${MONTHS[ym.month - 1].toLowerCase()}`, ctx, planFix, (l) => fixIssues(l));
  };
  /** Jump to the day an issue is about: right week, scrolled into view, highlighted. */
  const showIssue = (date: string, staffId?: string) => {
    const w = weeks.findIndex((x) => x.includes(date));
    if (w >= 0) setWeekIdx(w);
    setTimeout(() => {
      const sel = staffId ? `[data-row="${staffId}"][data-col="${date}"]` : `[data-colhead="${date}"]`;
      const el = document.querySelector<HTMLElement>(sel);
      if (!el) return;
      el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      el.classList.remove("flash-cell");
      void el.offsetWidth;
      el.classList.add("flash-cell");
    }, 80);
  };
  /** The manager accepts a suggestion: release those locked cells and plan again. */
  const releaseAndRetry = (cells: { staffId: string; date: string }[]) => {
    const month = (d: string) => `${d.slice(0, 4)}-${Number(d.slice(5, 7))}`;
    const here = `${ym.year}-${ym.month}`;
    const next = setLocked(locks, cells.filter((c) => month(c.date) === here), false);
    setLocks(next);
    writeLocks(ym.year, ym.month, next);
    for (const key of new Set(cells.map((c) => month(c.date)).filter((k) => k !== here))) {
      const [y, m] = key.split("-").map(Number);
      writeLocks(y, m, setLocked(readLocks(y, m), cells.filter((c) => month(c.date) === key), false));
    }
    plan?.retry?.(next);
  };
  const applyPlan = () => {
    if (!plan) return;
    if (plan.request) saveRequests(requests.map((x) => (x.id === plan.request!.id ? decide(x, "approved") : x)));
    logLabel.current = plan.title;
    dispatch({ type: "replace", schedule: plan.plan.schedule });
    if (plan.plan.pins.length) {
      // what was asked for (and approved) stays as decided
      const next = setLocked(locks, plan.plan.pins, true);
      setLocks(next);
      writeLocks(ym.year, ym.month, next);
    }
    setPlan(null);
  };
  const previewCells = useMemo(() => new Set(plan ? plan.plan.changes.map((c) => `${c.staffId}|${c.date}`) : []), [plan]);

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
      rules,
    };
  };
  // a new object whenever the schedule, locks, team or date change: the inbox recalculates its traffic lights
  const requestsVersion = useMemo(() => ({ present: h.present, locks, staff, today }), [h.present, locks, staff, today]);
  const evaluateRequest = (r: ShiftRequest): Plan | null => {
    const { year, month } = requestMonth(r);
    return planForRequest(ctxFor(year, month), r);
  };
  const reviewRequest = (r: ShiftRequest, p: Plan, lockedNow?: Locks) => {
    const { year, month } = requestMonth(r);
    setYm({ year, month }); // show the month the request is about
    setPanelOpen(false);
    const who = staff.find((x) => x.id === r.staffId)?.name;
    const ctx = { ...ctxFor(year, month), ...(lockedNow ? { locked: lockedNow } : {}) };
    const run = (c: RepairContext) => planForRequest(c, r);
    const shown = lockedNow ? run(ctx) : p;
    setPlan({
      plan: { ...shown, suggestions: suggestFor(ctx, shown, run) },
      title: `${KIND_LABEL[r.kind]} · ${who} · ${Number(r.date.slice(8))}${r.endDate && r.endDate !== r.date ? `–${Number(r.endDate.slice(8))}` : ""} ${MONTHS[month - 1].toLowerCase()}`,
      request: r,
      retry: (l) => reviewRequest(r, p, l),
    });
  };
  const rejectRequest = (r: ShiftRequest, note: string) => saveRequests(requests.map((x) => (x.id === r.id ? decide(x, "rejected", note) : x)));

  const requestsRemote = useRemoteRequests({
    auth,
    requests,
    onLoaded: (rs) => {
      setRequests(rs);
      writeRequests(rs);
    },
  });
  const locksRemote = useRemoteLocks({
    auth,
    year: ym.year,
    month: ym.month,
    locks,
    onLoaded: (l) => {
      setLocks(l);
      writeLocks(ym.year, ym.month, l);
    },
  });

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

  const printMonth = () => {
    setView("month"); // a printout always shows the whole month
    setTimeout(() => window.print(), 150);
  };

  const fileBase = `horario-${ym.year}-${String(ym.month).padStart(2, "0")}`;
  // --- backup of everything on this device
  const restoreInput = useRef<HTMLInputElement>(null);
  const [restoring, setRestoring] = useState<{ backup: Backup } | null>(null);
  const [backupError, setBackupError] = useState<string | null>(null);
  const saveBackup = () => {
    const b = createBackup(localStorage);
    downloadText(backupName(b), JSON.stringify(b), "application/json");
  };
  const readBackupFile = async (file: File | undefined) => {
    if (!file) return;
    const parsed = parseBackup(await file.text());
    if (parsed.ok) setRestoring({ backup: parsed.backup });
    else setBackupError(parsed.error);
  };
  const exportCSV = () =>
    downloadText(`${fileBase}.csv`, toCSV(h.present, visible, ym.year, ym.month), "text/csv");
  const exportICS = (person: Staff) =>
    downloadText(`${fileBase}-${person.id}.ics`, toICS(h.present, person, ym.year, ym.month), "text/calendar");

  const sheetActions: SheetAction[] = [
    { label: "Deshacer", icon: <UndoIcon />, onClick: () => dispatch({ type: "undo" }), disabled: readOnly || !h.past.length },
    { label: "Rehacer", icon: <RedoIcon />, onClick: () => dispatch({ type: "redo" }), disabled: readOnly || !h.future.length },
    { label: "Exportar PDF / imprimir", hint: "Una página A4 apaisada con todo el mes", icon: <PrinterIcon />, onClick: printMonth },
    { label: "Exportar CSV (Excel)", icon: <TableIcon />, onClick: exportCSV },
    { label: "Guardar copia de seguridad", hint: "Descarga todo: equipo, meses, solicitudes y bloqueos", icon: <DownloadIcon />, onClick: saveBackup },
    ...(remoteReadOnly ? [] : [{ label: "Restaurar copia de seguridad", icon: <DownloadIcon />, onClick: () => restoreInput.current?.click() }]),
    ...(remote.draft ? [{ label: "Publicar mes", icon: <DownloadIcon />, onClick: () => void remote.publish() }] : []),
    { label: "Historial de cambios", icon: <ClockIcon />, onClick: () => setHistoryOpen(true) },
    { label: "Generar automático", hint: "Rehace el calendario del mes", icon: <SparklesIcon />, onClick: () => setConfirmRegenerate(true), disabled: readOnly, tone: "accent" as const },
  ];

  const iconBtn =
    "glass grid h-10 w-10 place-items-center rounded-xl transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-35 focus-visible:outline-2 focus-visible:outline-brand";

  return (
    <>
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 print:hidden">
        {/* phones: one slim bar (logo, month, more) — the rest lives in the bottom tab bar and the action sheet */}
        <div className="flex items-center gap-2 px-3 py-2 pt-[calc(0.5rem+env(safe-area-inset-top))] sm:hidden">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand to-brand-2 shadow-md shadow-brand/30">
            <LogoMark width={24} height={24} />
          </span>
          <div className="flex min-w-0 flex-1 items-center justify-between rounded-2xl border border-line bg-card-solid/70 p-0.5">
            <button className="grid h-10 w-10 place-items-center rounded-xl active:bg-brand/10" onClick={() => shiftMonth(-1)} aria-label="Mes anterior">
              <ChevronLeft />
            </button>
            <span key={`m-${ym.year}-${ym.month}`} className="anim-slide truncate text-base font-bold" aria-live="polite">
              {MONTHS[ym.month - 1]} <span className="font-medium text-muted">{ym.year}</span>
            </span>
            <button className="grid h-10 w-10 place-items-center rounded-xl active:bg-brand/10" onClick={() => shiftMonth(1)} aria-label="Mes siguiente">
              <ChevronRight />
            </button>
          </div>
          <button className="glass grid h-11 w-11 shrink-0 place-items-center rounded-xl active:scale-95" onClick={() => setSheetOpen(true)} aria-label="Más acciones">
            <MoreIcon />
          </button>
        </div>
        <div className="mx-auto w-full max-w-[1500px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 max-sm:hidden sm:flex">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 shadow-lg shadow-brand/30">
              <LogoMark />
            </span>
            <div className="leading-tight">
              <h1 className="text-lg font-bold tracking-tight">Horarios</h1>
              <p className="text-xs text-muted">Hotel Casa 1800</p>
            </div>
          </div>

          <AppNav />

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
            <button className={iconBtn} onClick={() => setHistoryOpen(true)} aria-label="Historial de cambios" title="Historial de cambios">
              <ClockIcon />
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
            <ExportMenu onPdf={printMonth} onCsv={exportCSV} onBackup={saveBackup} onRestore={remoteReadOnly ? undefined : () => restoreInput.current?.click()} />
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
              onClick={() => setConfirmRegenerate(true)}
              className="group flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:-translate-y-0.5 hover:shadow-xl active:translate-y-0 active:scale-95 disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              <SparklesIcon width={16} height={16} className="transition-transform group-hover:rotate-12 group-hover:scale-125" />
              Generar<span className="hidden sm:inline"> automático</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full min-w-0 max-w-[1500px] space-y-4 p-4">
        {remoteConfigured && <AuthBar auth={auth} status={(team.pending || requestsRemote.pending || locksRemote.pending) && remote.status === "synced" ? "pending" : remote.status} />}

        <StatCards coveragePct={stats.pct} covered={stats.covered} total={stats.total} issues={validation.issues.length} people={stats.people} />

        <h2 className="hidden text-lg font-bold print:block">
          Horario {MONTHS[ym.month - 1]} {ym.year} · Hotel Casa 1800
        </h2>

        <ul className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 text-xs sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 print:hidden" aria-label="Leyenda">
          {(["M", "T", "N", "S", "P", "MZ", "D", "V", "A"] as const).map((c) => (
            <li key={c} className="glass flex shrink-0 items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-xs font-medium sm:gap-2 sm:py-1 sm:pl-1 sm:pr-3 transition hover:-translate-y-0.5 hover:shadow-md">
              <span className={`grid h-6 w-7 place-items-center rounded-full text-[11px] font-bold ${SHIFT_STYLE[c]}`}>{displayCode(c)}</span>
              {SHIFTS[c].label}
              {SHIFTS[c].start && <span className="text-muted max-sm:hidden">{SHIFTS[c].start}–{SHIFTS[c].end}</span>}
            </li>
          ))}
        </ul>

        {!remoteConfigured && (
          <p className={`glass anim-fade-up flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl px-3 py-2 text-sm print:hidden ${closed ? "border-amber-400/60" : ""}`}>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${closed ? "bg-amber-400/30 text-amber-900 dark:text-amber-200" : "bg-brand/10 text-brand"}`}>
              {{ draft: "Borrador", published: "Publicado", past: "Mes cerrado", reopened: "Reabierto" }[label]}
            </span>
            <span className="min-w-0 flex-1 text-muted">
              {label === "published" && "Este mes está dado por bueno: no se edita ni se rehace por accidente."}
              {label === "past" && "Este mes ya ha pasado: está protegido para que no se cambie sin querer."}
              {label === "reopened" && "Abierto para corregir algo. Vuelve a publicarlo cuando termines."}
              {label === "draft" && "Todavía lo estás preparando. Publícalo cuando esté listo."}
            </span>
            {closed ? (
              <button onClick={() => setState({ state: "reopened", at: new Date().toISOString() })} className="font-semibold text-brand underline-offset-2 hover:underline">Reabrir para editar</button>
            ) : (
              <button onClick={() => setState({ state: "published", at: new Date().toISOString() })} className="font-semibold text-brand underline-offset-2 hover:underline">Publicar mes</button>
            )}
          </p>
        )}

        {lockedCount(locks) > 0 && (
          <p className="glass anim-fade-up flex flex-wrap items-center gap-2 rounded-xl px-3 py-2 text-sm print:hidden">
            <LockIcon width={14} height={14} className="text-muted" />
            {lockedCount(locks)} casilla{lockedCount(locks) === 1 ? "" : "s"} bloqueada{lockedCount(locks) === 1 ? "" : "s"}: no se mueven al reajustar ni al generar.
            <button onClick={unlockAll} className="font-semibold text-brand underline-offset-2 hover:underline">Quitar todos los bloqueos</button>
          </p>
        )}

        <div className="flex items-center gap-2 sm:hidden print:hidden">
          <div role="group" aria-label="Vista del horario" className="flex rounded-2xl border border-line bg-card-solid/70 p-0.5 text-sm font-semibold">
            {(["week", "month"] as const).map((v) => (
              <button
                key={v}
                aria-pressed={view === v}
                onClick={() => setView(v)}
                className={`min-h-9 rounded-xl px-3.5 transition ${view === v ? "bg-brand text-white shadow" : "text-muted"}`}
              >
                {v === "week" ? "Semana" : "Mes"}
              </button>
            ))}
          </div>
          {view === "week" && (
            <div className="ml-auto flex items-center gap-1 rounded-2xl border border-line bg-card-solid/70 p-0.5">
              <button className="grid h-9 w-9 place-items-center rounded-xl active:bg-brand/10 disabled:opacity-30" onClick={() => goWeek(-1)} disabled={weekIdx === 0} aria-label="Semana anterior">
                <ChevronLeft width={18} height={18} />
              </button>
              <span className="min-w-20 text-center text-sm font-bold" aria-live="polite">{weekLabel}</span>
              <button className="grid h-9 w-9 place-items-center rounded-xl active:bg-brand/10 disabled:opacity-30" onClick={() => goWeek(1)} disabled={weekIdx >= weeks.length - 1} aria-label="Semana siguiente">
                <ChevronRight width={18} height={18} />
              </button>
            </div>
          )}
        </div>

        {remote.unpublished ? (
          <p className="glass rounded-2xl p-6 text-center font-medium">Este mes todavía no está publicado.</p>
        ) : (
          <div
            onTouchStart={(e) => {
              swipe.current = view === "week" && e.touches.length === 1 ? e.touches[0].clientX : null;
            }}
            onTouchEnd={(e) => {
              if (swipe.current === null) return;
              const dx = e.changedTouches[0].clientX - swipe.current;
              swipe.current = null;
              if (Math.abs(dx) > 70) goWeek(dx < 0 ? 1 : -1);
            }}
          >
          <ScheduleGrid
            key={`${ym.year}-${ym.month}`}
            readOnly={readOnly}
            today={today}
            year={ym.year}
            month={ym.month}
            dates={view === "week" ? weeks[Math.min(weekIdx, weeks.length - 1)] : undefined}
            compact={view === "week"}
            staff={visible}
            schedule={shown}
            validation={validation}
            onEdit={editCells}
            locked={locks}
            onLock={readOnly ? undefined : changeLocks}
            onCalendar={exportICS}
            onMove={readOnly ? undefined : onMovePerson}
            onPlan={readOnly ? undefined : requestDays}
            onSwap={readOnly ? undefined : requestSwap}
            preview={previewCells}
            holidays={localHolidaysOf(rules, ym.year)}
          />
          </div>
        )}

        <section aria-live="polite" className="glass rounded-2xl p-4 text-sm print:hidden">
          {validation.issues.length === 0 ? (
            <p className="flex items-center gap-2 font-semibold text-emerald-600 dark:text-emerald-400">
              <CheckIcon width={18} height={18} /> Todas las reglas y coberturas se cumplen.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-red-600">{validation.issues.length} aviso(s)</p>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => fixIssues()}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-brand px-4 text-sm font-semibold text-white shadow transition hover:brightness-110 active:scale-95"
                  >
                    <SparklesIcon width={16} height={16} /> Arreglar avisos
                  </button>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {validation.issues.slice(0, 20).map((i, k) => (
                  <li key={k} className="anim-fade-up">
                    <button
                      type="button"
                      onClick={() => showIssue(i.date, i.staffId)}
                      className="flex w-full items-start gap-2 rounded-lg px-1 py-1 text-left transition hover:bg-red-500/10"
                      style={{ animationDelay: `${k * 25}ms` }}
                    >
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                      <span className="flex-1">{i.message}</span>
                      <span className="shrink-0 text-xs font-semibold text-brand">Ver</span>
                    </button>
                  </li>
                ))}
              </ul>
              {validation.issues.length > 20 && <p className="mt-1 text-xs text-muted">y {validation.issues.length - 20} más…</p>}
            </>
          )}
        </section>

        <MonthSummary schedule={shown} staff={visible} year={ym.year} month={ym.month} holidays={localHolidaysOf(rules, ym.year)} />

      </main>
      <MobileTabBar pending={requests.filter((r) => r.status === "pending").length} onRequests={() => setPanelOpen(true)} />
      <HistoryPanel
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        log={log}
        staff={staff}
        schedule={h.present}
        disabled={readOnly}
        onRestore={(c) => {
          logLabel.current = "Restaurado desde el historial";
          dispatch({ type: "edit", edits: [{ staffId: c.staffId, date: c.date, to: c.from! }] });
          // going back to what it was also releases the lock the manual edit put on the cell
          const next = setLocked(locks, [{ staffId: c.staffId, date: c.date }], false);
          setLocks(next);
          writeLocks(ym.year, ym.month, next);
        }}
      />
      <ActionSheet open={sheetOpen} onClose={() => setSheetOpen(false)} actions={sheetActions} />
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
      <input
        ref={restoreInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Archivo de copia de seguridad"
        onChange={(e) => {
          void readBackupFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      {restoring && (
        <ConfirmDialog
          title="¿Restaurar esta copia?"
          confirmLabel="Sí, restaurar"
          onCancel={() => setRestoring(null)}
          onConfirm={() => {
            restoreBackup(localStorage, restoring.backup);
            clearScheduleCache();
            window.location.reload();
          }}
        >
          {(() => {
            const d = describeBackup(restoring.backup);
            return (
              <>
                <p>Copia del {restoring.backup.createdAt.slice(0, 10)}: {d.people} personas, {d.months} meses guardados y {d.requests} solicitudes.</p>
                <p className="mt-2 font-semibold">Todo lo que hay ahora en este dispositivo se sustituye por esta copia. Antes te recomiendo guardar una copia de lo actual.</p>
              </>
            );
          })()}
        </ConfirmDialog>
      )}
      {backupError && (
        <ConfirmDialog title="No se puede restaurar" confirmLabel="Entendido" cancelLabel="Cerrar" onCancel={() => setBackupError(null)} onConfirm={() => setBackupError(null)}>
          <p>{backupError}</p>
        </ConfirmDialog>
      )}
      {confirmRegenerate && (
        <ConfirmDialog
          title="¿Seguro que quieres continuar?"
          confirmLabel="Sí, rehacer el calendario"
          onCancel={() => setConfirmRegenerate(false)}
          onConfirm={() => {
            setConfirmRegenerate(false);
            regenerate();
          }}
        >
          <p>Vas a rehacer el calendario de {MONTHS[ym.month - 1].toLowerCase()}: tu calendario puede sufrir cambios.</p>
          <p className="mt-2">
            {lockedCount(locks) > 0
              ? `Las ${lockedCount(locks)} casillas bloqueadas, las vacaciones y los días fuera de plantilla se mantienen. `
              : "Las vacaciones y los días fuera de plantilla se mantienen. "}
            Podrás deshacerlo con el botón Deshacer.
          </p>
        </ConfirmDialog>
      )}
      {teamProposal && (
        <PlanDialog
          title={teamProposal.title}
          staff={teamProposal.next}
          plan={teamProposal.plans[0].plan}
          label={teamProposal.plans.length > 1 ? `${MONTHS[teamProposal.plans[0].m - 1]} ${teamProposal.plans[0].y}` : undefined}
          others={teamProposal.plans.slice(1).map((p) => ({ label: `${MONTHS[p.m - 1]} ${p.y}`, plan: p.plan }))}
          onApply={applyTeamProposal}
          onCancel={() => setTeamProposal(null)}
        />
      )}
      {plan && <PlanDialog plan={plan.plan} title={plan.title} staff={staff} onApply={applyPlan} onCancel={() => setPlan(null)} onUnlock={releaseAndRetry} />}
    </>
  );
}
