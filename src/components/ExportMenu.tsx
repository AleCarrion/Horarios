"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronDown, DownloadIcon, PrinterIcon, TableIcon, UsersIcon } from "./icons";

interface Props {
  onMonthPdf: () => void;
  /** Everyone's month (editors) or the worker's own, one page per person. */
  onPeoplePdf: () => void;
  peopleLabel: string;
  onXlsx: () => void;
  onPrint: () => void;
  onCsv: () => void;
  onBackup?: () => void;
  onRestore?: () => void;
  /** Shown while a file is being prepared. */
  busy?: boolean;
}

export function ExportMenu({ onMonthPdf, onPeoplePdf, peopleLabel, onXlsx, onPrint, onCsv, onBackup, onRestore, busy }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const item =
    "flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-medium transition hover:bg-brand/10 focus-visible:bg-brand/10 focus-visible:outline-none";
  const entry = (icon: ReactNode, label: string, hint: string, run: () => void) => (
    <button
      role="menuitem"
      className={item}
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      {icon}
      <span>
        {label}
        <span className="block text-[11px] font-normal text-muted">{hint}</span>
      </span>
    </button>
  );

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-busy={busy || undefined}
        onClick={() => setOpen((o) => !o)}
        className="glass flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 focus-visible:outline-2 focus-visible:outline-brand"
      >
        <DownloadIcon width={16} height={16} className={busy ? "animate-bounce" : ""} />
        {busy ? "Preparando…" : "Exportar"}
        <ChevronDown width={14} height={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="anim-menu absolute right-0 z-40 mt-2 w-72 rounded-2xl border border-line bg-card-solid p-1.5 shadow-2xl">
          {entry(<PrinterIcon width={16} height={16} className="text-accent" />, "PDF del mes", "Todo el mes en una hoja A4, con colores, totales y leyenda", onMonthPdf)}
          {entry(<UsersIcon width={16} height={16} className="text-accent" />, peopleLabel, "Calendario del mes con turnos, horas y totales", onPeoplePdf)}
          {entry(<TableIcon width={16} height={16} className="text-emerald-600" />, "Excel (.xlsx)", "Con colores, puestos, totales, resumen y leyenda", onXlsx)}
          <div className="my-1 border-t border-line" />
          {entry(<PrinterIcon width={16} height={16} className="text-muted" />, "Imprimir", "Lo que ves, con el diálogo del navegador", onPrint)}
          {entry(<TableIcon width={16} height={16} className="text-muted" />, "CSV", "Texto simple, para otros programas", onCsv)}
          {(onBackup || onRestore) && <div className="my-1 border-t border-line" />}
          {onBackup && entry(<DownloadIcon width={16} height={16} className="text-brand" />, "Guardar copia de seguridad", "Todo el equipo, meses y solicitudes", onBackup)}
          {onRestore && entry(<DownloadIcon width={16} height={16} className="rotate-180 text-brand" />, "Restaurar copia…", "Sustituye lo de este dispositivo", onRestore)}
          <p className="px-3 pb-1 pt-2 text-[11px] text-muted">Calendario .ics: pulsa el icono junto al nombre de cada persona.</p>
        </div>
      )}
    </div>
  );
}
