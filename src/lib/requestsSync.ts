import type { AskedShift, RequestKind, RequestStatus, ShiftRequest } from "./domain/requests";

/** `public.requests` row (see supabase/migrations/0003_requests_locks.sql). */
export interface RequestRow {
  id: string;
  group_id: string;
  kind: RequestKind;
  staff_id: string;
  date: string;
  end_date: string | null;
  shift: AskedShift | null;
  with_staff_id: string | null;
  return_date: string | null;
  note: string | null;
  status: RequestStatus;
  created_at: string;
  decided_at: string | null;
  decision_note: string | null;
}

export const toRequestRow = (r: ShiftRequest): RequestRow => ({
  id: r.id,
  group_id: r.groupId,
  kind: r.kind,
  staff_id: r.staffId,
  date: r.date,
  end_date: r.endDate ?? null,
  shift: r.shift ?? null,
  with_staff_id: r.withStaffId ?? null,
  return_date: r.returnDate ?? null,
  note: r.note ?? null,
  status: r.status,
  created_at: r.createdAt,
  decided_at: r.decidedAt ?? null,
  decision_note: r.decisionNote ?? null,
});

export function fromRequestRows(rows: RequestRow[]): ShiftRequest[] {
  return rows.map((row) => {
    const r: ShiftRequest = {
      id: row.id,
      groupId: row.group_id,
      kind: row.kind,
      staffId: row.staff_id,
      date: row.date,
      createdAt: row.created_at,
      status: row.status,
    };
    if (row.end_date) r.endDate = row.end_date;
    if (row.shift) r.shift = row.shift;
    if (row.with_staff_id) r.withStaffId = row.with_staff_id;
    if (row.return_date) r.returnDate = row.return_date;
    if (row.note) r.note = row.note;
    if (row.decided_at) r.decidedAt = row.decided_at;
    if (row.decision_note) r.decisionNote = row.decision_note;
    return r;
  });
}

/** Server wins for ids both sides know; requests that exist only locally are kept (they get uploaded). */
export function mergeRequests(remote: ShiftRequest[], local: ShiftRequest[]): ShiftRequest[] {
  const known = new Set(remote.map((r) => r.id));
  return [...remote, ...local.filter((r) => !known.has(r.id))];
}
