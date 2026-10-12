"use client";

import { useEffect, useState, type ReactNode } from "react";
import { getStoredRole } from "@/lib/session";
import { SHIFTS, displayCode } from "@/lib/domain/types";
import { legendCodes, shiftPaint } from "@/lib/domain/catalog";
import { AppNav } from "./AppNav";
import { LogoMark, PrinterIcon } from "./icons";
import { MobileTabBar } from "./MobileTabBar";

type Who = "jefa" | "trabajador";

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3 break-inside-avoid print:gap-2">
      <span aria-hidden="true" className="mt-0.5 grid h-7 w-7 shrink-0 print:h-5 print:w-5 print:text-[10px] place-items-center rounded-full bg-brand-solid text-sm font-bold text-white print:border print:border-black print:bg-white print:text-black">{n}</span>
      <div className="min-w-0">
        <h3 className="font-semibold print:text-[13.5px]">{title}</h3>
        <div className="mt-0.5 text-sm leading-relaxed text-muted print:text-[12px] print:leading-snug print:text-black">{children}</div>
      </div>
    </li>
  );
}

function Legend() {
  return (
    <section aria-label="Qué significan las letras" className="break-inside-avoid rounded-2xl border border-line p-4 print:p-2">
      <h3 className="font-semibold">Las letras del horario</h3>
      <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3 print:grid-cols-3 print:gap-y-1 print:text-[11.5px]">
        {legendCodes().map((c) => (
          <li key={c} className="flex items-center gap-2">
            <span style={shiftPaint(c)} className="grid h-6 w-7 shrink-0 place-items-center rounded-md text-xs font-bold">{displayCode(c)}</span>
            <span>{SHIFTS[c].label}{SHIFTS[c].start ? <span className="text-muted print:text-black"> {SHIFTS[c].start}–{SHIFTS[c].end}</span> : null}</span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted print:text-black">La <b>L</b> es libre. Las casillas marcadas con un candado están bloqueadas: no se mueven al reajustar.</p>
    </section>
  );
}

function ForBoss() {
  return (
    <div className="space-y-5">
      <ol className="space-y-4 print:space-y-3">
        <Step n={1} title="Entrar">
          Con tu correo y tu contraseña. La primera persona que entra es la administradora. Desde <b>Accesos</b> (en el círculo de arriba a la derecha → Mi cuenta) invitas a los demás: eliges si podrán <i>editar</i> o solo <i>ver y enviar peticiones</i> (trabajador, y qué persona del equipo es) y compartes el enlace por WhatsApp. Cada persona crea su cuenta desde el enlace, que sirve una vez y caduca a los 14 días.
        </Step>
        <Step n={2} title="Cambiar el horario">
          Toca una casilla y elige el turno. Con <b>«reajustar el resto del horario»</b> marcado, la app te enseña qué otros cambios hacen falta (siempre los mínimos) y no cambia nada hasta que pulsas <b>Aplicar</b>. Puedes poner <b>«Aplicar a N días»</b> (por ejemplo, 14 de vacaciones) y <b>bloquear</b> una casilla para que ninguna otra acción la mueva.
        </Step>
        <Step n={3} title="Generar, arreglar y copiar">
          <b>Generar automático</b> rehace el mes (te pide confirmar y se puede deshacer). Si abajo salen <b>avisos</b>, pulsa <b>Ver</b> para ir a ese día o <b>Arreglar avisos</b> para que la app proponga la solución. <b>Copiar el mes anterior</b> pone el patrón del mes pasado (mismo día de la semana, cuatro semanas antes) y lo ajusta a las reglas; <b>Comparar meses</b> te enseña qué cambia por persona.
        </Step>
        <Step n={4} title="Peticiones de los trabajadores">
          Llegan a la bandeja <b>Solicitudes</b> (el icono con el contador). Cada una tiene un semáforo: <b>verde</b> cuadra sin problemas, <b>ámbar</b> se puede forzando algo, <b>rojo</b> no cuadra (y te dice qué desbloquear o qué regla relajar). Pulsa <b>Revisar y aprobar</b>, mira la vista previa y <b>Aplicar</b>; o <b>Rechazar</b> con una nota que verá el trabajador.
        </Step>
        <Step n={5} title="Si alguien falta de repente">
          Toca su casilla → <b>Ausencia / baja</b>. No hay plazo ni días protegidos: la app te dice <b>a quién avisar</b> para cubrir.
        </Step>
        <Step n={6} title="Equipo y reglas">
          En <b>Equipo</b> añades o das de baja a personas, cambias su puesto o sus fechas (con vista previa antes de aplicar). En <b>Reglas</b> ajustas los días máximos seguidos de trabajo o descanso, lo de un solo partido al día y los festivos locales.
        </Step>
        <Step n={7} title="Publicar y guardar">
          <b>Publicar mes</b> lo da por bueno (no se edita por accidente; <b>Reabrir</b> para corregir). El reloj abre el <b>historial</b>: qué se cambió y cuándo, con «Volver a…» en cada casilla. En <b>Exportar</b> tienes PDF, CSV (Excel) y la <b>copia de seguridad</b>: guárdala de vez en cuando.
        </Step>
      </ol>
      <Legend />
    </div>
  );
}

function ForWorker() {
  return (
    <div className="space-y-5">
      <ol className="space-y-4 print:space-y-3">
        <Step n={1} title="Crear tu cuenta">
          La jefa te manda un <b>enlace de invitación</b>. Ábrelo, escribe tu correo y elige una contraseña (8 o más caracteres, con letras y números). Ya estás dentro. Otro día: entra con ese mismo correo y contraseña; si la olvidas, pulsa <b>«He olvidado la contraseña»</b>.
        </Step>
        <Step n={2} title="Ver tu horario">
          Tu fila sale marcada con <b>«tú»</b>. En el móvil se ve una semana cada vez: desliza el dedo (o usa las flechas) para cambiar de semana, y el botón <b>Mes</b> para verlo entero. Si el mes aún no está publicado, la jefa todavía lo está preparando.
        </Step>
        <Step n={3} title="Pedir un libre, vacaciones o un cambio">
          Pulsa <b>Mis peticiones</b> (el icono de la bandeja, o la pestaña de abajo en el móvil) → <b>Nueva petición</b>. Puedes pedir un día libre, vacaciones, hacer un turno concreto (por ejemplo, mañanas dos días) o cambiar el turno con un compañero. Lo ideal es pedirlo <b>con un mes de antelación</b>; si es urgente, avisa también a la jefa.
        </Step>
        <Step n={4} title="Saber cómo va tu petición">
          Cada una aparece como <b>Pendiente</b>, <b>Aprobada</b> o <b>Rechazada</b>, con el comentario de la jefa si lo hay. Mientras esté pendiente puedes <b>cancelarla</b>.
        </Step>
        <Step n={5} title="Llevarlo en el móvil">
          En el móvil, abre la web y elige <b>«Añadir a pantalla de inicio»</b> (en iPhone, desde el botón Compartir): queda como una aplicación y también funciona sin conexión para consultar el horario.
        </Step>
      </ol>
      <Legend />
    </div>
  );
}

/** One-page manual for the manager and for the workers (printable). */
export function HelpPage() {
  const [who, setWho] = useState<Who>("jefa");
  useEffect(() => {
    setWho(getStoredRole() === "worker" ? "trabajador" : "jefa"); // eslint-disable-line react-hooks/set-state-in-effect
  }, []);

  const tab = (w: Who, label: string) => (
    <button
      type="button"
      aria-pressed={who === w}
      onClick={() => setWho(w)}
      className={`min-h-10 rounded-xl px-4 text-sm font-semibold transition ${who === w ? "bg-brand-solid text-white shadow" : "text-muted hover:bg-brand/10"}`}
    >
      {label}
    </button>
  );

  return (
    <>
      <header className="glass sticky top-0 z-30 border-x-0 border-t-0 pt-[env(safe-area-inset-top)] print:hidden">
        <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-brand to-brand-2 shadow-lg shadow-brand/30 sm:h-11 sm:w-11">
              <LogoMark />
            </span>
            <div className="leading-tight">
              <p className="text-lg font-bold tracking-tight">Horarios</p>
              <p className="text-xs text-muted">Hotel Casa 1800</p>
            </div>
          </div>
          <div className="max-sm:hidden"><AppNav /></div>
        </div>
      </header>

      <main className="help-sheet mx-auto w-full min-w-0 max-w-[820px] space-y-5 p-4 print:max-w-none print:space-y-3 print:p-0">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl print:text-lg">{who === "jefa" ? "Manual para la jefa" : "Manual para los trabajadores"}</h1>
            <p className="mt-1 text-sm text-muted print:hidden">Lo esencial en una hoja. Puedes imprimirla o guardarla en PDF.</p>
            <p className="hidden text-sm print:block">Hotel Casa 1800 · Horarios</p>
          </div>
          <button type="button" onClick={() => window.print()} className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm font-semibold transition hover:bg-brand/10 active:scale-95 print:hidden">
            <PrinterIcon width={16} height={16} /> Imprimir esta hoja
          </button>
        </div>

        <div role="group" aria-label="¿Para quién?" className="flex gap-1 rounded-2xl border border-line bg-card-solid/70 p-1 print:hidden">
          {tab("jefa", "Para la jefa")}
          {tab("trabajador", "Para los trabajadores")}
        </div>

        {who === "jefa" ? <ForBoss /> : <ForWorker />}
      </main>
      <MobileTabBar />
    </>
  );
}
