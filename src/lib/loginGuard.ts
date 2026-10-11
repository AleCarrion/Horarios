/** Seconds left before another sign-in link may be requested (the server also limits them; this avoids burning that quota). */
export const LOGIN_COOLDOWN_SECONDS = 60;

export function cooldownLeft(lastAt: number | null, now: number, seconds = LOGIN_COOLDOWN_SECONDS): number {
  if (lastAt === null) return 0;
  return Math.max(0, Math.ceil(seconds - (now - lastAt) / 1000));
}

/** Supabase's English errors, in words the manager understands. */
export const MIN_PASSWORD = 8;

/** What is wrong with a password, in Spanish, or null if it is fine. */
export function passwordProblem(pw: string): string | null {
  if (pw.length < MIN_PASSWORD) return `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`;
  if (!/\d/.test(pw) || !/[a-zA-Z]/.test(pw)) return "Usa letras y al menos un número.";
  return null;
}

export function friendlyAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return "Correo o contraseña incorrectos.";
  if (/email not confirmed/i.test(message)) return "Aún no has confirmado tu correo. Mira tu bandeja (y la de spam) y pulsa el enlace.";
  if (/already registered|already been registered/i.test(message)) return "Ese correo ya tiene cuenta. Pulsa «Entrar» o «He olvidado la contraseña».";
  if (/password should be|weak password/i.test(message)) return "Esa contraseña es demasiado débil. Usa al menos 8 caracteres con letras y números.";
  if (/same password|different from the old/i.test(message)) return "La nueva contraseña tiene que ser distinta de la anterior.";
  if (/rate limit|too many|security purposes/i.test(message)) return "Has pedido demasiados enlaces seguidos. Espera unos minutos y vuelve a intentarlo.";
  if (/invalid.*email|unable to validate email/i.test(message)) return "Ese correo no parece válido.";
  if (/signups? not allowed|not allowed/i.test(message)) return "Ese correo no tiene acceso. Usa el correo de la jefa.";
  if (/network|fetch/i.test(message)) return "No hay conexión. Inténtalo cuando vuelva internet.";
  return `No se ha podido enviar el enlace (${message}).`;
}
