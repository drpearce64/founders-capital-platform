// client/src/lib/supabaseClient.ts — frontend Supabase Auth client.
// Anon key is correct here (client auth). Gate is dark until VITE_AUTH_ENABLED=true.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url  = (import.meta as any).env?.VITE_SUPABASE_URL;
const anon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY;

// Construct the client ONLY when both are configured. Otherwise null — so
// importing this module can't throw "supabaseKey is required" and crash the app
// while auth is dark (VITE_AUTH_ENABLED unset). Consumers must guard on supabase.
export const supabase: SupabaseClient | null =
  url && anon ? createClient(url, anon) : null;
export const AUTH_ENABLED = (import.meta as any).env?.VITE_AUTH_ENABLED === "true";
