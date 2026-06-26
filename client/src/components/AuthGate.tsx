// client/src/components/AuthGate.tsx — wrap the app; no-op unless VITE_AUTH_ENABLED=true.
import { useEffect, useState } from "react";
import { supabase, AUTH_ENABLED } from "@/lib/supabaseClient";
import Login from "@/pages/Login";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  // Hooks must run unconditionally (Rules of Hooks), so compute `enabled` first
  // and branch on it AFTER the hooks rather than early-returning before them.
  const enabled = AUTH_ENABLED && !!supabase;
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    if (!enabled || !supabase) {
      setReady(true);
      return;
    }
    const sb = supabase; // narrowed to non-null
    sb.auth.getSession().then(({ data }) => { setAuthed(!!data.session); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, [enabled]);

  // Auth dark or not configured → render the app directly; never touch supabase.
  if (!enabled) return <>{children}</>;
  if (!ready) return null;
  return authed ? <>{children}</> : <Login />;
}
