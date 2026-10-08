"use client";

import { useEffect, useState } from "react";

export function PwaStatus() {
  const [online, setOnline] = useState(true);
  const [fresh, setFresh] = useState(false);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    let onChange: (() => void) | undefined;
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
      // a new version took over while this page was open: offer to reload (never reload by surprise, the manager may be editing)
      if (navigator.serviceWorker.controller) {
        onChange = () => setFresh(true);
        navigator.serviceWorker.addEventListener("controllerchange", onChange);
      }
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      if (onChange) navigator.serviceWorker.removeEventListener("controllerchange", onChange);
    };
  }, []);

  return (
    <>
      {!online && (
        <div role="status" className="anim-fade-up bg-gradient-to-r from-amber-300 to-orange-300 px-4 py-2 text-center text-sm font-semibold text-amber-950 print:hidden">
          Sin conexión · Puedes seguir viendo y editando; los cambios se guardan en este dispositivo.
        </div>
      )}
      {fresh && (
        <div role="status" className="anim-fade-up flex flex-wrap items-center justify-center gap-3 bg-brand px-4 py-2 text-center text-sm font-semibold text-white print:hidden">
          Hay una versión nueva de la aplicación.
          <button type="button" onClick={() => window.location.reload()} className="rounded-lg bg-white/20 px-3 py-1 transition hover:bg-white/30 active:scale-95">
            Actualizar
          </button>
        </div>
      )}
    </>
  );
}
