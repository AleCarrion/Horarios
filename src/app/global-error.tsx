"use client";

export default function GlobalError({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center" }}>
        <div>
          <h1>Algo ha fallado</h1>
          <p>No se ha perdido nada: tus datos siguen guardados en este dispositivo.</p>
          <button onClick={reset} style={{ padding: "8px 16px", fontSize: 16 }}>Reintentar</button>
        </div>
      </body>
    </html>
  );
}
