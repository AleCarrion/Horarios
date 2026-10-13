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

1. 🟢 **Lectura abierta en la base de datos** (decisión de la propietaria: **la app no se cierra**). Cualquiera que conozca la dirección puede *ver* el cuadrante sin iniciar sesión; solo la jefa puede *modificar* (eso sí está protegido). Se mantiene así porque la dirección es privada y casi nadie entra. Si algún día cambia, es un ajuste de una línea en las políticas.
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

> **Estado:** la **Fase A está completada** (A1–A11): copia de seguridad, estado del mes, historial, ausencia imprevista, resumen mensual, reglas y festivos editables, sugerencias cuando algo no cuadra, páginas de error, aviso de versión nueva, cabeceras de seguridad, CI y 15 pruebas de pantalla. **Fase B** (Supabase): hecho todo lo que se puede hacer y probar sin un proyecto real (B2–B8, ver `docs/SUPABASE.md`); falta solo crear el proyecto (B1), que es un paso tuyo de ~10 minutos.


### Fase A — Antes de tocar Supabase (terminar de pulir la app, sin restringir el acceso) · 🔴
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
| A11 | Cabeceras de seguridad básicas (HSTS, X-Frame-Options…); la CSP es opcional | S | Sin errores en consola |

### Fase B — Supabase y base de datos (siguiente paso que ya has pedido) · 🔴
| # | Tarea | Tamaño |
|---|---|---|
| B1 | Crear el proyecto real, ejecutar migraciones 0001–0004 + seed, variables en `.env.local` y Vercel, URL de redirección, fila en `editors` | S |
| B2 | Mantener la **lectura abierta** (sin login para ver); comprobar con pruebas que **escribir** solo puede la jefa (`editor`); dejar preparados los roles `viewer` y `worker` para más adelante | S |
| B3 | **Migración local → remoto**: primera conexión con diálogo "tienes datos en este dispositivo: subir / descartar / fusionar" | M |
| B4 | Conflictos entre dispositivos: última escritura por celda ya existe; añadir aviso cuando alguien edita a la vez y versión por mes | M |
| B5 | Tabla de **meses** (`schedule_months`: estado borrador/publicado, quién y cuándo publicó, parámetros del generador) y **reglas** (`rules`) | M |
| B6 | Copias automáticas (backups diarios de Supabase / exportación programada) y entorno de **staging** distinto de producción | S |
| B7 | Autenticación solo de la jefa: sesión que no caduque en su móvil, límite de intentos del enlace mágico (2FA opcional) | S |
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

1. **A1, A2, A9, A10, A11** (red de seguridad: copia, estado del mes, errores, CI, cabeceras; ninguna cierra el acceso).
2. **A3, A4, A5, A7** (lo que más usará la jefa a diario).
3. **A6, A8** (reglas editables y explicación de los rojos; es lo más grande, pero lo que más confianza da).
4. **Fase B entera** (Supabase real, solo la jefa edita, migración local→remoto, staging y backups).
5. **Fase C** (trabajadores y avisos) y después **Fase D**.

Principio acordado: **la app permanece abierta** (sin pantalla de acceso para ver); solo la edición va con la sesión de la jefa.

Decisiones que necesito de ti antes de empezar la Fase B: ciudad/comunidad para los festivos locales, si la dirección debe tener
acceso propio, cuántos días de vacaciones anuales y jornada contratada tiene cada persona (para saldos y horas), y qué plazo de
conservación de datos quieres para bajas y ausencias.

---

# Revisión crítica: ¿qué falta para salir al mercado?

> Hecha el 12-oct-2026 recorriendo todas las pantallas en móvil y escritorio, probando el motor con otros equipos (3, 6, 9, 12 personas) y revisando base de datos, seguridad y legal. Lo marcado **(probado)** lo he reproducido; **(código)** lo he visto leyendo el código. Estado actual: la app es **excelente para un hotel concreto (Casa 1800)** y **no está lista para venderse a otros** por los puntos de abajo.

## R1. Hallazgos

### Bloqueantes para vender (🔴)
1. **Es una app de un solo hotel** (código): el equipo por defecto, los nombres "Ana/Julio", los roles fijos (director, apoyo, recepción, noche, mozos), el nombre "Hotel Casa 1800" y el logo están escritos en el código. No existen "hoteles/cuentas": todos los datos de Supabase son de uno solo.
2. **Cobertura fija de 1 persona por turno** (probado): con 3 auditores de noche o 2 recepcionistas por tarde, el validador marca *error de cobertura* los 30 días del mes (equipo grande: 36 avisos falsos; equipo con 2 noches: 21). El motor solo sabe cubrir "1 mañana, 1 tarde, 1 noche". Un hotel mediano ya no puede usarla.
3. **Datos personales públicos** (código): la lectura es abierta a cualquiera con la dirección (decisión tomada para Casa 1800). Incluye nombres, bajas/ausencias y vacaciones → **RGPD**: para otros clientes es inaceptable. Además faltan política de privacidad, aviso legal, términos y gestión de derechos (acceso, borrado, exportación por persona).
4. **Sin aislamiento entre clientes** (código): las políticas RLS no tienen `hotel_id`; con dos clientes verían los datos del otro.
5. **Sin avisos reales** (código): las invitaciones son un enlace que la jefa copia y envía a mano; no hay correo de invitación ni notificaciones (mes publicado, petición resuelta, cambio de turno). Sin esto el trabajador no se entera de nada si no abre la app.
6. **Sin cobro ni alta de clientes**: no hay registro de un hotel nuevo, prueba gratuita, planes, facturación ni baja.
7. **Sin soporte ni operación** (código): no hay monitorización de errores, estado del servicio, copia de seguridad verificada ni entorno de pruebas separado (staging).

### Importantes (🟡)
8. **Reglas laborales incompletas** (código): se validan máximo de días seguidos, descanso entre turnos y festivos, pero **no** el descanso semanal mínimo (36 h/semana), las horas anuales/jornada contratada ni las vacaciones pactadas por convenio. Cada país/convenio distinto necesita su propio conjunto de reglas.
9. **Un solo idioma y una sola zona horaria** (código): todo en español, formato de fecha del navegador, festivos solo de España y configurables a mano.
10. **El motor es heurístico** (probado en equipos pequeños): con 3 recepcionistas + 1 noche genera 12 avisos de "días seguidos"; correcto avisando, pero no dice qué falta (contratar/relajar regla). Con equipos grandes crea rojos falsos (ver 2).
11. **Importar el cuadrante actual** (Excel/CSV): un cliente nuevo no va a teclear a su plantilla y sus meses anteriores.
12. **Cambios de turno entre compañeros, saldo de vacaciones y libres, horas extra**: el día a día real de cualquier hotel.
13. **Seguridad de cuentas**: contraseña sin requisitos visibles, sin verificación en dos pasos, sin cierre de sesión en todos los dispositivos, sin registro de accesos (código).
14. **Fallos de pulido detectados** (probado):
    - `/invitacion` sin código (o con la app en modo local) se queda en un logo vacío: debería explicar "esta invitación no es válida".
    - En móvil, el cartel de mes **borrador** estrecha el texto a una columna de 4 palabras y los botones quedan descolocados.
    - El menú inferior flotante tapa filas del cuadrante al desplazarse en capturas largas y la pantalla de Equipo es muy larga (cada persona ocupa media pantalla): falta una vista compacta.
    - Las fechas de alta/baja usan el formato del navegador (mm/dd/aaaa en inglés).
15. **Rendimiento en móvil lento** (medido): Lighthouse móvil 86 (LCP ≈4 s en 4G lenta); el cuadrante se pinta tras hidratar. Objetivo ≥ 90.
16. **Pruebas**: no hay pruebas automáticas contra un Supabase real con usuarios distintos (jefa/trabajador/anónimo) ni de dos dispositivos a la vez (el fallo de "no lo ven los demás" se escapó por eso).

### Mejoras de calidad (🟢)
17. Trocear `ScheduleApp.tsx` (sigue ~890 líneas), `README` para desarrolladores y guía de despliegue, accesibilidad con lector de pantalla real, modo "quiosco" para pantalla en recepción, exportar a PDF con la plantilla del hotel.

## R2. Plan para salir al mercado (Fase E)

Orden pensado para que cada paso se pueda usar y vender por sí solo.

### E0 · Decisiones que necesito de ti (1 conversación)
- ¿Venderás a **hoteles de tamaño parecido** (8–15 personas, recepción 24 h) o a todo tipo (hostales, aparthoteles, restauración)?
- ¿Solo **España** (convenio de hostelería) al principio?
- ¿**Modelo de precio** (por hotel/mes, por empleado) y quién da el soporte?
- ¿Casa 1800 seguirá con lectura abierta o pasa al modelo estándar (todo con login)?

### E1 · Multi-hotel y datos (🔴, la base de todo)
| # | Tarea | Aceptación |
|---|---|---|
| E1.1 | Tabla `hotels` y `hotel_id` en todas las tablas + RLS por hotel; roles por hotel | Prueba SQL: un usuario del hotel A nunca lee ni escribe en el hotel B |
| E1.2 | Registro de hotel nuevo (alta guiada: nombre, logo, color, equipo, turnos) y selector si una persona está en varios | Un hotel nuevo funciona sin tocar código |
| E1.3 | Quitar todo lo de Casa 1800 del código (equipo, nombres, logo) → datos de configuración | `grep` sin nombres propios; Casa 1800 migrada como "hotel 1" sin perder nada |
| E1.4 | Cerrar la lectura: solo personas con cuenta del hotel (opción de enlace de solo lectura revocable para la pantalla de recepción) | Anónimo no lee nada (prueba SQL) |
| E1.5 | Migraciones versionadas con **staging** y copia previa; script de comprobación del esquema al arrancar (evita el fallo de `shifts` que tuvimos) | La app avisa claramente "falta migración X" |

### E2 · Motor configurable (🔴)
| # | Tarea | Aceptación |
|---|---|---|
| E2.1 | **Cobertura por turno configurable** (nº de personas por M/T/N y por día de la semana) en Reglas | Equipos de 3 noches o 2 tardes sin avisos falsos; tests con 6 plantillas distintas |
| E2.2 | **Turnos y roles personalizables** (nombre, horas, color, quién puede hacerlos) en vez de los 10 fijos | Crear "Turno corto 10–14" y que el motor lo use |
| E2.3 | Descanso semanal (36 h), jornada contratada y tope de horas por convenio; paquetes de reglas por país | Validador con convenio de hostelería de ejemplo |
| E2.4 | Explicar la falta de personal: "con esta plantilla no se puede cubrir; faltan X horas" | Mensaje claro en equipos pequeños |
| E2.5 | Generador en *Web Worker* y límite de tiempo | La pantalla nunca se bloquea con 30 personas |

### E3 · Avisos y comunicación (🔴)
| # | Tarea | Aceptación |
|---|---|---|
| E3.1 | Correo de invitación automático (Supabase Auth + proveedor SMTP propio, dominio verificado) | Invitar a alguien envía el correo; plantilla con marca del hotel |
| E3.2 | Notificaciones dentro de la app y por correo: mes publicado, petición resuelta, cambio en tu turno | Preferencias por persona |
| E3.3 | Notificaciones push en el móvil (PWA) opcionales | Llegan con la app cerrada |
| E3.4 | Suscripción de calendario (iCal) por persona con enlace revocable | Aparece en Google/Apple Calendar |

### E4 · Operación diaria (🟡)
| # | Tarea |
|---|---|
| E4.1 | Cambios de turno entre compañeros con aprobación de la jefa |
| E4.2 | Saldo de vacaciones y libres, calendario anual de vacaciones y solicitud con aprobación |
| E4.3 | Importar equipo y cuadrantes desde Excel/CSV (con vista previa y errores por fila) |
| E4.4 | Notas por día, "quién puede cubrir el día D", informes de horas y absentismo (CSV/PDF) |
| E4.5 | Rol dirección (solo lectura + informes) |

### E5 · Legal, seguridad y confianza (🔴 antes de cobrar)
| # | Tarea |
|---|---|
| E5.1 | Política de privacidad, aviso legal, términos, cookies (la app solo usa almacenamiento técnico) y contrato de encargado de tratamiento (DPA) |
| E5.2 | Derechos RGPD: exportar mis datos, borrar a una persona dada de baja, plazo de retención configurable |
| E5.3 | Verificación en dos pasos opcional, requisitos de contraseña, "cerrar sesión en todos los dispositivos", registro de accesos |
| E5.4 | Cabecera CSP, revisión de dependencias automática, prueba de penetración básica |
| E5.5 | Copias de seguridad diarias de Supabase con prueba de restauración trimestral; plan de continuidad (qué pasa si Supabase/Vercel caen: el modo sin conexión ya aguanta lectura) |

### E6 · Negocio (🟡)
| # | Tarea |
|---|---|
| E6.1 | Web comercial / página de inicio con precios y demo con datos de ejemplo |
| E6.2 | Alta de clientes y cobro (Stripe), planes, prueba gratuita, baja y exportación al cancelar |
| E6.3 | Monitorización de errores (Sentry), estado del servicio, analítica sin datos personales |
| E6.4 | Soporte: formulario "avísanos de un problema" dentro de la app (con versión y captura opcional), base de ayuda |
| E6.5 | Multiidioma (ES/EN primero) y festivos por país/región automáticos |

### E7 · Calidad (🟢/🟡, en paralelo)
| # | Tarea |
|---|---|
| E7.1 | Pruebas de integración con Supabase real (jefa / trabajador / anónimo / dos dispositivos a la vez) en CI |
| E7.2 | Arreglar los fallos de pulido del punto 14 y subir Lighthouse móvil a ≥ 90 |
| E7.3 | Pruebas con usuarios reales (3 hoteles piloto) y medir: tiempo en hacer un mes, errores, satisfacción |
| E7.4 | Trocear `ScheduleApp.tsx`, documentación para desarrolladores y guía de despliegue |

## R3. Orden recomendado

1. **Ya (esta semana, sin decisiones):** arreglar los fallos de pulido (14), verificación de migraciones al arrancar (E1.5), pruebas de integración con Supabase (E7.1).
2. **Decidir E0**, después **E1 + E2.1/E2.2** (la app deja de ser de un solo hotel y el motor sirve a otros tamaños). Sin esto no hay producto.
3. **E3 y E5** (correo, avisos y legal): sin ellos no se puede pedir dinero ni datos de trabajadores ajenos.
4. **Piloto con 2–3 hoteles** (E7.3) usando E4 según lo que pidan.
5. **E6** (cobro y web comercial) cuando el piloto funcione sin ayuda tuya.

**Estimación orientativa:** E1+E2 ≈ 3–4 semanas de trabajo, E3+E5 ≈ 2–3, piloto 4 semanas, E6 ≈ 2. Un producto vendible a terceros, de aquí a unos 3 meses.

## R4. Decisiones tomadas y avance (12-oct-2026)

- **Público objetivo:** todo tipo de alojamiento (por eso E2: cobertura y turnos configurables). **Solo España** al principio. **De momento no se vende** (E6.2 aparcado). **Todo con cuenta**: se acabó la lectura abierta.
- ✅ **E1.4 hecho:** migración `0010_login_required.sql` (lectura solo para cuentas del hotel), pantalla «Todavía no tienes acceso», sin modo invitado, pruebas SQL (anónimo y cuenta sin permiso no ven nada).
- ✅ **E1.5 (primera parte):** el admin ve un aviso rojo si a la base de datos le falta una migración (`schema_level()`); la 0010 también da de alta todos los turnos.
- ✅ **Pulido (punto 14):** `/invitacion` sin código explica que no vale; el cartel del mes en móvil ya no se estrecha. (El formato mm/dd de las fechas era de mi navegador de pruebas en inglés, no un fallo de la app.)
- ⏭ **Siguiente:** E2.1 (cobertura por turno configurable) y E2.2 (turnos y roles personalizables), luego E1.1–E1.3 (varios hoteles), E3 (correos) y E5 (legal).
- ✅ **E2.2 hecho (turnos y puestos personalizables):** nueva página **Turnos** (`/turnos`): cada turno de siempre cambia de nombre, letra, color y horas; se pueden crear **turnos propios** (p. ej. «Desayunos 10–14», «Curso») que se eligen a mano y que el generador y «Arreglar avisos» no mueven (cuentan como trabajo o como libre); los **puestos** cambian de nombre y color, se reordenan y se pueden crear nuevos que se planifican «como» uno de los cinco de siempre. Todo se guarda al momento y se comparte entre dispositivos (migración `0011_catalog.sql`: tabla `app_catalog`, columna `staff.position` y permiso de las editoras sobre `shifts`). Pruebas: 16 de dominio (limpieza, motor con turnos propios, puestos), 4 de base de datos y 3 de pantalla (incluida accesibilidad de `/turnos`).
- ⏭ **Sigue en el plan:** E2.1 (cobertura por turno configurable) y los turnos propios *dentro* del generador (hoy solo a mano).
- ✅ **Motor ajustado al convenio (13-oct-2026).** Fuentes: Convenio de Hostelería de Sevilla 2025-2028 (BOP Sevilla núm. 102, 30-may-2025; art. 30 descanso semanal, art. 31 vacaciones), Estatuto de los Trabajadores (art. 34.3 y 37.1) y RD 1561/1995 (art. 19, hostelería). Reglas nuevas, todas editables en **Reglas**:
  - **5 días seguidos de trabajo como máximo** (antes 6). Las reglas guardadas con 6 se pasan solas a 5.
  - **11 días libres al mes como máximo** por persona (mozos y dirección aparte: su ciclo/los fines de semana mandan).
  - **Horas entre turnos:** aviso por debajo de 10 h (hostelería, compensando); el generador busca siempre 12 h (Estatuto).
  - **Descanso semanal:** 36 h seguidas cada semana (centros de hasta 25 fijos; 48 h si hay más), acumulable en 14 días.
  - Nuevo paso del motor (`improve.ts`): tras el reparto voraz, intercambia turnos entre dos personas el mismo día (o una de apoyo cubre/devuelve un turno) hasta que no queda ningún aviso personal; la cobertura de cada día no cambia nunca. Medido: 0 meses con avisos en 96 meses generados (8 semillas × 12 meses), antes 8 de cada 12 meses tenían a alguien con 12–13 libres y había turnos con 10 h 15 de descanso.
- ✅ **Importar un Excel (13-oct-2026):** Exportar → «Importar un Excel…» (o «…» en el móvil). Lee .xlsx y .csv con personas en filas y días en columnas, por **letras, palabras, horas («7-15») o colores** (el Excel del hotel va pintado; también colores de tema de Excel). Reconoce nombres escritos de otra forma («ALBERTO R.», «Jose Carlos»), enseña una vista previa con las dudas marcadas «?» para corregirlas, y carga en el mes abierto (bloqueado por defecto, se puede deshacer). Pendiente si hace falta: leer fotos o PDF con IA.
