// client/src/lib/supabaseClient.ts — frontend Supabase Auth client.
// Anon key is correct here (client auth). Gate is dark until VITE_AUTH_ENABLED=true.
import { createClient } from "@supabase/supabase-js";

const url  = (import.meta as any).env?.VITE_SUPABASE_URL  || "https://yoyrwrdzivygufbzckdv.supabase.co";
const anon = (import.meta as any).env?.VITE_SUPABASE_ANON_KEY || "";

export const supabase = createClient(url, anon);
export const AUTH_ENABLED = (import.meta as any).env?.VITE_AUTH_ENABLED === "true";
