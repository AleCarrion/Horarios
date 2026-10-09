"use client";

import { useEffect } from "react";
import { canRestore, entrySummary, shiftName, type LogEntry, type LoggedCell } from "@/lib/domain/changeLog";
import type { Schedule, Staff } from "@/lib/domain/types";
import { CloseIcon } from "./icons";

interface Props {
  open: boolean;
  onClose: () => void;
  log: LogEntry[];
  staff: Staff[];
  /** What the month holds now (to know which cells can still go back). */
  schedule: Schedule;
  disabled?: boolean;
  onRestore: (cell: LoggedCell) => void;
}

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString("es-ES", { day: "numeric", month: "short" })}, ${d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`;
};

/** Who changed what and when in this month, with a way back for every cell. */
export function HistoryPanel({ open, onClose, log, staff, schedule, disabled, onRestore }: Props) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  const name = (id: string) => staff.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="fixed inset-0 z-50 print:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Historial de cambios"
        onClick={(e) => e.stopPropagation()}
        className="anim-sheet absolute inset-x-0 bottom-0 top-12 flex flex-col rounded-t-3xl bg-card-solid shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:top-0 sm:w-[28rem] sm:rounded-none"
      >
        <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
          <div>
            <h2 className="text-lg font-bold">Historial de cambios</h2>
            <p className="text-xs text-muted">De este mes, en este dispositivo.</p>
          </div>
          <button onClick={onClose} aria-label="Cerrar" className="grid h-10 w-10 place-items-center rounded-xl transition hover:bg-brand/10 active:scale-95">
            <CloseIcon />
          </button>
        </header>
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {log.length === 0 && <p className="text-sm text-muted">Todavía no hay cambios en este mes.</p>}
          {log.map((e) => (
            <details key={e.at} className="rounded-2xl border border-line bg-card-solid/70 p-3">
              <summary className="cursor-pointer select-none">
                <span className="font-semibold">{e.label}</span>
                <span className="block text-xs text-muted">{when(e.at)} · {entrySummary(e)}</span>
              </summary>
              <ul className="mt-2 space-y-1.5 text-sm">
                {e.cells.slice(0, 60).map((c) => (
                  <li key={`${c.staffId}|${c.date}`} className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <b>{name(c.staffId)}</b> · {Number(c.date.slice(8))}: {shiftName(c.from)} → {shiftName(c.to)}
                    </span>
                    {!disabled && canRestore(c, schedule) && (
                      <button onClick={() => onRestore(c)} className="rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-brand transition hover:bg-brand/10 active:scale-95">
                        Volver a {shiftName(c.from).split(" (")[0].toLowerCase()}
                      </button>
                    )}
                  </li>
                ))}
                {e.cells.length > 60 && <li className="text-xs text-muted">y {e.cells.length - 60} más…</li>}
              </ul>
            </details>
          ))}
        </div>
      </aside>
    </div>
  );
}
