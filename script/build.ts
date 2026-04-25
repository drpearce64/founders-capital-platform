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
  // Copy plain-JS scripts into dist/scripts/ so fork() can find them at runtime
  await mkdir("dist/scripts", { recursive: true });
  await copyFile("scripts/airtable_sync.js", "dist/scripts/airtable_sync.js");
  // Copy the P&L Excel model so the download route can serve it in production
  try {
    await copyFile("reports/fc_pl_model.xlsx", "dist/scripts/fc_pl_model.xlsx");
    console.log("P&L model copied to dist/scripts/");
  } catch (e) {
    console.warn("Warning: could not copy fc_pl_model.xlsx —", e);
  }
  console.log("scripts copied to dist/scripts/");
}

buildAll()
  .then(() => copyScripts())
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
