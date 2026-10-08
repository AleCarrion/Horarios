"use client";

import { ErrorScreen } from "@/components/ErrorScreen";

export default function Error({ reset }: { error: Error; reset: () => void }) {
  return <ErrorScreen title="Algo ha fallado" text="No se ha perdido nada: tus datos siguen guardados en este dispositivo. Prueba a reintentar." retry={reset} />;
}
