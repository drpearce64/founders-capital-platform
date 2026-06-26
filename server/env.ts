// server/env.ts — boot-time env validation. Imported first (after dotenv) so it
// fails LOUD with a clear message if a required env is missing, instead of later
// crashing cryptically (e.g. "supabaseKey is required" from createClient).
// No behaviour change when all required envs are present.

// Vars the web server cannot function without: it reads Supabase with the
// service-role key for every /api route.
const REQUIRED = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

const missing = REQUIRED.filter((k) => !process.env[k]);
if (missing.length > 0) {
  console.error(
    `\n[boot] FATAL: missing required environment variable(s): ${missing.join(", ")}.\n` +
      `       The server cannot start without these. Set them and restart.\n`,
  );
  process.exit(1);
}
