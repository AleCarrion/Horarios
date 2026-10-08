# Horarios Casa 1800 — estudio de la aplicación y plan de trabajo

Estado a fecha de hoy: motor de horarios (generador + reajuste mínimo + reglas), editor de cuadrante, página de equipo,
solicitudes (libre, vacaciones, cambio, turno pedido), bloqueos, avisos accionables, exportación (PDF/CSV/iCal), PWA offline,
versión móvil, y sincronización con Supabase preparada pero **sin proyecto real conectado todavía**.

Tamaño: ~6.900 líneas, 233 tests (reglas, reparación con pruebas aleatorias, sync con mocks). Sin CI, sin tests de interfaz en el repo.

Leyenda: **S** = menos de medio día · **M** = 1–2 días · **L** = varios días. 🔴 urgente · 🟡 importante · 🟢 opcional.

---

## 1. Lo que echaría en falta cada perfil

### Jefa de recepción (quien edita el cuadrante)
| Necesidad | Hoy | Hueco |
|---|---|---|
| Ausencia imprevista hoy ("hoy no viene X") | Hay que editar a mano o pedir un libre | Botón **Ausencia / baja médica** que reajusta con urgencia (ignora el plazo de 30 días, avisa de a quién llamar) |
| Saber quién puede cubrir | No se ve | Panel "disponibles para cubrir el día D" (descansan, no rompen reglas, cuántas coberturas llevan) |
| Equidad | Solo contadores en el motor | **Resumen mensual por persona**: noches, fines de semana, festivos, partidos, coberturas, libres, horas |
| Empezar el mes siguiente | Genera desde cero con historial | Copiar patrón, comparar con el mes anterior, "qué cambió" |
| Notas del día | No hay | Notas/eventos por día (grupo grande, obras, formación) visibles en la cuadrícula |
| Deshacer una aprobación | Solo Deshacer de la sesión | Revertir una solicitud aprobada (y desbloquear sus celdas) |
| Entender un "rojo" | Dice qué regla falla | Decir **qué desbloquear/relajar** para que sí cuadre (p. ej. "con Marcos libre el 12 sí cuadra si Julio cubre T") |
| Reglas | Fijas en código (3 libres, 1 partido, topes) | Pantalla de reglas editable por la jefa |
| Festivos | Nacionales + manual | Festivos locales/autonómicos configurables por año |
| Imprimir | PDF correcto | Versión idéntica al Excel del hotel (plantilla) y envío por correo |

### Director / dirección
| Necesidad | Hueco |
|---|---|
| Visión de cumplimiento legal | Informe de reglas (descanso entre turnos, descanso semanal, jornada máxima, domingos/festivos) con histórico |
| Control de horas y coste | Horas por persona/mes frente a jornada, horas extra, festivos trabajados, nocturnidad |
| Vacaciones | **Calendario anual** de vacaciones y saldo por persona (días disfrutados/pendientes) |
| Absentismo | Informe de ausencias y bajas por mes |
| Trazabilidad | Pantalla de **historial de cambios** (quién cambió qué y cuándo; ya se guarda en `audit_log` pero no se ve) |
| Permisos | Rol "dirección" de solo lectura + informes, distinto de la jefa (editora) |
| Aprobación | Opcional: segundo nivel de aprobación para cambios cercanos en el tiempo |

### Trabajador
| Necesidad | Hueco |
|---|---|
| Ver **mi** horario | Vista personal (hoy solo existe la del jefe) |
| Pedir libre / cambio / turno | Formulario propio con estado (pendiente/aprobada/rechazada y motivo) |
| Avisos | "Tu horario del mes se ha publicado", "tu solicitud fue aprobada/rechazada", "te han cambiado el turno" |
| Calendario del móvil | iCal por persona ya existe; falta enlace suscribible que se actualice solo |
| Saldo | Mis vacaciones restantes, mis libres, mis noches |
| Acceso | Enlace personal sin contraseña (o magic link), sin ver datos de otros que no hagan falta |
| Cambio entre compañeros | Que dos trabajadores propongan el cambio y lo apruebe la jefa |

---

## 2. Riesgos y fallos que he detectado en el estudio

1. 🔴 **Lectura pública en la base de datos**: las políticas actuales permiten `select` a cualquiera con la clave *anon* (plantilla y cuadrante). La clave es pública en el navegador, así que hay que exigir sesión.
2. 🔴 **Los datos viven solo en `localStorage`** cuando no hay Supabase: borrar datos del navegador = perder el cuadrante. No hay copia de seguridad ni importar/exportar todo.
3. 🔴 **Sin control de versiones de mes**: no hay "mes publicado" frente a "borrador" persistido ni instantáneas; un error de edición no se puede recuperar tras cerrar.
4. 🔴 **Primera sincronización sin estrategia de conflictos**: al conectar Supabase hay datos locales y remotos; falta decidir qué gana, avisar y fusionar.
5. 🟡 **Sin CI ni pruebas de interfaz**: los 233 tests son de dominio; nada vigila que la pantalla siga funcionando tras un cambio (esta sesión he usado scripts manuales de Playwright que no están en el repo).
6. 🟡 **Sin páginas de error** (`error.tsx`, `not-found.tsx`, `global-error.tsx`) ni monitorización: un fallo en pantalla es una página en blanco.
7. 🟡 **Sin cabeceras de seguridad** (CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy).
8. 🟡 **El motor es heurístico (voraz)**: va bien (≈80 % de las peticiones de turno cuadran, el resto lo explica), pero puede devolver rojo en casos justos; falta explicar "qué cambiar para que cuadre".
9. 🟡 **Reglas del hotel codificadas en el código** (máx. 3 libres, 1 partido, topes de coberturas, Ana/Julio): cambiarlas exige programar.
10. 🟡 **Actualización del PWA**: hay service worker con versión manual; falta aviso "hay una versión nueva, recargar" y política clara de caché.
11. 🟢 `ScheduleApp.tsx` (≈640 líneas) concentra demasiado estado; conviene trocearlo antes de añadir más funciones.
12. 🟢 Accesibilidad revisada a mano; falta auditoría automática (axe) y revisión de contraste en modo oscuro.
13. 🟢 RGPD: se manejan datos personales (nombres, ausencias, bajas médicas); falta política de privacidad, retención y supresión.

---

## 3. Plan por fases

### Fase A — Antes de tocar Supabase (cerrar la app) · 🔴
| # | Tarea | Tamaño | Criterio de aceptación |
|---|---|---|---|
| A1 | Copia de seguridad: exportar/importar **todo** (equipo, meses, solicitudes, bloqueos) en un JSON versionado | M | Exportar → borrar datos → importar deja la app idéntica; test de ida y vuelta |
| A2 | Estado del mes: **borrador / publicado**, y meses pasados de solo lectura (con opción de reabrir) | M | Un mes publicado no se regenera sin confirmación explícita; badge visible |
| A3 | Historial de cambios (pantalla): quién/cuándo/qué, filtrable por persona y día, con "restaurar este valor" | M | Lee de `audit_log` en remoto y de un registro local en modo local |
| A4 | **Ausencia imprevista** (baja médica hoy): reajuste urgente sin el plazo de 30 días, con lista de a quién llamar | M | Test de dominio + vista previa como el resto de planes |
| A5 | Resumen mensual por persona (noches, finde, festivos, partidos, coberturas, libres, horas) | M | Visible en una pestaña y exportable |
| A6 | Pantalla de **reglas** editable (máx. libres, partidos al día, descanso mínimo, topes de coberturas, cobertura mínima) con valores del hotel por defecto | L | El generador y el validador leen la configuración; tests con otros valores |
| A7 | Festivos locales/autonómicos configurables por año | S | Se aplican a generador y validador |
| A8 | Explicar los rojos: "qué desbloquear/relajar para que cuadre" | L | Para un plan rojo, sugiere 1–3 acciones que lo vuelven verde (verificadas con el motor) |
| A9 | Páginas de error y 404, aviso de "nueva versión disponible" del PWA | S | Probado con fallo forzado y con versión nueva del service worker |
| A10 | CI (GitHub Actions: typecheck, lint, test, build) + tests e2e de los flujos clave (Playwright en el repo) | M | Cada push ejecuta todo; e2e: generar mes, editar celda, pedir libre, arreglar avisos, móvil |
| A11 | Cabeceras de seguridad (CSP, HSTS, etc.) | S | Sin errores en consola; calificación A en un escáner de cabeceras |

### Fase B — Supabase y base de datos (siguiente paso que ya has pedido) · 🔴
| # | Tarea | Tamaño |
|---|---|---|
| B1 | Crear el proyecto real, ejecutar migraciones 0001–0004 + seed, variables en `.env.local` y Vercel, URL de redirección, fila en `editors` | S |
| B2 | **Endurecer RLS**: nada de lectura anónima; roles `editor` (jefa), `viewer` (dirección), `worker` (futuro); pruebas de políticas (pgTAP o scripts) | M |
| B3 | **Migración local → remoto**: primera conexión con diálogo "tienes datos en este dispositivo: subir / descartar / fusionar" | M |
| B4 | Conflictos entre dispositivos: última escritura por celda ya existe; añadir aviso cuando alguien edita a la vez y versión por mes | M |
| B5 | Tabla de **meses** (`schedule_months`: estado borrador/publicado, quién y cuándo publicó, parámetros del generador) y **reglas** (`rules`) | M |
| B6 | Copias automáticas (backups diarios de Supabase / exportación programada) y entorno de **staging** distinto de producción | S |
| B7 | Autenticación: caducidad de sesión, límite de intentos del enlace mágico, (opcional) 2FA para la jefa | S |
| B8 | Pruebas contra un Supabase real (no solo mocks): suite de integración con una base de pruebas | M |

### Fase C — Trabajadores y avisos (lo dejaste "para el final") · 🟡
| # | Tarea | Tamaño |
|---|---|---|
| C1 | Acceso del trabajador: enlace personal / magic link, vista **Mi horario** de solo lectura | L |
| C2 | Solicitudes propias (libre, cambio, turno pedido) con estado y motivo; políticas RLS "solo las mías" | L |
| C3 | Avisos dentro de la app (campana) y luego por correo (publicación del mes, solicitud resuelta, cambio de turno) | L |
| C4 | Suscripción iCal automática por persona (URL con token revocable) | M |
| C5 | Cambio de turno propuesto por dos trabajadores y aprobado por la jefa | M |
| C6 | Saldo de vacaciones y libres por persona | M |

### Fase D — Dirección, informes y calidad · 🟡/🟢
| # | Tarea | Tamaño |
|---|---|---|
| D1 | Rol dirección (solo lectura + informes) | M |
| D2 | Calendario anual de vacaciones + informes de horas, absentismo, cumplimiento legal | L |
| D3 | Notas/eventos por día en el cuadrante | M |
| D4 | Panel "quién puede cubrir el día D" | M |
| D5 | Copiar patrón del mes anterior / comparar meses / simular "qué pasa si" | L |
| D6 | Plantilla de impresión idéntica al Excel + envío por correo | M |
| D7 | Monitorización de errores (Sentry o similar) y analítica sin datos personales | S |
| D8 | Auditoría de accesibilidad automática (axe) + revisión modo oscuro y lectores de pantalla | M |
| D9 | Trocear `ScheduleApp.tsx` (hooks por dominio: plan, solicitudes, bloqueos, vista) | M |
| D10 | RGPD: política de privacidad, retención de datos, borrado de personas dadas de baja, registro de accesos | M |
| D11 | Generador en *Web Worker* y límites de tiempo, para que nunca bloquee la interfaz | M |
| D12 | Manual de uso de 1 página para la jefa (y vídeo corto) | S |

---

## 4. Orden recomendado

1. **A1, A2, A9, A10, A11** (red de seguridad: copia, estado del mes, errores, CI, cabeceras).
2. **A3, A4, A5, A7** (lo que más usará la jefa a diario).
3. **A6, A8** (reglas editables y explicación de los rojos; es lo más grande, pero lo que más confianza da).
4. **Fase B entera** (Supabase real, RLS endurecido, migración local→remoto, staging y backups).
5. **Fase C** (trabajadores y avisos) y después **Fase D**.

Decisiones que necesito de ti antes de empezar la Fase B: ciudad/comunidad para los festivos locales, si la dirección debe tener
acceso propio, cuántos días de vacaciones anuales y jornada contratada tiene cada persona (para saldos y horas), y qué plazo de
conservación de datos quieres para bajas y ausencias.
