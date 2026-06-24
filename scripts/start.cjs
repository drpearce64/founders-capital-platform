#!/usr/bin/env node
"use strict";

// Single production entrypoint. Railway's railway.json forces the deploy
// startCommand to "npm start" (and locks the UI field) on every service, so the
// SAME `npm start` must be able to run EITHER the web app or the nightly sync.
// The RUN_SYNC env var selects which:
//   RUN_SYNC=1 / true  → run the Airtable→Supabase sync once and exit with its code
//   (unset / anything)  → start the web server, identical to the previous start cmd
//
// This file uses only Node built-ins so it needs no build step or dependencies.

const path = require("node:path");
const fs = require("node:fs");

// The old start command was `NODE_ENV=production node dist/index.cjs`. Preserve the
// production default so runtime NODE_ENV reads are unchanged in web mode (the bundle
// also bakes NODE_ENV=production at build time, so this is belt-and-suspenders).
if (!process.env.NODE_ENV) process.env.NODE_ENV = "production";

const runSync = /^(1|true)$/i.test(String(process.env.RUN_SYNC || "").trim());

if (runSync) {
  // ── Cron mode ──────────────────────────────────────────────────────────────
  // Prefer the esbuild-bundled sync (deps inlined, mirrors how the web path runs
  // the built dist/index.cjs); fall back to source for local/dev runs.
  const { spawnSync } = require("node:child_process");
  const bundled = path.resolve(__dirname, "../dist/scripts/airtable_sync.cjs");
  const source = path.resolve(__dirname, "airtable_sync.cjs");
  const target = fs.existsSync(bundled) ? bundled : source;

  console.log(`[start] RUN_SYNC set → running sync: ${target}`);
  const res = spawnSync(process.execPath, [target], { stdio: "inherit" });
  if (res.error) {
    console.error("[start] failed to launch sync:", res.error);
    process.exit(1);
  }
  // Exit with the child's exit code (or 1 if it was terminated by a signal).
  process.exit(res.status == null ? 1 : res.status);
} else {
  // ── Web mode ───────────────────────────────────────────────────────────────
  // Identical to the previous `node dist/index.cjs`: load the built server into
  // this process so signal handling and the listening process are unchanged.
  require(path.resolve(__dirname, "../dist/index.cjs"));
}
