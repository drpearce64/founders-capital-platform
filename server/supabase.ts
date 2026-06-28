import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://yoyrwrdzivygufbzckdv.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Guard: if the service-role key is missing the server still starts (healthcheck
// responds) but all Supabase calls will fail with a clear error rather than
// crashing the process at module load time.
if (!SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "[supabase] WARNING: SUPABASE_SERVICE_ROLE_KEY is not set. " +
    "The server will start but all database operations will fail. " +
    "Set this variable in the Railway service environment."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY || "placeholder-key-not-set", {
  global: {
    fetch: (url, options = {}) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 30000);
      return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timeout));
    },
  },
});

export default supabase;
