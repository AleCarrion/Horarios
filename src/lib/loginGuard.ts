/** Seconds left before another sign-in link may be requested (the server also limits them; this avoids burning that quota). */
export const LOGIN_COOLDOWN_SECONDS = 60;

export function cooldownLeft(lastAt: number | null, now: number, seconds = LOGIN_COOLDOWN_SECONDS): number {
  if (lastAt === null) return 0;
  return Math.max(0, Math.ceil(seconds - (now - lastAt) / 1000));
}

/** Supabase's English errors, in words the manager understands. */
export function friendlyAuthError(message: string): string {
  if (/rate limit|too many|security purposes/i.test(message)) return "Has pedido demasiados enlaces seguidos. Espera unos minutos y vuelve a intentarlo.";
  if (/invalid.*email|unable to validate email/i.test(message)) return "Ese correo no parece válido.";
  if (/signups? not allowed|not allowed/i.test(message)) return "Ese correo no tiene acceso. Usa el correo de la jefa.";
  if (/network|fetch/i.test(message)) return "No hay conexión. Inténtalo cuando vuelva internet.";
  return `No se ha podido enviar el enlace (${message}).`;
}
