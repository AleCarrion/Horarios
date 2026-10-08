# Horarios · Hotel Casa 1800

Planificador automático de turnos (Next.js + PWA offline + Supabase opcional).

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # generador, validación, exportación, sincronización
```

## Modos

- **Local** (sin variables de entorno): todo funciona en el dispositivo, guardado en `localStorage`.
- **Supabase** (con `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`): horario compartido
  en tiempo real; solo las personas de la tabla `editors` pueden modificarlo, el resto lo ve en
  solo lectura. Las ediciones sin conexión se guardan en cola y se envían al volver la red.

## Configurar Supabase

1. Crea un proyecto y ejecuta, por este orden, `supabase/migrations/0001_init.sql`, `supabase/migrations/0002_staff_order.sql`, `supabase/migrations/0003_requests_locks.sql`, `supabase/migrations/0004_request_shift.sql`, `supabase/migrations/0005_absence_shift.sql` y `supabase/seed.sql` (SQL editor).
2. En *Authentication → URL configuration* añade la URL de la app (y `http://localhost:3000`) como redirect.
3. Copia `.env.example` a `.env.local` y rellena la URL y la clave *anon*.
4. Inicia sesión una vez con el correo de la jefa (enlace mágico) y ejecuta en el SQL editor:
   `insert into public.editors (user_id) select id from auth.users where email = 'correo@de.la.jefa';`
5. Abre un mes sin publicar: aparece como **borrador**; pulsa *Publicar mes* para guardarlo.
   A partir de ahí cada cambio se sincroniza solo.

En Vercel define las mismas dos variables en *Project Settings → Environment Variables*.

## Equipo (página `/equipo`)

La plantilla se gestiona en su propia página: tarjetas por puesto (Dirección, Apoyo / Partido, Recepción,
Noche, Mozos) con arrastrar y soltar para reordenar o cambiar de puesto, nombre editable, fechas de alta y
baja, "Dar de baja", volver a la plantilla y "Añadir persona". Cualquier cambio que altere quién trabaja
se planifica sobre el mes actual y los meses guardados posteriores, y enseña los cambios por mes antes de
aplicarlos. En la cuadrícula del horario también se puede arrastrar a una persona a otra sección.
Sin Supabase se guarda en el dispositivo; con Supabase, en la tabla `staff` (`sort_order`, `role`, fechas…),
compartido en tiempo real. La primera editora que entra publica el equipo local si la tabla está vacía.

## Reajustes con mínimo cambio

Al pedir **Libre** o **Vacaciones** para alguien (menú de la casilla, con "reajustar el resto del horario"),
o al cambiar el equipo (puesto, alta, baja, añadir), la app planifica el mes alrededor del cambio y enseña
una vista previa antes de aplicarlo. Un libre solicitado es, siempre que se puede, un *intercambio*: la
persona libra el día pedido y trabaja uno de sus descansos (4 casillas, mismo total de descansos). Si no basta,
se recalcula una ventana creciente alrededor del día. Los días pasados y los próximos 2 días no se tocan solos.
Lógica en `src/lib/domain/repair.ts` (con tests).

## Solicitudes

El botón de la bandeja (arriba a la derecha) abre las solicitudes: *libre*, *vacaciones* y *cambio de turno*
de cualquier persona. Cada una se planifica con el motor sobre su mes y sale con semáforo (verde, ámbar,
rojo con motivo), antelación (recomendado: un mes, solo informativo) y coincidencias con otras peticiones.
"Revisar y aprobar" abre la vista previa de cambios; al aplicar, la solicitud queda aprobada y lo pedido
bloqueado. Rechazar pide un motivo. Se guardan en el dispositivo y, con Supabase, en las tablas `requests` y `locked_cells` (solo editoras; el acceso de los trabajadores queda para el final).
