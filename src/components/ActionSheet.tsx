"use client";

import { useEffect, type ReactNode } from "react";

export interface SheetAction {
  label: string;
  hint?: string;
  icon: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "accent";
}

/** Bottom sheet with the actions that do not fit in the phone's top bar. */
export function ActionSheet({ open, onClose, actions }: { open: boolean; onClose: () => void; actions: SheetAction[] }) {
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 sm:hidden print:hidden" onClick={onClose}>
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-[2px]" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Más acciones"
        onClick={(e) => e.stopPropagation()}
        className="anim-sheet absolute inset-x-0 bottom-0 rounded-t-3xl bg-card-solid p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-2xl"
      >
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-line" aria-hidden="true" />
        <ul className="space-y-1">
          {actions.map((a) => (
            <li key={a.label}>
              <button
                disabled={a.disabled}
                onClick={() => {
                  onClose();
                  a.onClick();
                }}
                className={`flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-left text-base font-semibold transition active:scale-[0.99] disabled:pointer-events-none disabled:opacity-35 ${
                  a.tone === "accent" ? "bg-gradient-to-r from-accent to-orange-500 text-white shadow-lg shadow-accent/30" : "hover:bg-brand/10"
                }`}
              >
                <span className={a.tone === "accent" ? "" : "text-brand"}>{a.icon}</span>
                <span className="flex-1">
                  {a.label}
                  {a.hint && <span className={`block text-xs font-normal ${a.tone === "accent" ? "text-white/80" : "text-muted"}`}>{a.hint}</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
