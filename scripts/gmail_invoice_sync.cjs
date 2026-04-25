/**
 * gmail_invoice_sync.cjs
 * Scans Gmail for invoice emails, parses key details,
 * and records them directly in Supabase (no Xero integration).
 *
 * Called nightly by the Railway cron.
 * Requires env vars:
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_REFRESH_TOKEN
 */

"use strict";

const https  = require("https");
const http   = require("http");

// ─── CONFIG ──────────────────────────────────────────────────────────────────
const SUPABASE_URL  = process.env.SUPABASE_URL  || "https://yoyrwrdzivygufbzckdv.supabase.co";
const ANON_KEY      = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveXJ3cmR6aXZ5Z3VmYnpja2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzgyNzIsImV4cCI6MjA5MjQ1NDI3Mn0.VP8E1-R76I4FckEx-pOaIb1YEeiV0mENBNUJnQGs13Y";

// Keywords that suggest an email is an invoice/bill
const INVOICE_KEYWORDS = [
  "invoice", "bill ", "billing", "statement", "receipt",
  "amount due", "payment due", "please pay", "payment request",
  "remittance", "proforma",
];

// Series detection keywords → series_tag
const SERIES_MAP = [
  { keywords: ["vector iii", "vector-iii", "fc-vector-iii", "reach power", "reachpower"],           tag: "VECTOR-III"  },
  { keywords: ["vector iv", "vector-iv", "fc-vector-iv", "project prometheus", "prometheus"],        tag: "VECTOR-IV"   },
  { keywords: ["vector i ", "vector-i ", "fc-vector-i ", "shield ai", "shieldai"],                  tag: "VECTOR-I"    },
  { keywords: ["founders capital platform", "fc platform", "fc-platform", "delaware series"],        tag: "PLATFORM"    },
];

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────
function httpRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u    = new URL(url);
    const lib  = u.protocol === "https:" ? https : http;
    const opts = {
      hostname: u.hostname,
      port:     u.port || (u.protocol === "https:" ? 443 : 80),
      path:     u.pathname + u.search,
      method:   options.method || "GET",
      headers:  options.headers || {},
    };
    const req = lib.request(opts, (res) => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    req.on("error", reject);
    if (body) req.write(typeof body === "string" ? body : JSON.stringify(body));
    req.end();
  });
}

// ─── SUPABASE HELPERS ────────────────────────────────────────────────────────
async function supabaseGet(table, filter = "") {
  const url = `${SUPABASE_URL}/rest/v1/${table}?${filter}`;
  const r = await httpRequest(url, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
  });
  return r.body;
}

async function supabaseUpsert(table, data) {
  const r = await httpRequest(
    `${SUPABASE_URL}/rest/v1/${table}`,
    {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
    },
    data,
  );
  return r;
}

// ─── GMAIL OAUTH ──────────────────────────────────────────────────────────────
async function getGmailToken() {
  if (!process.env.GMAIL_REFRESH_TOKEN) {
    console.log("[Gmail] No refresh token — skipping Gmail scan");
    return null;
  }
  const r = await httpRequest(
    "https://oauth2.googleapis.com/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    },
    `client_id=${process.env.GMAIL_CLIENT_ID}&client_secret=${process.env.GMAIL_CLIENT_SECRET}` +
    `&refresh_token=${process.env.GMAIL_REFRESH_TOKEN}&grant_type=refresh_token`,
  );
  return r.body.access_token;
}

async function gmailSearch(token, query) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`;
  const r = await httpRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.body.messages || [];
}

async function gmailGetMessage(token, msgId) {
  const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`;
  const r = await httpRequest(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return r.body;
}

// ─── PARSE HELPERS ────────────────────────────────────────────────────────────
function detectSeries(text) {
  const lower = (text || "").toLowerCase();
  for (const { keywords, tag } of SERIES_MAP) {
    if (keywords.some(k => lower.includes(k))) return tag;
  }
  return "PLATFORM"; // default to master entity
}

function extractAmount(subject) {
  const m = subject.match(/([\$£€])[\s]?([\d,]+(?:\.\d{2})?)/);
  if (m) return parseFloat(m[2].replace(/,/g, ""));
  return 0;
}

// Detect currency from symbol in subject line
function extractCurrency(subject) {
  if (subject.includes("£")) return "GBP";
  if (subject.includes("€")) return "EUR";
  return "USD";
}

// Fetch live FX rate from open.er-api.com (free, no key needed)
// Returns rate for 1 unit of `from` in USD. Falls back to 1.0 on error.
async function fetchFxRate(from) {
  if (from === "USD") return 1.0;
  try {
    const r = await httpRequest(`https://open.er-api.com/v6/latest/${from}`);
    if (r.body && r.body.rates && r.body.rates.USD) {
      return parseFloat(r.body.rates.USD.toFixed(6));
    }
  } catch (e) {
    console.warn(`[InvoiceSync] FX lookup failed for ${from}:`, e.message);
  }
  return 1.0;
}

function extractVendor(from) {
  const m = from.match(/^([^<]+)</);
  if (m) return m[1].trim().replace(/"/g, "");
  const em = from.match(/@([^>]+)/);
  return em ? em[1].split(".").slice(0, -1).join(".") : from;
}

function isInvoiceEmail(subject) {
  const lower = (subject || "").toLowerCase();
  return INVOICE_KEYWORDS.some(k => lower.includes(k));
}

function headerVal(msg, name) {
  const h = (msg.payload?.headers || []).find(h => h.name.toLowerCase() === name.toLowerCase());
  return h?.value || "";
}

// ─── ENTITY LOOKUP ────────────────────────────────────────────────────────────
let entityCache = null;
async function getEntityIdForSeries(tag) {
  if (!entityCache) {
    entityCache = await supabaseGet("entities", "archived_at=is.null");
  }
  const map = {
    "VECTOR-III": "FC-VECTOR-III",
    "VECTOR-IV":  "FC-VECTOR-IV",
    "VECTOR-I":   "FC-VECTOR-I",
    "PLATFORM":   "FC-PLATFORM",
  };
  const code = map[tag] || "FC-PLATFORM";
  const e = (entityCache || []).find(x => x.short_code === code);
  return e?.id || null;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[InvoiceSync] Starting Gmail invoice scan…");

  const gmailToken = await getGmailToken();

  if (!gmailToken) {
    console.log("[InvoiceSync] No Gmail token — exiting");
    return { synced: 0, skipped: 0, errors: [] };
  }

  // Search Gmail for invoice-related emails in last 7 days
  const query = `(subject:invoice OR subject:bill OR subject:"payment due" OR subject:receipt OR subject:statement) newer_than:7d`;
  const messages = await gmailSearch(gmailToken, query);
  console.log(`[InvoiceSync] Found ${messages.length} candidate emails`);

  // Get already-known gmail_message_ids to avoid duplicates
  const existing = await supabaseGet("invoices", "select=gmail_message_id&gmail_message_id=not.is.null");
  const knownIds = new Set((existing || []).map(r => r.gmail_message_id));

  let synced = 0;
  let skipped = 0;
  const errors = [];

  for (const msg of messages) {
    if (knownIds.has(msg.id)) { skipped++; continue; }

    try {
      const full    = await gmailGetMessage(gmailToken, msg.id);
      const subject = headerVal(full, "Subject");
      const from    = headerVal(full, "From");
      const date    = headerVal(full, "Date");

      if (!isInvoiceEmail(subject)) { skipped++; continue; }

      const vendor      = extractVendor(from);
      const amount      = extractAmount(subject);
      const currency    = extractCurrency(subject);
      const fxRate      = await fetchFxRate(currency);
      const seriesTag   = detectSeries(subject + " " + from);
      const entityId    = await getEntityIdForSeries(seriesTag);
      const invoiceDate = new Date(date).toISOString().slice(0, 10);

      // Upsert into Supabase — no Xero interaction
      await supabaseUpsert("invoices", {
        gmail_message_id: msg.id,
        vendor,
        description: subject,
        invoice_date: invoiceDate,
        amount: amount || 0,
        currency,
        fx_rate_to_usd: fxRate,
        // amount_usd is a GENERATED column — computed by Supabase automatically
        entity_id: entityId,
        series_tag: seriesTag,
        status: "unpaid",
        gmail_subject: subject,
        has_attachment: (full.payload?.parts || []).some(p => p.filename),
        notes: `Auto-imported from Gmail on ${new Date().toISOString().slice(0, 10)}.${currency !== "USD" ? ` FX: 1 ${currency} = ${fxRate} USD.` : ""}`,
      });

      console.log(`[InvoiceSync] ✓ ${vendor} — ${subject.slice(0, 60)}`);
      synced++;
    } catch (err) {
      console.error(`[InvoiceSync] Error processing ${msg.id}:`, err.message);
      errors.push({ id: msg.id, error: err.message });
    }
  }

  console.log(`[InvoiceSync] Done — synced: ${synced}, skipped: ${skipped}, errors: ${errors.length}`);
  return { synced, skipped, errors };
}

main().then(r => {
  process.exit(r.errors.length > 0 ? 1 : 0);
}).catch(err => {
  console.error("[InvoiceSync] FATAL:", err.message);
  process.exit(1);
});
