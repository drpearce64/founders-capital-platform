// client/src/lib/env.ts — boot-time client env sanity check.
// Logs a clear warning when auth is configured ON but the Supabase env it needs
// is missing. No behaviour change when envs are present (or when auth is dark).
export function checkClientEnv() {
  const env = ((import.meta as any).env || {}) as Record<string, string | undefined>;
  if (env.VITE_AUTH_ENABLED === "true") {
    const missing = ["VITE_SUPABASE_URL", "VITE_SUPABASE_ANON_KEY"].filter((k) => !env[k]);
    if (missing.length) {
      console.warn(
        `[env] VITE_AUTH_ENABLED=true but missing: ${missing.join(", ")}. ` +
          `Login will not work until these are set at build time.`,
      );
    }
  }
}
