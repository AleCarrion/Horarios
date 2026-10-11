import type { MonthState } from "./domain/monthStatus";

/** `public.schedule_months` row (see supabase/migrations/0006). */
export interface MonthRow {
  year: number;
  month: number;
  status: "draft" | "published" | "reopened";
  changed_at: string;
}

/** The app keeps "no decision yet" as null; the server calls it "draft". */
export const toMonthRow = (year: number, month: number, s: MonthState | null): Pick<MonthRow, "year" | "month" | "status"> => ({ year, month, status: s?.state ?? "draft" });

export const fromMonthRow = (row: Pick<MonthRow, "status" | "changed_at">): MonthState | null => (row.status === "draft" ? null : { state: row.status, at: row.changed_at });

/** Same decision, whatever the timestamp. */
export const sameState = (a: MonthState | null, b: MonthState | null) => (a?.state ?? null) === (b?.state ?? null);
