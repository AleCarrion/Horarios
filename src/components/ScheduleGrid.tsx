"use client";

import { createPortal } from "react-dom";
import { Fragment, useEffect, useRef, useState } from "react";
import { isWeekend, monthDates, weekday } from "@/lib/domain/dates";
import { isHoliday } from "@/lib/domain/holidays";
import { allowedShifts } from "@/lib/domain/rules";
import { SHIFTS, displayCode, type Schedule, type ShiftCode, type Staff } from "@/lib/domain/types";
import type { Validation } from "@/lib/domain/validate";
import { SHIFT_STYLE, WEEKDAYS } from "@/lib/ui";
import { SECTIONS } from "@/lib/domain/team";
import type { Role } from "@/lib/domain/types";
import { CalendarIcon, CheckIcon, GripIcon, LockIcon } from "./icons";

const WEEKDAY_NAMES = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const ROLE_LABEL: Record<Staff["role"], string> = {
  night_auditor: "Auditor nocturno",
  director: "Dirección",
  senior: "Apoyo",
  receptionist: "Recepción",
  mozo: "Mozo",
};
const ROLE_COLOR: Record<Staff["role"], string> = {
  night_auditor: "from-indigo-500 to-blue-700",
  director: "from-sky-500 to-blue-600",
  senior: "from-violet-500 to-fuchsia-600",
  receptionist: "from-amber-400 to-orange-600",
  mozo: "from-cyan-400 to-teal-600",
};
const initials = (name: string) =>
  name
    .split(/[\s.]+/)
    .filter(Boolean)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

interface Props {
  year: number;
  month: number;
  staff: Staff[];
  schedule: Schedule;
  validation: Validation;
  onEdit: (edits: { staffId: string; date: string; to: ShiftCode }[]) => void;
  onCalendar?: (staff: Staff) => void;
  /** Drag a person to reorder them or drop them in another section (changes their puesto). */
  onMove?: (id: string, role: Role, beforeId: string | null) => void;
  /** Ask for a day off / holidays and re-plan the rest of the month around it (the app shows a preview first). */
  onPlan?: (staffId: string, date: string, kind: "D" | "V" | "M" | "T" | "N", days: number) => void;
  /** Exchange shifts with another person on this day (optionally exchanging again on `returnDate`). */
  onSwap?: (a: string, b: string, date: string, returnDate?: string) => void;
  /** Locked cells (staffId -> date -> true) and the action to lock/unlock a range of days. */
  locked?: Record<string, Record<string, boolean>>;
  onLock?: (staffId: string, dates: string[], on: boolean) => void;
  /** Cells a pending plan would change ("staffId|date"), outlined in the grid. */
  preview?: Set<string>;
  readOnly?: boolean;
  today?: string | null;
  /** Show only these days (a week on phones); `undefined` = the whole month. */
  dates?: string[];
  /** Bigger touch targets and a table that fills the width (week view on phones). */
  compact?: boolean;
}

export function ScheduleGrid({ year, month, staff, schedule, validation, onEdit, onCalendar, onMove, onPlan, onSwap, locked, onLock, preview, readOnly, today, dates: only, compact }: Props) {
  const dates = monthDates(year, month);
  const cols = only ?? dates;
  const [menu, setMenu] = useState<{ staff: Staff; date: string; x: number; y: number } | null>(null);
  const [days, setDays] = useState(1);
  const [rebalance, setRebalance] = useState(true);
  const [swapWith, setSwapWith] = useState("");
  const [swapBack, setSwapBack] = useState("");
  const opener = useRef<HTMLElement | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const tipTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const live = useRef({ schedule, staff });
  const prevSchedule = useRef(schedule);
  useEffect(() => {
    live.current = { schedule, staff };
    // Pop the cells that just changed (imperative: no per-cell state, keeps hydration cheap).
    const before = prevSchedule.current;
    prevSchedule.current = schedule;
    if (before === schedule || !tableRef.current) return;
    for (const id of Object.keys(schedule))
      for (const [d, c] of Object.entries(schedule[id]))
        if (before[id]?.[d] && before[id][d] !== c) {
          const el = tableRef.current.querySelector<HTMLElement>(`[data-row="${id}"][data-col="${d}"]`);
          if (!el) continue;
          el.classList.add("anim-pop");
          el.addEventListener("animationend", () => el.classList.remove("anim-pop"), { once: true });
        }
  }, [schedule, staff]);

  const closeMenu = () => {
    setMenu(null);
    opener.current?.focus();
  };

  useEffect(() => {
    if (!menu) return;
    const current = menuRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    (current ?? menuRef.current?.querySelector<HTMLElement>("button"))?.focus();
  }, [menu]);

  const onMenuKey = (e: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    const i = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") closeMenu();
    else if (e.key === "ArrowDown") items[(i + 1) % items.length]?.focus();
    else if (e.key === "ArrowUp") items[(i - 1 + items.length) % items.length]?.focus();
    else if (e.key === "Tab") closeMenu();
    else return;
    e.preventDefault();
  };

  // Crosshair highlight + tooltip, done imperatively so hovering never re-renders 300 cells.
  const clearHover = () => {
    tableRef.current?.querySelectorAll(".hl-row,.hl-col").forEach((el) => el.classList.remove("hl-row", "hl-col"));
    if (tipTimer.current) clearTimeout(tipTimer.current);
    if (tipRef.current) tipRef.current.style.opacity = "0";
  };
  const onHover = (e: React.PointerEvent) => {
    const cell = (e.target as HTMLElement).closest<HTMLElement>("[data-cell]");
    if (!cell || !tableRef.current) return clearHover();
    const { row, col } = cell.dataset as { row: string; col: string };
    tableRef.current.querySelectorAll(".hl-row,.hl-col").forEach((el) => el.classList.remove("hl-row", "hl-col"));
    tableRef.current.querySelector(`[data-rowhead="${row}"]`)?.classList.add("hl-row");
    tableRef.current.querySelector(`[data-colhead="${col}"]`)?.classList.add("hl-col");
    if (tipTimer.current) clearTimeout(tipTimer.current);
    if (tipRef.current) tipRef.current.style.opacity = "0";
    tipTimer.current = setTimeout(() => {
      const tip = tipRef.current;
      if (!tip) return;
      const { schedule: sch, staff: st } = live.current;
      const person = st.find((x) => x.id === row);
      const code = sch[row]?.[col] ?? "D";
      const def = SHIFTS[code];
      const [y, m, d] = col.split("-").map(Number);
      const dayName = WEEKDAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
      tip.textContent = `${person?.name} · ${dayName} ${d} · ${def.label}${def.start ? ` ${def.start}–${def.end}` : ""}`;
      const r = cell.getBoundingClientRect();
      tip.style.left = `${Math.min(Math.max(8, r.left + r.width / 2 - tip.offsetWidth / 2), window.innerWidth - tip.offsetWidth - 8)}px`;
      tip.style.top = `${Math.max(8, r.top - 40)}px`;
      tip.style.opacity = "1";
    }, 220);
  };

  const openMenu = (e: React.MouseEvent<HTMLButtonElement>, staffId: string, date: string) => {
    const person = staff.find((x) => x.id === staffId)!;
    const r = e.currentTarget.getBoundingClientRect();
    opener.current = e.currentTarget;
    clearHover();
    const h = allowedShifts(person).length * 40 + 64;
    const y = r.bottom + h > window.innerHeight ? Math.max(4, r.top - h - 4) : r.bottom + 6;
    setDays(1);
    setSwapWith("");
    setSwapBack("");
    setMenu({ staff: person, date, x: Math.min(r.left, window.innerWidth - 232), y });
  };

  // --- drag & drop of people (rows) between and inside sections
  const dragId = useRef<string | null>(null);
  const clearDrop = () =>
    tableRef.current?.querySelectorAll(".drop-before,.drop-after,.drop-into").forEach((el) => el.classList.remove("drop-before", "drop-after", "drop-into"));
  const membersOf = (role: Role) => staff.filter((x) => x.role === role && x.id !== dragId.current);
  const dropOnRow = (e: React.DragEvent, target: Staff, commit: boolean) => {
    if (!dragId.current || !onMove) return;
    e.preventDefault();
    const r = e.currentTarget.getBoundingClientRect();
    const after = e.clientY > r.top + r.height / 2;
    if (!commit) {
      clearDrop();
      e.currentTarget.classList.add(after ? "drop-after" : "drop-before");
      return;
    }
    const peers = membersOf(target.role);
    const i = peers.findIndex((x) => x.id === target.id);
    const before = target.id === dragId.current ? null : (peers[after ? i + 1 : i]?.id ?? null);
    onMove(dragId.current, target.role, before);
    clearDrop();
    dragId.current = null;
  };
  const dropOnSection = (e: React.DragEvent, role: Role, commit: boolean) => {
    if (!dragId.current || !onMove) return;
    e.preventDefault();
    if (!commit) {
      clearDrop();
      e.currentTarget.classList.add("drop-into");
      return;
    }
    onMove(dragId.current, role, membersOf(role)[0]?.id ?? null);
    clearDrop();
    dragId.current = null;
  };

  const bad = new Set(validation.issues.filter((i) => i.staffId).map((i) => `${i.staffId}|${i.date}`));
  const cellLabel = (s: Staff, d: string, code: ShiftCode) => `${s.name}, ${d}, ${SHIFTS[code].label} ${displayCode(code)}`;

  return (
    <div className="glass anim-fade-up overflow-hidden rounded-2xl shadow-[0_18px_50px_-20px_rgba(11,79,138,0.35)]" style={{ animationDelay: "120ms" }}>
      <div className="overflow-x-auto px-2 pb-2 pt-1">
        <table
          ref={tableRef}
          className={`schedule-table border-separate text-sm [border-spacing:3px] ${compact ? "w-full" : ""}`}
          onPointerOver={onHover}
          onPointerLeave={clearHover}
        >
          <caption className="sr-only">Horario mensual por persona y día</caption>
          <thead>
            <tr>
              <th scope="col" className={`sticky left-0 z-20 rounded-xl bg-card-solid p-2 text-left text-xs font-semibold uppercase tracking-wider text-muted ${compact ? "w-[7.5rem] min-w-0" : "min-w-36"}`}>
                Equipo
              </th>
              {cols.map((d) => {
                const isToday = today === d;
                return (
                  <th
                    key={d}
                    scope="col"
                    data-colhead={d}
                    title={isHoliday(d) ? "Festivo" : undefined}
                    className={`${compact ? "min-w-0" : "min-w-9"} rounded-xl px-0.5 py-1.5 text-center font-semibold transition-colors ${
                      isToday
                        ? "bg-gradient-to-b from-brand to-brand-2 text-white shadow-md"
                        : isHoliday(d)
                          ? "bg-[#ffff00] text-black"
                          : isWeekend(d)
                          ? "bg-accent/15 text-accent"
                          : "bg-card-solid text-foreground"
                    }`}
                  >
                    <div className="text-[10px] font-medium uppercase opacity-80">{WEEKDAYS[weekday(d)]}</div>
                    <div className="text-sm leading-tight">{Number(d.slice(8))}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {SECTIONS.map(({ role, label }) => (
              <Fragment key={role}>
                <tr>
                  <th
                    colSpan={cols.length + 1}
                    scope="colgroup"
                    onDragOver={(e) => dropOnSection(e, role, false)}
                    onDragLeave={clearDrop}
                    onDrop={(e) => dropOnSection(e, role, true)}
                    className="sticky left-0 rounded-lg px-2 pb-0.5 pt-2 text-left text-[10px] font-bold uppercase tracking-[0.14em] text-muted transition-colors [&.drop-into]:bg-accent/20"
                  >
                    {label}
                    <span className="ml-2 font-medium normal-case tracking-normal opacity-70">{staff.filter((x) => x.role === role).length}</span>
                  </th>
                </tr>
                {staff.filter((x) => x.role === role).map((s) => (
              <tr key={s.id} className="group">
                <th
                  scope="row"
                  data-rowhead={s.id}
                  draggable={Boolean(onMove)}
                  onDragStart={(e) => {
                    dragId.current = s.id;
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", s.id);
                    e.currentTarget.classList.add("opacity-50");
                  }}
                  onDragEnd={(e) => {
                    dragId.current = null;
                    e.currentTarget.classList.remove("opacity-50");
                    clearDrop();
                  }}
                  onDragOver={(e) => dropOnRow(e, s, false)}
                  onDragLeave={clearDrop}
                  onDrop={(e) => dropOnRow(e, s, true)}
                  className="sticky left-0 z-10 rounded-xl bg-card-solid p-1.5 pr-2 text-left font-medium transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {onMove && !compact && (
                      <GripIcon
                        width={14}
                        height={14}
                        className="print-hide -mr-1 shrink-0 cursor-grab text-muted opacity-40 transition group-hover:opacity-100 active:cursor-grabbing"
                      />
                    )}
                    <span
                      aria-hidden="true"
                      className={`grid ${compact ? "h-7 w-7 text-[10px]" : "h-8 w-8 text-[11px]"} shrink-0 place-items-center rounded-full bg-gradient-to-br font-bold text-white shadow ${ROLE_COLOR[s.role]}`}
                    >
                      {initials(s.name)}
                    </span>
                    <span className="min-w-0 flex-1 leading-tight">
                      <span className="block truncate text-[13px] font-semibold">{s.name}</span>
                      <span className="hidden truncate text-[11px] text-muted sm:block">{ROLE_LABEL[s.role]}</span>
                    </span>
                    {onCalendar && !compact && (
                      <button
                        type="button"
                        onClick={() => onCalendar(s)}
                        aria-label={`Descargar calendario de ${s.name} (.ics)`}
                        title="Descargar calendario (.ics)"
                        className="print-hide rounded-lg p-1.5 text-muted opacity-0 transition hover:bg-brand/10 hover:text-brand focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
                      >
                        <CalendarIcon width={15} height={15} />
                      </button>
                    )}
                  </div>
                </th>
                {cols.map((d) => {
                  const code = schedule[s.id]?.[d] ?? "D";
                  return (
                    <td key={d} className={`rounded-lg p-0 ${isWeekend(d) ? "bg-accent/[0.07]" : ""}`}>
                      <button
                        type="button"
                        data-cell
                        data-row={s.id}
                        data-col={d}
                        disabled={readOnly}
                        aria-haspopup="listbox"
                        aria-label={`${cellLabel(s, d, code)}${locked?.[s.id]?.[d] ? ", bloqueada" : ""}`}
                        onClick={(e) => openMenu(e, s.id, d)}
                        className={`relative flex ${compact ? "h-12 w-full min-w-0 text-base" : "h-9 w-9"} items-center justify-center rounded-lg text-[13px] font-bold tracking-tight shadow-[inset_0_-2px_0_rgba(0,0,0,0.14),inset_0_1px_0_rgba(255,255,255,0.35)] transition-[transform,box-shadow] duration-150 enabled:cursor-pointer enabled:hover:z-10 enabled:hover:-translate-y-0.5 enabled:hover:scale-110 enabled:hover:shadow-lg enabled:active:scale-95 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand ${
                          code === "B" ? "bg-[repeating-linear-gradient(135deg,#0b0b0b_0_5px,#1f1f1f_5px_10px)]" : SHIFT_STYLE[code]
                        } ${bad.has(`${s.id}|${d}`) ? "anim-alert ring-2 ring-red-600" : ""} ${preview?.has(`${s.id}|${d}`) ? "ring-[3px] ring-accent ring-offset-1 ring-offset-card-solid" : ""}`}
                      >
                        {displayCode(code)}
                        {locked?.[s.id]?.[d] && <LockIcon width={9} height={9} className="absolute right-0.5 top-0.5 opacity-70" />}
                      </button>
                    </td>
                  );
                })}
              </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            {(["M", "T", "N"] as const).map((k) => (
              <tr key={k}>
                <th scope="row" className="sticky left-0 z-10 rounded-xl bg-card-solid px-3 py-1.5 text-left text-xs font-semibold text-muted">
                  Cobertura {SHIFTS[k].label.toLowerCase()}
                </th>
                {cols.map((d) => {
                  const ok = validation.coverage[d]?.[k] === 1;
                  return (
                    <td key={d} className="text-center">
                      <span
                        role="img"
                        aria-label={ok ? "cubierto" : "sin cubrir"}
                        className={`mx-auto grid h-5 w-5 place-items-center rounded-full text-[11px] font-bold transition-colors ${
                          ok ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "anim-alert bg-red-600 text-white"
                        }`}
                      >
                        {ok ? <CheckIcon width={12} height={12} /> : "!"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tfoot>
        </table>
      </div>

      <div
        ref={tipRef}
        aria-hidden="true"
        className="pointer-events-none fixed z-40 rounded-lg bg-slate-900/95 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-xl transition-opacity duration-150 print:hidden"
      />

      {menu &&
        createPortal(
        <>
          <div className="fixed inset-0 z-20 max-sm:bg-black/30" onClick={closeMenu} aria-hidden="true" />
          <div
            ref={menuRef}
            role="listbox"
            aria-label={`Turno de ${menu.staff.name}, ${menu.date}`}
            onKeyDown={onMenuKey}
            style={{ left: menu.x, top: menu.y }}
            className="anim-menu fixed z-30 w-56 rounded-2xl border border-line bg-card-solid p-1.5 shadow-2xl max-sm:!inset-0 max-sm:m-auto max-sm:h-fit max-sm:max-h-[calc(100dvh-8rem)] max-sm:w-[calc(100%-2rem)] max-sm:overflow-y-auto max-sm:px-3 max-sm:py-3"
          >
            <div className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wider text-muted">
              {menu.staff.name} · {Number(menu.date.slice(8))}
            </div>
            {allowedShifts(menu.staff).map((c) => {
              const selected = (schedule[menu.staff.id]?.[menu.date] ?? "D") === c;
              return (
                <button
                  key={c}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    // Apply to `days` consecutive days from the clicked one (e.g. 14 days of vacation).
                    const start = dates.indexOf(menu.date);
                    const range = dates.slice(start, start + days);
                    if (rebalance && onPlan && (c === "D" || c === "V" || c === "M" || c === "T" || c === "N")) onPlan(menu.staff.id, range[0], c, range.length);
                    else onEdit(range.map((date) => ({ staffId: menu.staff.id, date, to: c })));
                    closeMenu();
                  }}
                  className="flex h-10 w-full items-center gap-2.5 rounded-xl px-2 text-left text-sm transition max-sm:h-12 hover:bg-brand/10 focus-visible:bg-brand/15 focus-visible:outline-2 focus-visible:outline-brand aria-selected:bg-brand/10 aria-selected:font-bold"
                >
                  <span
                    className={`flex h-7 w-9 items-center justify-center rounded-lg text-xs font-bold shadow-[inset_0_-2px_0_rgba(0,0,0,0.14)] ${
                      c === "B" ? "bg-black" : SHIFT_STYLE[c]
                    }`}
                  >
                    {displayCode(c)}
                  </span>
                  <span className="flex-1 leading-tight">
                    {SHIFTS[c].label}
                    {SHIFTS[c].start && <span className="block text-[11px] font-normal text-muted">{SHIFTS[c].start}–{SHIFTS[c].end}</span>}
                  </span>
                  {selected && <CheckIcon width={14} height={14} className="text-brand" />}
                </button>
              );
            })}
            <label className="mt-1 flex items-center gap-2 border-t border-line px-2 pt-2 text-xs text-muted">
              Aplicar a
              <input
                type="number"
                min={1}
                max={dates.length - dates.indexOf(menu.date)}
                value={days}
                onChange={(e) => setDays(Math.max(1, Number(e.target.value) || 1))}
                className="w-14 rounded-lg border border-line bg-transparent px-1.5 py-1 text-foreground"
                aria-label="Número de días a los que aplicar el turno"
              />
              días
            </label>
            {onLock && (
              <button
                type="button"
                onClick={() => {
                  const start = dates.indexOf(menu.date);
                  const on = !locked?.[menu.staff.id]?.[menu.date];
                  onLock(menu.staff.id, dates.slice(start, start + days), on);
                  closeMenu();
                }}
                className="mt-1 flex h-9 w-full items-center gap-2 rounded-xl px-2 text-left text-sm font-medium transition hover:bg-brand/10 focus-visible:bg-brand/15 focus-visible:outline-2 focus-visible:outline-brand"
              >
                <LockIcon width={15} height={15} className="text-muted" />
                {locked?.[menu.staff.id]?.[menu.date] ? "Desbloquear casilla" : "Bloquear casilla"}
                <span className="ml-auto text-[11px] font-normal text-muted">no se mueve sola</span>
              </button>
            )}
            {onSwap && (
              <div className="mt-2 space-y-1.5 border-t border-line px-2 pt-2 text-xs text-muted">
                <label className="flex items-center gap-2">
                  Cambiar turno con
                  <select
                    value={swapWith}
                    onChange={(e) => setSwapWith(e.target.value)}
                    aria-label="Cambiar turno con"
                    className="min-w-0 flex-1 rounded-lg border border-line bg-card-solid px-1.5 py-1 text-foreground"
                  >
                    <option value="">elegir…</option>
                    {staff.filter((x) => x.id !== menu.staff.id).map((x) => (
                      <option key={x.id} value={x.id}>{x.name}</option>
                    ))}
                  </select>
                </label>
                {swapWith && (
                  <>
                    <label className="flex items-center gap-2">
                      Devolver el día
                      <select
                        value={swapBack}
                        onChange={(e) => setSwapBack(e.target.value)}
                        aria-label="Devolver el día"
                        className="min-w-0 flex-1 rounded-lg border border-line bg-card-solid px-1.5 py-1 text-foreground"
                      >
                        <option value="">no (solo este día)</option>
                        {dates.filter((x) => x > menu.date).map((x) => (
                          <option key={x} value={x}>día {Number(x.slice(8))}</option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        onSwap(menu.staff.id, swapWith, menu.date, swapBack || undefined);
                        closeMenu();
                      }}
                      className="w-full rounded-lg bg-brand/10 px-2 py-1.5 font-semibold text-brand transition hover:bg-brand/20"
                    >
                      Ver cambio
                    </button>
                  </>
                )}
              </div>
            )}
            {onPlan && (
              <label className="mt-1.5 flex cursor-pointer items-start gap-2 px-2 text-xs text-muted">
                <input type="checkbox" checked={rebalance} onChange={(e) => setRebalance(e.target.checked)} className="mt-0.5 h-3.5 w-3.5" />
                <span>
                  Al elegir <b>Libre</b>, <b>Vacaciones</b> o un turno, reajustar el resto del horario
                </span>
              </label>
            )}
          </div>
        </>,
        document.body,
      )}
    </div>
  );
}
