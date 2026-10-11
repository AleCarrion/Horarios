export type OAuthProvider = "google" | "apple";

/** Providers whose buttons are shown: NEXT_PUBLIC_OAUTH_PROVIDERS="google,apple" (only turn on what is enabled in Supabase). */
export function enabledProviders(raw: string | undefined = process.env.NEXT_PUBLIC_OAUTH_PROVIDERS): OAuthProvider[] {
  const wanted = (raw ?? "").toLowerCase().split(/[\s,;]+/).filter(Boolean);
  return (["google", "apple"] as const).filter((p) => wanted.includes(p));
}

export const PROVIDER_LABEL: Record<OAuthProvider, string> = { google: "Google", apple: "Apple" };
