import type { jsPDF as JsPDF } from "jspdf";
import { TOTALS, stampOf, type MonthReport, type ReportRow } from "./domain/report";
import type { Section } from "./domain/team";

type Doc = JsPDF;
const rgb = (hex: string): [number, number, number] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const fill = (doc: Doc, hex: string) => doc.setFillColor(...rgb(hex));
const ink = (doc: Doc, hex: string) => doc.setTextColor(...rgb(hex));
const BRAND = "#6f5528";
const LINE = "#c8c2b8";
const WEEKEND = "#f3e9d7";
const HOLIDAY = "#f8d7c4";

async function newDoc(orientation: "landscape" | "portrait"): Promise<Doc> {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ orientation, unit: "mm", format: "a4", compress: true });
  doc.setLineWidth(0.15);
  doc.setDrawColor(...rgb(LINE));
  return doc;
}

function footer(doc: Doc, r: MonthReport, now: Date, page?: string) {
  const w = doc.internal.pageSize.getWidth();
  const h = doc.internal.pageSize.getHeight();
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  ink(doc, "#777777");
  doc.text(`Generado el ${stampOf(now)} · Horarios · ${r.hotel}`, 8, h - 5);
  if (page) doc.text(page, w - 8, h - 5, { align: "right" });
}

function legend(doc: Doc, r: MonthReport, x0: number, y0: number, maxX: number) {
  doc.setFontSize(7);
  let x = x0;
  let y = y0;
  for (const l of r.legend) {
    const text = `${l.label}${l.hours ? ` ${l.hours}` : ""}`;
    const w = 7 + doc.getTextWidth(text) + 5;
    if (x + w > maxX) {
      x = x0;
      y += 5;
    }
    fill(doc, l.fill);
    doc.roundedRect(x, y - 3, 6, 4, 0.8, 0.8, "F");
    doc.setFont("helvetica", "bold");
    ink(doc, l.ink);
    doc.text(l.letter, x + 3, y - 0.2, { align: "center" });
    doc.setFont("helvetica", "normal");
    ink(doc, "#333333");
    doc.text(text, x + 7, y - 0.2);
    x += w;
  }
  return y;
}

/** The whole month on one landscape A4: colours, sections, totals per person, coverage and legend. */
export async function monthPdf(r: MonthReport, now = new Date()): Promise<Blob> {
  const doc = await newDoc("landscape");
  const W = 297;
  const H = 210;
  const M = 8;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  ink(doc, BRAND);
  doc.text(`Horario ${r.title}`, M, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  ink(doc, "#555555");
  doc.text(r.hotel, W - M, 13, { align: "right" });

  const nameW = 34;
  const totW = [6, 6, 6, 10, 9, 8, 9];
  const totals = totW.reduce((a, b) => a + b, 0);
  const n = r.days.length;
  const dayW = (W - 2 * M - nameW - totals) / n;
  const top = 18;
  const headH = 8;
  const people = r.groups.reduce((a, g) => a + g.rows.length, 0);
  const sectionH = 4;
  const coverH = 3.6;
  const avail = H - top - headH - 18 /* legend + footer */ - r.groups.length * sectionH - 3 * coverH - 2;
  const rowH = Math.max(3.2, Math.min(9, avail / Math.max(1, people)));
  const xDay = (i: number) => M + nameW + i * dayW;
  const xTot = M + nameW + n * dayW;

  // header: weekday letter + day number; weekends and holidays shaded down the whole column
  const bodyH = r.groups.length * sectionH + people * rowH;
  r.days.forEach((d, i) => {
    if (d.weekend || d.holiday) {
      fill(doc, d.holiday ? HOLIDAY : WEEKEND);
      doc.rect(xDay(i), top, dayW, headH + bodyH, "F");
    }
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    ink(doc, d.holiday ? "#a8480f" : "#666666");
    doc.text(d.weekday, xDay(i) + dayW / 2, top + 3, { align: "center" });
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    ink(doc, d.holiday ? "#a8480f" : "#222222");
    doc.text(String(d.day), xDay(i) + dayW / 2, top + 7, { align: "center" });
  });
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7);
  ink(doc, "#222222");
  doc.text("Persona", M + 1, top + 7);
  let tx = xTot;
  TOTALS.forEach((t, i) => {
    doc.text(t.label, tx + totW[i] / 2, top + 7, { align: "center" });
    tx += totW[i];
  });

  let y = top + headH;
  const sectionBand = (s: Section, count: number) => {
    fill(doc, s.color);
    doc.rect(M, y, W - 2 * M, sectionH, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(6.5);
    ink(doc, "#ffffff");
    doc.text(`${s.label.toUpperCase()}  (${count})`, M + 1.5, y + 2.9);
    y += sectionH;
  };
  const personRow = (row: ReportRow) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(Math.min(8, rowH * 1.6));
    ink(doc, "#111111");
    const name = doc.splitTextToSize(row.staff.name, nameW - 2)[0] as string;
    doc.text(name, M + 1, y + rowH / 2 + 1.1);
    const pad = Math.min(0.5, rowH * 0.08);
    row.cells.forEach((c, i) => {
      fill(doc, c.fill);
      doc.rect(xDay(i) + pad, y + pad, dayW - 2 * pad, rowH - 2 * pad, "F");
      if (c.letter && c.code !== "B") {
        doc.setFontSize(Math.min(7.5, rowH * 1.5, dayW * 1.3));
        ink(doc, c.ink);
        doc.text(c.letter, xDay(i) + dayW / 2, y + rowH / 2 + 1, { align: "center" });
      }
    });
    let x = xTot;
    doc.setFontSize(Math.min(7.5, rowH * 1.5));
    TOTALS.forEach((t, i) => {
      doc.setFont("helvetica", t.key === "h" ? "bold" : "normal");
      ink(doc, "#222222");
      doc.text(String(t.value(row.summary)), x + totW[i] / 2, y + rowH / 2 + 1, { align: "center" });
      x += totW[i];
    });
    doc.line(M, y + rowH, W - M, y + rowH);
    y += rowH;
  };
  for (const g of r.groups) {
    sectionBand(g.section, g.rows.length);
    for (const row of g.rows) personRow(row);
  }
  doc.line(xTot, top, xTot, y);

  // coverage
  y += 1.5;
  (["M", "T", "N"] as const).forEach((k) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6.5);
    ink(doc, "#444444");
    doc.text(`Cobertura ${k === "M" ? "mañana" : k === "T" ? "tarde" : "noche"}`, M + 1, y + 2.7);
    r.days.forEach((d, i) => {
      const v = d.cover[k];
      doc.setFont("helvetica", v === 1 ? "normal" : "bold");
      ink(doc, v === 1 ? "#2e7d32" : "#c62828");
      doc.text(String(v), xDay(i) + dayW / 2, y + 2.7, { align: "center" });
    });
    y += coverH;
  });

  legend(doc, r, M, Math.min(y + 6, H - 12), W - M);
  footer(doc, r, now);
  return doc.output("blob");
}

const MONDAY_FIRST = ["L", "M", "X", "J", "V", "S", "D"];

/** One portrait page per person: the month as a calendar with their shifts, hours and totals. */
export async function peoplePdf(r: MonthReport, staffIds: string[], now = new Date()): Promise<Blob> {
  const doc = await newDoc("portrait");
  const W = 210;
  const M = 12;
  const rows = r.groups.flatMap((g) => g.rows.map((row) => ({ row, section: g.section }))).filter((x) => staffIds.includes(x.row.staff.id));
  rows.forEach(({ row, section }, p) => {
    if (p > 0) doc.addPage("a4", "portrait");
    // header
    fill(doc, section.color);
    doc.rect(M, 12, 3, 14, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(18);
    ink(doc, "#111111");
    doc.text(row.staff.name, M + 6, 19);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    ink(doc, "#555555");
    doc.text(`${section.label} · ${r.hotel}`, M + 6, 25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    ink(doc, BRAND);
    doc.text(r.title, W - M, 19, { align: "right" });

    // calendar
    const top = 34;
    const cw = (W - 2 * M) / 7;
    const first = (new Date(Date.UTC(r.year, r.month - 1, 1)).getUTCDay() + 6) % 7; // Monday = 0
    const weeks = Math.ceil((first + r.days.length) / 7);
    const ch = Math.min(34, (297 - top - 70) / weeks);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    MONDAY_FIRST.forEach((d, i) => {
      ink(doc, i >= 5 ? "#a8480f" : "#666666");
      doc.text(d, M + i * cw + cw / 2, top - 2, { align: "center" });
    });
    r.days.forEach((d, i) => {
      const k = first + i;
      const x = M + (k % 7) * cw;
      const y = top + Math.floor(k / 7) * ch;
      const c = row.cells[i];
      fill(doc, d.holiday ? HOLIDAY : d.weekend ? WEEKEND : "#ffffff");
      doc.roundedRect(x + 0.6, y + 0.6, cw - 1.2, ch - 1.2, 1.5, 1.5, "FD");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      ink(doc, d.holiday ? "#a8480f" : "#333333");
      doc.text(String(d.day), x + 2.6, y + 5);
      if (c.code !== "B") {
        fill(doc, c.fill);
        doc.roundedRect(x + 2.2, y + 7, cw - 4.4, ch - 9.4, 1.2, 1.2, "F");
        ink(doc, c.ink);
        doc.setFontSize(Math.min(16, ch * 0.5));
        doc.text(c.letter, x + cw / 2, y + 7 + (ch - 9.4) * 0.48, { align: "center" });
        const leg = r.legend.find((l) => l.code === c.code);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(6.5);
        const label = doc.splitTextToSize(leg?.label ?? "", cw - 6)[0] as string;
        doc.text(label, x + cw / 2, y + ch - 6.2, { align: "center" });
        if (leg?.hours) doc.text(leg.hours, x + cw / 2, y + ch - 3.4, { align: "center" });
      }
    });

    // totals
    const ty = top + weeks * ch + 8;
    const items: [string, string][] = [
      ["Horas", String(Math.round(row.summary.hours * 10) / 10)],
      ["Días trabajados", String(row.summary.worked)],
      ["Mañanas", String(row.summary.M)],
      ["Tardes", String(row.summary.T)],
      ["Noches", String(row.summary.N)],
      ["Libres", String(row.summary.libres)],
      ["Vacaciones", String(row.summary.vacaciones)],
      ["Fines de semana", String(row.summary.weekends)],
    ];
    const bw = (W - 2 * M) / 4;
    items.forEach(([label, value], i) => {
      const x = M + (i % 4) * bw;
      const y = ty + Math.floor(i / 4) * 16;
      fill(doc, "#f6f1e9");
      doc.roundedRect(x + 1, y, bw - 2, 14, 2, 2, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      ink(doc, "#111111");
      doc.text(value, x + 5, y + 7);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      ink(doc, "#555555");
      doc.text(label, x + 5, y + 11.5);
    });
    legend(doc, { ...r, legend: r.legend.filter((l) => row.cells.some((c) => c.code === l.code)) }, M, ty + 40, W - M);
    footer(doc, r, now, rows.length > 1 ? `${p + 1} / ${rows.length}` : undefined);
  });
  return doc.output("blob");
}
