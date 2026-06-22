import { QueryClient } from "@tanstack/react-query";
import { supabase, AUTH_ENABLED } from "./supabaseClient";

// Default to SAME-ORIGIN (relative): /api calls go to whoever served the page,
// so the frontend follows its own deployment instead of a hardcoded host.
// Set VITE_API_URL (build-time) only if the API lives on a different origin.
const API_BASE = (import.meta as any).env?.VITE_API_URL || "";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
    },
  },
});

export async function apiRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const url = `${API_BASE}${path}`;
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (AUTH_ENABLED && supabase) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || res.statusText);
  }
  return res;
}
