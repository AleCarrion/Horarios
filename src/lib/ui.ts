import type { ShiftCode } from "./domain/types";

/** Same palette as the hotel's Excel; text colours keep >= 4.5:1 contrast and the letter is always shown too. */
export const SHIFT_STYLE: Record<ShiftCode, string> = {
  M: "bg-[#ffff00] text-black",
  T: "bg-[#bdd7ee] text-black",
  N: "bg-[#0070c0] text-white",
  S: "bg-[#4472c4] text-white",
  P: "bg-[#ffc000] text-black",
  MZ: "bg-[#00b0f0] text-black",
  D: "bg-[#92d050] text-black",
  V: "bg-[#ff0000] text-black",
  B: "bg-black text-black",
};

export const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];
export const WEEKDAYS = ["D", "L", "M", "X", "J", "V", "S"];
