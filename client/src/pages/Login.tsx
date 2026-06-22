// client/src/pages/Login.tsx — minimal Supabase Auth email/password login.
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    if (!supabase) { setError("Auth is not configured."); setBusy(false); return; }
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setError(error.message);
    setBusy(false);
  }

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <form onSubmit={submit} style={{ width: 320, display: "grid", gap: 12 }}>
        <h1 style={{ fontWeight: 600 }}>Founders Capital — Sign in</h1>
        <input type="email" placeholder="Email" value={email}
               onChange={e => setEmail(e.target.value)} required
               style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        <input type="password" placeholder="Password" value={password}
               onChange={e => setPassword(e.target.value)} required
               style={{ padding: 8, border: "1px solid #ccc", borderRadius: 6 }} />
        {error && <p style={{ color: "crimson", fontSize: 13 }}>{error}</p>}
        <button type="submit" disabled={busy}
                style={{ padding: 8, borderRadius: 6, background: "#1A1209", color: "white" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
