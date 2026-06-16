import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://yoyrwrdzivygufbzckdv.supabase.co";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveXJ3cmR6aXZ5Z3VmYnpja2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzgyNzIsImV4cCI6MjA5MjQ1NDI3Mn0.VP8E1-R76I4FckEx-pOaIb1YEeiV0mENBNUJnQGs13Y";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
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
