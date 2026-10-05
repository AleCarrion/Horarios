"use client";

import { useEffect, useState } from "react";

export function PwaStatus() {
  const [online, setOnline] = useState(true);

  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    }
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  if (online) return null;
  return (
    <div role="status" className="bg-amber-200 px-4 py-2 text-center text-sm font-medium text-amber-950 print:hidden">
      Sin conexión · Puedes seguir viendo y editando; los cambios se guardan en este dispositivo.
    </div>
  );
}
