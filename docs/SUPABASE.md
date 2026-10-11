# Poner en marcha Supabase (guía paso a paso)

La app funciona sin Supabase (todo en el dispositivo). Con Supabase, el horario, el equipo, las solicitudes, los bloqueos, las reglas y el
estado de cada mes se comparten entre tus dispositivos (móvil y ordenador) y quedan guardados fuera del navegador.

**Modelo de acceso (acordado):** cualquiera con la dirección puede *ver* el horario, sin iniciar sesión. Solo la jefa (la persona de la tabla
`editors`) puede *modificar* algo. Eso lo garantiza la base de datos, no la pantalla (hay pruebas automáticas, ver más abajo).

## 1. Crear el proyecto (10 minutos)

1. En <https://supabase.com> crea una cuenta y un proyecto nuevo (región: la UE más cercana, p. ej. *West EU (Ireland)*). Guarda la contraseña de la base de datos en tu gestor de contraseñas.
2. **SQL editor → New query**, pega **todo** el contenido de `supabase/setup_all.sql` y pulsa *Run*. Debe terminar sin errores.
   (Es la suma de las migraciones 0001–0006 y los datos iniciales. Si cambias una migración, regenera con `npm run db:bundle`.)
3. **Authentication → URL configuration**: en *Site URL* pon la dirección de la app en Vercel y añade como *Redirect URL* esa misma dirección y `http://localhost:3000`.
4. **Authentication → Providers → Email**: deja activado el enlace mágico (*Magic link*). Desactiva «Confirm email» si te lo pide; no se usan contraseñas.
5. **Authentication → Sign In / Providers**: desactiva *Allow new users to sign up* una vez que hayas entrado tú (paso 7). Así nadie más puede crearse una cuenta. (La jefa ya existe y entra con su enlace.)
6. **Project settings → API**: copia la *Project URL* y la clave *anon public*.
7. Entra en la app con el correo de la jefa (te llega un enlace). Después, en el SQL editor, ejecuta `supabase/add_editor.sql` cambiando el correo. Debe devolver una fila.

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

Otras medidas: enlace mágico sin contraseñas, espera de 60 s entre enlaces pedidos, y mensajes de error claros si se pide demasiado.
En *Authentication → Rate limits* puedes bajar el límite de correos por hora.

## 8. Si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| «Solo lectura» al entrar la jefa | Su usuario no está en `editors` | Ejecuta `supabase/add_editor.sql` con su correo |
| No llega el enlace | Correo mal escrito o límite de envíos | Espera unos minutos; revisa *Authentication → Logs* |
| El enlace lleva a una página que no es la app | *Site URL / Redirect URL* mal puestas | Paso 1.3 |
| Cambios «pendientes de enviar» que no se envían | Sin internet o sin permiso | Se reintenta cada 30 s; si es permiso, comprueba `editors` |
| «No se ha podido subir (tabla: …)» | Falta una migración | Ejecuta las migraciones que falten (o `setup_all.sql` en un proyecto nuevo) |
