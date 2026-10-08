import { monthDates } from "./dates";
import { planDayOff, planShiftSwap, type Plan, type RepairContext } from "./repair";
import type { Staff } from "./types";

export type RequestKind = "libre" | "vacaciones" | "cambio";
export type RequestStatus = "pending" | "approved" | "rejected";

export interface ShiftRequest {
  id: string;
  /** Requests that were split by month share a group. */
  groupId: string;
  kind: RequestKind;
  /** Who asks. */
  staffId: string;
  /** First day (and the only one for "libre" and "cambio"). */
  date: string;
  /** Last day of a holiday range. */
  endDate?: string;
  /** "cambio": the other person, and an optional day when they exchange back. */
  withStaffId?: string;
  returnDate?: string;
  note?: string;
  createdAt: string;
  status: RequestStatus;
  decidedAt?: string;
  decisionNote?: string;
}

export interface NewRequest {
  kind: RequestKind;
  staffId: string;
  date: string;
  endDate?: string;
  withStaffId?: string;
  returnDate?: string;
  note?: string;
}

const uid = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`);

export function validateNew(r: Partial<NewRequest>, staff: Staff[]): string | null {
  if (!r.staffId || !staff.some((s) => s.id === r.staffId)) return "Elige una persona.";
  if (!r.date) return "Elige el día.";
  if (r.kind === "vacaciones" && r.endDate && r.endDate < r.date) return "El último día no puede ser antes del primero.";
  if (r.kind === "cambio") {
    if (!r.withStaffId) return "Elige con quién cambia el turno.";
    if (r.withStaffId === r.staffId) return "Tienen que ser dos personas distintas.";
    if (r.returnDate && r.returnDate <= r.date) return "El día de devolución tiene que ser posterior.";
  }
  return null;
}

/** Splits [from, to] at month boundaries. */
function monthsBetween(from: string, to: string): { date: string; endDate: string }[] {
  const out: { date: string; endDate: string }[] = [];
  let y = Number(from.slice(0, 4));
  let m = Number(from.slice(5, 7));
  const lastKey = to.slice(0, 7);
  for (;;) {
    const days = monthDates(y, m);
    const start = days[0] > from ? days[0] : from;
    const end = days.at(-1)! < to ? days.at(-1)! : to;
    out.push({ date: start, endDate: end });
    if (`${y}-${String(m).padStart(2, "0")}` >= lastKey) break;
    [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
  }
  return out;
}

/** One request normally; holidays over a month boundary become one request per month. */
export function createRequests(input: NewRequest & { now?: string }): ShiftRequest[] {
  const createdAt = input.now ?? new Date().toISOString();
  const groupId = uid();
  const common = { groupId, kind: input.kind, staffId: input.staffId, note: input.note?.trim() || undefined, createdAt, status: "pending" as const };
  if (input.kind === "vacaciones") {
    const to = input.endDate && input.endDate > input.date ? input.endDate : input.date;
    return monthsBetween(input.date, to).map((p) => ({ ...common, id: uid(), date: p.date, endDate: p.endDate }));
  }
  return [
    {
      ...common,
      id: uid(),
      date: input.date,
      ...(input.kind === "cambio" ? { withStaffId: input.withStaffId, returnDate: input.returnDate || undefined } : {}),
    },
  ];
}

export const decide = (r: ShiftRequest, status: "approved" | "rejected", decisionNote?: string, at: string = new Date().toISOString()): ShiftRequest => ({
  ...r,
  status,
  decidedAt: at,
  decisionNote: decisionNote?.trim() || undefined,
});

/** Pending first, then by the day asked for, then by when it was asked. */
export function sortRequests(rs: ShiftRequest[]): ShiftRequest[] {
  const rank = (r: ShiftRequest) => (r.status === "pending" ? 0 : 1);
  return [...rs].sort((a, b) => rank(a) - rank(b) || a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt));
}

const lastDay = (r: ShiftRequest) => r.endDate ?? r.date;

/** Other people's pending requests that overlap in time with `r` (the manager may not be able to grant both). */
export function competing(all: ShiftRequest[], r: ShiftRequest): ShiftRequest[] {
  return all.filter(
    (o) => o.id !== r.id && o.status === "pending" && o.staffId !== r.staffId && o.kind !== "cambio" && r.kind !== "cambio" && o.date <= lastDay(r) && lastDay(o) >= r.date,
  );
}

export const requestMonth = (r: Pick<ShiftRequest, "date">) => ({ year: Number(r.date.slice(0, 4)), month: Number(r.date.slice(5, 7)) });

/** Runs the right planner for the request, on the month it belongs to. */
export function planForRequest(ctx: RepairContext, r: ShiftRequest): Plan {
  if (r.kind === "libre") return planDayOff(ctx, r.staffId, r.date, "D");
  if (r.kind === "vacaciones") return planDayOff(ctx, r.staffId, r.date, "V", r.endDate ?? r.date);
  return planShiftSwap(ctx, r.staffId, r.withStaffId ?? "", r.date, r.returnDate && r.returnDate.slice(0, 7) === r.date.slice(0, 7) ? r.returnDate : undefined);
}

export const KIND_LABEL: Record<RequestKind, string> = { libre: "Libre", vacaciones: "Vacaciones", cambio: "Cambio de turno" };
export const dayLabel = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`;
