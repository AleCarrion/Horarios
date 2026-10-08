import type { ShiftRequest } from "./domain/requests";

const KEY = "horarios:requests";

/** Requests kept on this device until Supabase is connected. */
export function readRequests(): ShiftRequest[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "[]") as ShiftRequest[];
  } catch {
    return [];
  }
}

export function writeRequests(rs: ShiftRequest[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rs));
  } catch {}
}
