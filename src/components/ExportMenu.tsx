"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, DownloadIcon, PrinterIcon, TableIcon } from "./icons";

interface Props {
  onPdf: () => void;
  onCsv: () => void;
  onBackup: () => void;
  onRestore?: () => void;
}

export function ExportMenu({ onPdf, onCsv, onBackup, onRestore }: Props) {
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

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="glass flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0 focus-visible:outline-2 focus-visible:outline-brand"
      >
        <DownloadIcon width={16} height={16} />
        Exportar
        <ChevronDown width={14} height={14} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div role="menu" className="anim-menu absolute right-0 z-40 mt-2 w-60 rounded-2xl border border-line bg-card-solid p-1.5 shadow-2xl">
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onPdf();
            }}
          >
            <PrinterIcon width={16} height={16} className="text-accent" />
            <span>PDF / Imprimir<span className="block text-[11px] font-normal text-muted">Una página A4 apaisada</span></span>
          </button>
          <button
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              onCsv();
            }}
          >
            <TableIcon width={16} height={16} className="text-emerald-600" />
            <span>CSV (Excel)<span className="block text-[11px] font-normal text-muted">Con las mismas letras que vuestra hoja</span></span>
          </button>
          <div className="my-1 border-t border-line" />
          <button role="menuitem" className={item} onClick={() => { setOpen(false); onBackup(); }}>
            <DownloadIcon width={16} height={16} className="text-brand" />
            <span>Guardar copia de seguridad<span className="block text-[11px] font-normal text-muted">Todo el equipo, meses y solicitudes</span></span>
          </button>
          {onRestore && (
            <button role="menuitem" className={item} onClick={() => { setOpen(false); onRestore(); }}>
              <DownloadIcon width={16} height={16} className="rotate-180 text-brand" />
              <span>Restaurar copia…<span className="block text-[11px] font-normal text-muted">Sustituye lo de este dispositivo</span></span>
            </button>
          )}
          <p className="px-3 pb-1 pt-2 text-[11px] text-muted">Calendario .ics: pulsa el icono junto al nombre de cada persona.</p>
        </div>
      )}
    </div>
  );
}
