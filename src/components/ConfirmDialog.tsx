"use client";

import { useEffect, useRef } from "react";
import { AlertIcon } from "./icons";

interface Props {
  title: string;
  children: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Small "are you sure?" dialog. Cancel has the initial focus, so Enter never confirms by accident. */
export function ConfirmDialog({ title, children, confirmLabel, cancelLabel = "Cancelar", onConfirm, onCancel }: Props) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancel.current?.focus();
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [onCancel]);

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/50 p-4 backdrop-blur-sm print:hidden" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-body"
        onClick={(e) => e.stopPropagation()}
        className="anim-menu w-full max-w-md rounded-3xl bg-card-solid p-6 shadow-2xl"
      >
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-amber-400/25 text-amber-700 dark:text-amber-300">
            <AlertIcon />
          </span>
          <div>
            <h2 id="confirm-title" className="text-lg font-bold">{title}</h2>
            <div id="confirm-body" className="mt-1 text-sm text-muted">{children}</div>
          </div>
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <button
            ref={cancel}
            onClick={onCancel}
            className="rounded-xl border border-line px-4 py-2 text-sm font-semibold transition hover:bg-brand/10 focus-visible:outline-2 focus-visible:outline-brand"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className="rounded-xl bg-gradient-to-r from-accent to-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-accent/30 transition hover:-translate-y-0.5 active:scale-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
