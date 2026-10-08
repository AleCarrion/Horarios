/** What the manager decided about a month: published (final) or reopened (a past month opened for a correction). */
export interface MonthState {
  state: "published" | "reopened";
  /** ISO timestamp. */
  at: string;
}

const lastDay = (year: number, month: number) => `${year}-${String(month).padStart(2, "0")}-${String(new Date(Date.UTC(year, month, 0)).getUTCDate()).padStart(2, "0")}`;

/** A month is closed for editing when it is published, or it is over and nobody reopened it. */
export function isMonthClosed(s: MonthState | null, year: number, month: number, today: string | null): boolean {
  if (s?.state === "published") return true;
  if (s?.state === "reopened") return false;
  return today !== null && lastDay(year, month) < today;
}

export type MonthLabel = "draft" | "published" | "past" | "reopened";
export function monthLabel(s: MonthState | null, year: number, month: number, today: string | null): MonthLabel {
  if (s?.state === "published") return "published";
  if (s?.state === "reopened") return "reopened";
  return today !== null && lastDay(year, month) < today ? "past" : "draft";
}
