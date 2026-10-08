"use client";

import Link from "next/link";

export function ErrorScreen({ title, text, retry }: { title: string; text: string; retry?: () => void }) {
  return (
    <main className="mx-auto grid min-h-[70vh] max-w-md place-items-center px-6 text-center">
      <div className="glass rounded-3xl p-8">
        <h1 className="text-xl font-bold">{title}</h1>
        <p className="mt-2 text-sm text-muted">{text}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {retry && (
            <button type="button" onClick={retry} className="rounded-xl bg-gradient-to-r from-brand to-brand-2 px-4 py-2 font-semibold text-white shadow active:scale-95">
              Reintentar
            </button>
          )}
          <Link href="/" className="rounded-xl border border-line px-4 py-2 font-semibold transition hover:bg-brand/10">
            Ir al horario
          </Link>
        </div>
      </div>
    </main>
  );
}
