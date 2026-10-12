# Poner en marcha Supabase (guía paso a paso)

La app funciona sin Supabase (todo en el dispositivo). Con Supabase, el horario, el equipo, las solicitudes, los bloqueos, las reglas y el
estado de cada mes se comparten entre tus dispositivos (móvil y ordenador) y quedan guardados fuera del navegador.

**Modelo de acceso (acordado):** cualquiera con la dirección puede *ver* el horario, sin iniciar sesión. Solo la jefa (la persona de la tabla
`editors`) puede *modificar* algo. Eso lo garantiza la base de datos, no la pantalla (hay pruebas automáticas, ver más abajo).

## 1. Crear el proyecto (10 minutos)

1. En <https://supabase.com> crea una cuenta y un proyecto nuevo (región: la UE más cercana, p. ej. *West EU (Ireland)*). Guarda la contraseña de la base de datos en tu gestor de contraseñas.
2. **SQL editor → New query**, pega **todo** el contenido de `supabase/setup_all.sql` y pulsa *Run*. Debe terminar sin errores.
   (Es la suma de las migraciones 0001–0011 y los datos iniciales. Si cambias una migración, regenera con `npm run db:bundle`.)
3. **Authentication → URL configuration**: en *Site URL* pon la dirección de la app en Vercel y añade como *Redirect URL* esa misma dirección y `http://localhost:3000`.
4. **Authentication → Sign In / Providers → Email**: déjalo activado (acceso con correo y contraseña). Para que crear cuenta sea inmediato, desactiva **Confirm email** (así no hace falta confirmar por correo; las personas invitadas ya las controlas tú desde *Accesos*). Si lo dejas activado, al crear la cuenta llega un correo con un enlace de confirmación. La opción de «entrar con enlace» y «he olvidado la contraseña» funcionan en ambos casos.
5. **No desactives** *Allow new users to sign up*: las personas que invites necesitan poder entrar por primera vez. Quien entre sin estar invitado puede ver el horario (como cualquiera), pero no editar nada.
6. **Project settings → API**: copia la *Project URL* y la clave *anon public*.
7. **Entra tú primero** en la app con tu correo (te llega un enlace). La primera persona que entra tras montar la base de datos se queda como **administradora**, así que hazlo enseguida, antes de dar la dirección a nadie.
8. Desde la app, pulsa **Accesos** (junto a tu correo, arriba) y escribe el correo de la jefa y de quien deba editar. Cuando entren con ese correo, podrán editar. No hace falta tocar SQL nunca más.

(Proyectos creados antes de la migración 0007: ejecuta `supabase/migrations/0007_admin_access.sql` en el SQL editor. Si ya tenías a alguien en `editors`, esa persona sigue pudiendo editar; para administrar accesos, la primera en entrar tras la migración sin ser editora no obtiene nada, así que en ese caso usa `supabase/add_editor.sql` con `role = 'admin'`.)

**Pantallas de acceso:** con Supabase conectado, la app abre en una pantalla de **Entrar** (correo y contraseña). Quien solo quiera mirar puede pulsar «Solo quiero ver el horario». Arriba a la derecha hay un círculo con tu inicial: lleva a **Mi cuenta** (quién eres, permisos, estado de sincronización, cambiar contraseña, cerrar sesión y, si eres administradora, **Gestionar accesos**). En el móvil está en el menú «⋯». Sin Supabase (modo local) no hay pantalla de entrada.

## Invitaciones por enlace (lo más cómodo)

En **Accesos → Crear invitación** eliges el permiso (editora, o trabajador + a qué persona del equipo corresponde) y, si quieres, el correo. La app te da un **enlace** (con botón *Copiar enlace* y *Compartir*, por ejemplo por WhatsApp). Quien lo abre ve «Te han invitado como trabajador (Alberto R.)», crea su propia cuenta con su correo y una contraseña y **ya tiene el acceso**. El enlace sirve **una sola vez**, caduca a los **14 días** y nunca da permiso de administradora (esa se da con el correo). Si el enlace no se ha usado, puedes volver a copiarlo desde la lista o cancelarlo con la papelera. Requiere la migración `0009_invite_links.sql`.

## Trabajadores (solo ver y enviar peticiones)

Desde **Accesos** puedes invitar a un correo con el permiso **Solo ver y enviar peticiones (trabajador)** y elegir **qué persona del equipo es**. Cuando entre con ese correo:

- ve el horario completo (con su fila marcada como «tú») pero no puede cambiar nada;
- tiene un botón **Mis peticiones** para pedir un libre, vacaciones, un turno concreto (mañanas, tardes…) o un cambio de turno con un compañero, ver si están pendientes, aprobadas o rechazadas (con la nota de la jefa) y cancelar las pendientes;
- no ve las peticiones de nadie más, ni las pantallas de Equipo, Reglas y Accesos.

La jefa las recibe en su bandeja de **Solicitudes** y las aprueba o rechaza como siempre. La base de datos lo garantiza (hay pruebas automáticas): un trabajador solo puede crear peticiones suyas y pendientes, no puede aprobarse nada ni tocar el horario.
Hasta que la jefa **publique el mes**, los trabajadores ven «Este mes todavía no está publicado».
Si ya tenías el proyecto montado, ejecuta `supabase/migrations/0008_workers.sql` en el SQL editor.

## Entrar con Google (aparcado)

Se probó y se quitó para simplificar: ahora se entra con correo y contraseña (o enlace por correo). Si algún día se retoma, recuerda que el **ID y el Secreto de cliente de Google van solo en Supabase** (Authentication → Providers → Google), nunca en Vercel ni en variables `NEXT_PUBLIC_*`, porque esas son públicas.

## 2. Conectar la app

- En local: copia `.env.example` a `.env.local` y rellena `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- En Vercel: *Project → Settings → Environment Variables*, las mismas dos variables (en *Production* y *Preview*), y vuelve a desplegar.
- Si Vercel no te deja crear una variable cuyo nombre contiene «KEY», usa `NEXT_PUBLIC_SUPABASE_ANON` (sin «_KEY»): la app acepta las dos. Si el aviso es por «Sensitive», desmarca esa casilla: esta clave es pública.
- La clave *anon* es pública por diseño; **nunca** pongas la clave `service_role` en la app ni en Vercel.

## 3. Primera conexión: qué pasa con lo que ya tienes en el dispositivo

La primera vez que la jefa entra en un dispositivo que ya tenía datos, la app pregunta:

- **Subir al servidor**: sube plantilla, meses, solicitudes, bloqueos, estado de los meses y reglas. Si algo falla, no borra nada del dispositivo y puedes reintentar.
- **Descartar y usar el servidor**: borra lo local (pide confirmación; guarda antes una copia de seguridad desde *Exportar*).
- **Más tarde**: no hace nada; vuelve a preguntar la próxima vez.

Haz esto primero en el dispositivo donde tienes el horario bueno; en los demás, elige «Descartar y usar el servidor».

## 4. Trabajar desde dos dispositivos a la vez

- Cada casilla se guarda con la hora a la que se editó. Si otro dispositivo cambió esa misma casilla **después**, gana lo más reciente y la app te avisa
  («Se han mantenido N cambios más recientes hechos desde otro dispositivo»). Nada se pisa en silencio.
- Los cambios de otros dispositivos aparecen al momento (tiempo real). Sin conexión puedes seguir editando: los cambios esperan en el dispositivo y se envían al volver internet.

## 5. Copias de seguridad

- **Siempre disponible:** *Exportar → Guardar copia de seguridad* (JSON con todo lo de este dispositivo). Guárdala de vez en cuando; restaurarla se hace desde el mismo menú.
- **En Supabase:** el plan gratuito no incluye copias descargables automáticas. Opciones: (a) plan *Pro* (copias diarias, 7 días); o (b) una vez al mes exportar a CSV las tablas `monthly_schedule`, `staff` y `requests` desde *Table editor*; o (c) `pg_dump` con la cadena de conexión de *Project settings → Database*.
- Pase lo que pase, la copia JSON de la app es siempre tu red de seguridad.

## 6. Entorno de pruebas (staging)

Para probar cambios sin tocar los datos reales: crea un **segundo proyecto** de Supabase (mismo `setup_all.sql`) y úsalo en *Preview* de Vercel con sus propias variables de entorno. Producción usa el proyecto real. Así una rama de pruebas nunca escribe en el horario de verdad.

## 7. Seguridad: qué está comprobado

`npm test` ejecuta **pruebas contra una base de datos PostgreSQL real** (PGlite) con las migraciones, el seed y las políticas:

- sin sesión se puede leer pero no escribir (ni horario, ni plantilla, ni solicitudes, ni bloqueos);
- una persona con sesión que no sea editora tampoco puede escribir; el registro de auditoría solo lo lee la editora;
- toda tabla pública tiene seguridad por filas activada;
- guardar casillas no pisa cambios más recientes de otro dispositivo;
- el proyecto nuevo se configura de una vez con `setup_all.sql`.

Otras medidas: contraseña de al menos 8 caracteres con letras y números, espera de 60 s entre correos pedidos, y mensajes de error claros si se pide demasiado.
En *Authentication → Rate limits* puedes bajar el límite de correos por hora.

## 8. Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| «Solo lectura» al entrar la jefa | Su correo no está invitado | Que la administradora lo añada en **Accesos** |
| «Correo o contraseña incorrectos» | Escrita mal, o aún no has creado la cuenta | Pulsa «Crear cuenta» la primera vez, o «He olvidado la contraseña» |
| No llega el enlace | Correo mal escrito o límite de envíos | Espera unos minutos; revisa *Authentication → Logs* |
| El enlace lleva a una página que no es la app | *Site URL / Redirect URL* mal puestas | Paso 1.3 |
| Cambios «pendientes de enviar» que no se envían | Sin internet o sin permiso | Se reintenta cada 30 s; si es permiso, comprueba `editors` |
| «No se ha podido subir (tabla: …)» | Falta una migración | Ejecuta las migraciones que falten (o `setup_all.sql` en un proyecto nuevo) |

> Nota de despliegue: las variables `NEXT_PUBLIC_*` se leen al construir; tras cambiarlas en Vercel hay que desplegar de nuevo.

## Todo con cuenta (migración 0010)

Desde la migración `0010_login_required.sql` **nadie ve nada sin iniciar sesión** con un correo que el admin haya dado de alta (administradora, editora o trabajador). Quien entra con una cuenta sin permiso ve «Todavía no tienes acceso». Ya no existe «Solo quiero ver el horario».

Orden para actualizar un proyecto que ya funciona: 1) espera a que Vercel termine de desplegar esta versión; 2) ejecuta `supabase/migrations/0010_login_required.sql` en el editor SQL. Si el admin ve un aviso rojo «a la base de datos le falta una actualización», es que falta ese paso.

## Turnos y puestos del hotel (migración 0011)

La página **Turnos** guarda en la tabla `app_catalog` (una fila) los nombres, letras, colores y horas de los turnos y los puestos del hotel; los turnos propios se dan de alta además en `shifts` (el cuadrante los referencia) y cada persona puede tener un `position` propio en `staff`. Ejecuta `supabase/migrations/0011_catalog.sql` (o regenera `setup_all.sql` con `npm run db:bundle` en un proyecto nuevo). Si falta, el admin ve el aviso rojo de «falta una actualización».
