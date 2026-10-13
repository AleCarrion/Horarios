"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { shiftPaint } from "@/lib/domain/catalog";
import { allowedShifts } from "@/lib/domain/rules";
import { displayCode, SHIFTS, type Schedule, type ShiftCode, type Staff } from "@/lib/domain/types";
import { csvToGrid, readScheduleGrid, type Grid, type ImportResult } from "@/lib/importGrid";
import { MONTHS } from "@/lib/ui";
import { AlertIcon, CheckIcon, TableIcon } from "./icons";

export interface ImportEdit {
  staffId: string;
  date: string;
  to: ShiftCode;
}

interface Props {
  staff: Staff[];
  year: number;
  month: number;
  /** The month as it is now (only cells that change are applied). */
  current: Schedule;
  onApply: (edits: ImportEdit[], lock: boolean) => void;
  onClose: () => void;
}

/**
 * "Importar Excel": the manager picks the file she already has (Excel or CSV), the app reads names and letters or colours,
 * shows what it understood (doubts marked with ?) and loads it into the month only when she says so.
 */
export function ImportDialog({ staff, year, month, current, onApply, onClose }: Props) {
  const [sheets, setSheets] = useState<{ name: string; grid: Grid }[] | null>(null);
  const [sheet, setSheet] = useState(0);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<number, string>>({});
  const [fixes, setFixes] = useState<Record<string, ShiftCode>>({});
  const [lock, setLock] = useState(true);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onClose]);

  const read = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    setBusy(true);
    setFileName(file.name);
    setNames({});
    setFixes({});
    try {
      let found: { name: string; grid: Grid }[];
      if (/\.(csv|txt)$/i.test(file.name)) found = [{ name: file.name, grid: csvToGrid(await file.text()) }];
      else if (/\.xls$/i.test(file.name)) throw new Error("Ese es el formato antiguo de Excel (.xls). Ábrelo en Excel y guárdalo como .xlsx.");
      else found = await (await import("@/lib/readXlsx")).readWorkbookGrids(await file.arrayBuffer());
      if (!found.length) throw new Error("El archivo no tiene hojas.");
      // the sheet that reads best, preferring one named after the month
      const monthName = MONTHS[month - 1].toLowerCase();
      const score = (g: Grid, n: string) => readScheduleGrid(g, staff, year, month).rows.filter((r) => r.staffId).length * 10 + (n.toLowerCase().includes(monthName) ? 5 : 0);
      const best = found.map((s, i) => ({ i, sc: score(s.grid, s.name) })).sort((a, b) => b.sc - a.sc)[0].i;
      setSheets(found);
      setSheet(best);
    } catch (e) {
      setSheets(null);
      setError(e instanceof Error ? e.message : "No se ha podido leer el archivo.");
    } finally {
      setBusy(false);
    }
  };

  const result: ImportResult | null = useMemo(() => (sheets ? readScheduleGrid(sheets[sheet].grid, staff, year, month) : null), [sheets, sheet, staff, year, month]);
  const rows = (result?.rows ?? []).map((r, i) => ({ ...r, staffId: names[i] !== undefined ? names[i] || null : r.staffId }));
  const used = new Set(rows.map((r) => r.staffId).filter(Boolean));
  const codeOf = (i: number, date: string, code: ShiftCode | null) => fixes[`${i}|${date}`] ?? code;

  const edits: ImportEdit[] = rows.flatMap((r, i) =>
    r.staffId ? r.cells.flatMap((c) => { const to = codeOf(i, c.date, c.code); return to && to !== current[r.staffId!]?.[c.date] ? [{ staffId: r.staffId!, date: c.date, to }] : []; }) : [],
  );
  const doubts = rows.reduce((n, r, i) => n + (r.staffId ? r.cells.filter((c) => !codeOf(i, c.date, c.code)).length : 0), 0);
  const people = rows.filter((r) => r.staffId).length;
  const otherMonth = result?.month && (result.month.year !== year || result.month.month !== month) ? result.month : null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-3 backdrop-blur-sm print:hidden" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="import-title" onClick={(e) => e.stopPropagation()} className="anim-menu flex max-h-[calc(100dvh-1.5rem)] w-full max-w-6xl flex-col rounded-3xl bg-card-solid shadow-2xl">
        <div className="flex flex-wrap items-start gap-3 border-b border-line p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"><TableIcon /></span>
          <div className="min-w-0 flex-1">
            <h2 id="import-title" className="text-lg font-bold">Importar el horario de {MONTHS[month - 1].toLowerCase()} {year}</h2>
            <p className="text-sm text-muted">Elige el Excel (.xlsx) o CSV que ya tienes hecho: personas en filas y días en columnas, con letras o colores. Primero ves lo que he entendido; no se cambia nada hasta que pulses «Cargar».</p>
          </div>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          <div className="flex flex-wrap items-center gap-3">
            <input ref={input} type="file" accept=".xlsx,.xlsm,.csv,.txt,.xls" className="hidden" onChange={(e) => void read(e.target.files?.[0])} />
            <button type="button" onClick={() => input.current?.click()} className="rounded-xl bg-gradient-to-r from-brand-solid to-brand-2-solid px-4 py-2 font-semibold text-white shadow">
              {fileName ? "Elegir otro archivo" : "Elegir archivo"}
            </button>
            {busy && <span className="text-sm text-muted">Leyendo…</span>}
            {fileName && !busy && <span className="truncate text-sm text-muted">{fileName}</span>}
            {sheets && sheets.length > 1 && (
              <label className="flex items-center gap-2 text-sm">
                <span className="text-muted">Hoja</span>
                <select value={sheet} onChange={(e) => { setSheet(Number(e.target.value)); setNames({}); setFixes({}); }} className="rounded-lg border border-line bg-card-solid px-2 py-1.5">
                  {sheets.map((s, i) => <option key={i} value={i}>{s.name}</option>)}
                </select>
              </label>
            )}
          </div>

          {error && <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-500/10 p-3 text-sm font-semibold text-red-700 dark:text-red-300"><AlertIcon width={18} height={18} className="shrink-0" />{error}</p>}

          {result && (
            <>
              <div className="flex flex-wrap gap-2 text-sm">
                <span className="rounded-full bg-emerald-500/15 px-3 py-1 font-semibold text-emerald-700 dark:text-emerald-300">{people} personas reconocidas</span>
                <span className="rounded-full bg-brand/10 px-3 py-1 font-semibold text-brand">{edits.length} casillas cambian</span>
                {doubts > 0 && <span className="rounded-full bg-amber-400/25 px-3 py-1 font-semibold text-amber-800 dark:text-amber-200">{doubts} con dudas (?)</span>}
              </div>
              {(result.problems.length > 0 || otherMonth) && (
                <ul className="space-y-1 rounded-xl bg-amber-400/15 p-3 text-sm text-amber-900 dark:text-amber-100">
                  {otherMonth && <li>Las fechas del archivo son de {MONTHS[otherMonth.month - 1].toLowerCase()} {otherMonth.year}: se cargará en {MONTHS[month - 1].toLowerCase()} {year}, el mes que tienes abierto.</li>}
                  {result.problems.map((p) => <li key={p}>{p}</li>)}
                </ul>
              )}

              {rows.length > 0 && (
                <div className="overflow-x-auto rounded-2xl border border-line">
                  <table className="border-separate text-xs [border-spacing:2px]">
                    <thead>
                      <tr>
                        <th className="sticky left-0 z-10 bg-card-solid px-2 py-1 text-left">En el archivo → persona</th>
                        {rows[0].cells.map((c) => <th key={c.date} className="w-7 text-center font-semibold text-muted">{Number(c.date.slice(8))}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, i) => {
                        const person = staff.find((s) => s.id === r.staffId);
                        return (
                          <tr key={i} className={r.staffId ? "" : "opacity-60"}>
                            <th scope="row" className="sticky left-0 z-10 bg-card-solid px-2 py-1 text-left font-medium">
                              <span className="block max-w-40 truncate text-[11px] text-muted" title={r.name}>{r.name}</span>
                              <select aria-label={`Quién es «${r.name}»`} value={r.staffId ?? ""} onChange={(e) => setNames({ ...names, [i]: e.target.value })} className={`mt-0.5 w-40 rounded-md border px-1 py-0.5 text-xs ${r.staffId ? "border-line bg-card-solid" : "border-amber-500 bg-amber-400/15"}`}>
                                <option value="">— no importar —</option>
                                {staff.map((s) => <option key={s.id} value={s.id} disabled={used.has(s.id) && s.id !== r.staffId}>{s.name}</option>)}
                              </select>
                            </th>
                            {r.cells.map((c) => {
                              const code = codeOf(i, c.date, c.code);
                              if (!code && r.staffId)
                                return (
                                  <td key={c.date} className="p-0">
                                    <select aria-label={`${r.name}, día ${Number(c.date.slice(8))}: ${c.raw || "vacía"}`} title={c.raw ? `En el archivo: ${c.raw}` : "Vacía en el archivo"} value="" onChange={(e) => setFixes({ ...fixes, [`${i}|${c.date}`]: e.target.value })} className="h-7 w-7 appearance-none rounded-md border-2 border-amber-500 bg-amber-400/20 text-center text-[11px] font-bold">
                                      <option value="">?</option>
                                      {(person ? allowedShifts(person) : Object.keys(SHIFTS)).map((x) => <option key={x} value={x}>{displayCode(x) || x} · {SHIFTS[x].label}</option>)}
                                    </select>
                                  </td>
                                );
                              return (
                                <td key={c.date} className="p-0">
                                  <span title={c.raw ? `En el archivo: ${c.raw}` : undefined} style={code ? shiftPaint(code) : undefined} className="grid h-7 w-7 place-items-center rounded-md text-[11px] font-bold">{code ? displayCode(code) : ""}</span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} className="h-4 w-4 accent-[var(--brand)]" />
            Bloquear lo importado (el motor no lo moverá al reajustar)
          </label>
          {doubts > 0 && <span className="text-xs text-muted">Las casillas con ? se quedan como están.</span>}
          <div className="ml-auto flex gap-2">
            <button type="button" onClick={onClose} className="rounded-xl border border-line px-4 py-2 text-sm font-semibold transition hover:bg-brand/10">Cancelar</button>
            <button type="button" disabled={!edits.length} onClick={() => onApply(edits, lock)} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-brand-solid to-brand-2-solid px-4 py-2 text-sm font-semibold text-white shadow disabled:opacity-40">
              <CheckIcon width={16} height={16} /> Cargar en {MONTHS[month - 1].toLowerCase()}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
