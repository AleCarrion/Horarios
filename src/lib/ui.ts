import type { ShiftCode } from "./domain/types";

/** Background + text colours chosen for >=4.5:1 contrast; the code letter is always shown too. */
export const SHIFT_STYLE: Record<ShiftCode, string> = {
  M: "bg-amber-200 text-amber-950",
  T: "bg-sky-200 text-sky-950",
  N: "bg-indigo-800 text-white",
  S: "bg-teal-200 text-teal-950",
  P: "bg-violet-200 text-violet-950",
  MZ: "bg-lime-200 text-lime-950",
  D: "bg-slate-100 text-slate-600",
};

export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const WEEKDAYS = ["D", "L", "M", "X", "J", "V", "S"];
