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

1. Crea un proyecto y ejecuta `supabase/migrations/0001_init.sql` y después `supabase/seed.sql` (SQL editor).
2. En *Authentication → URL configuration* añade la URL de la app (y `http://localhost:3000`) como redirect.
3. Copia `.env.example` a `.env.local` y rellena la URL y la clave *anon*.
4. Inicia sesión una vez con el correo de la jefa (enlace mágico) y ejecuta en el SQL editor:
   `insert into public.editors (user_id) select id from auth.users where email = 'correo@de.la.jefa';`
5. Abre un mes sin publicar: aparece como **borrador**; pulsa *Publicar mes* para guardarlo.
   A partir de ahí cada cambio se sincroniza solo.

En Vercel define las mismas dos variables en *Project Settings → Environment Variables*.
