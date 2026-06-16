import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile, mkdir, copyFile } from "node:fs/promises";

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times
const allowlist = [
  "@google/generative-ai",
  "axios",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter((dep) => !allowlist.includes(dep));

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

async function copyScripts() {
  await mkdir("dist/scripts", { recursive: true });

  // Bundle airtable_sync.js with esbuild so @supabase/supabase-js is inlined.
  // Output as .cjs so Node doesn't treat it as ESM (package.json has "type":"module").
  await esbuild({
    entryPoints: ["scripts/airtable_sync.js"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/scripts/airtable_sync.cjs",
    logLevel: "silent",
  });

  // Bundle gmail_invoice_sync.cjs — output stays .cjs
  await esbuild({
    entryPoints: ["scripts/gmail_invoice_sync.cjs"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/scripts/gmail_invoice_sync.cjs",
    logLevel: "silent",
  });

  // Copy the live P&L generator (no external deps — plain copy is fine)
  await copyFile("scripts/generate_pl_model.cjs", "dist/scripts/generate_pl_model.cjs");

  console.log("scripts bundled to dist/scripts/");
}

buildAll()
  .then(() => copyScripts())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
