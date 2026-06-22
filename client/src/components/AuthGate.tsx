// client/src/components/AuthGate.tsx — wrap the app; no-op unless VITE_AUTH_ENABLED=true.
import { useEffect, useState } from "react";
import { supabase, AUTH_ENABLED } from "@/lib/supabaseClient";
import Login from "@/pages/Login";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  // Auth dark or not configured → render the app directly; never touch supabase.
  if (!AUTH_ENABLED || !supabase) return <>{children}</>;
  const sb = supabase; // narrowed to non-null
  const [ready, setReady] = useState(false);
  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    sb.auth.getSession().then(({ data }) => { setAuthed(!!data.session); setReady(true); });
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setAuthed(!!session));
    return () => sub.subscription.unsubscribe();
  }, []);
  if (!ready) return null;
  return authed ? <>{children}</> : <Login />;
}
