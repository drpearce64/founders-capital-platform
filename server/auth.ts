// server/auth.ts — authentication + role gate for /api routes.
//
// Ships behind the AUTH_ENABLED flag so it can be merged BEFORE Supabase Auth is
// live without changing behaviour. Enable (AUTH_ENABLED=true) only after:
//   1. a SUPABASE_SERVICE_ROLE_KEY exists and is set in Railway,
//   2. Supabase Auth is turned on and users are created,
//   3. public.user_roles is seeded (admin = you),
//   4. the client sends `Authorization: Bearer <access_token>` on every /api call.
import type { Request, Response, NextFunction } from "express";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL as string;
// JWT verification needs only the anon key; role lookup should use the service
// role key (to read user_roles once RLS is enabled). Falls back to anon until then.
const authClient = createClient(SUPABASE_URL, process.env.SUPABASE_ANON_KEY as string);
const roleDb = createClient(
  SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY) as string,
);

const PUBLIC_PATHS = ["/ping"]; // reachable without auth

export interface AuthedRequest extends Request { user?: any; role?: string | null; }

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  if (process.env.AUTH_ENABLED !== "true") return next();          // gate disabled → no-op
  if (PUBLIC_PATHS.includes(req.path)) return next();
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "unauthenticated" });
  const { data, error } = await authClient.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: "invalid token" });
  req.user = data.user;
  const { data: roleRow } = await roleDb
    .from("user_roles").select("role").eq("user_id", data.user.id).maybeSingle();
  req.role = roleRow?.role ?? null;
  if (!req.role) return res.status(403).json({ error: "no role assigned" });
  next();
}

// Read-only roles may GET; only admins may mutate.
export function requireAdminForMutations(req: AuthedRequest, res: Response, next: NextFunction) {
  if (process.env.AUTH_ENABLED !== "true") return next();
  const isMutation = ["POST", "PUT", "PATCH", "DELETE"].includes(req.method);
  if (isMutation && req.role !== "admin") return res.status(403).json({ error: "admin only" });
  next();
}
