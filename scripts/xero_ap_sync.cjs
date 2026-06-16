/**
 * xero_ap_sync.cjs
 * Pulls all ACCPAY (Accounts Payable) bills from Xero into the Supabase invoices table.
 * Run nightly alongside the Airtable sync.
 *
 * Requires env vars:
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   XERO_CLIENT_ID, XERO_CLIENT_SECRET, XERO_REFRESH_TOKEN
 *   XERO_TENANT_ID
 */

"use strict";

const https = require("https");
const http  = require("http");

const SUPABASE_URL = process.env.SUPABASE_URL  || "https://yoyrwrdzivygufbzckdv.supabase.co";
const ANON_KEY     = process.env.SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlveXJ3cmR6aXZ5Z3VmYnpja2R2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY4NzgyNzIsImV4cCI6MjA5MjQ1NDI3Mn0.VP8E1-R76I4FckEx-pOaIb1YEeiV0mENBNUJnQGs13Y";
const XERO_TENANT  = process.env.XERO_TENANT_ID || "b7a06316-557d-41ba-8002-50b541b55e2d";

// Series detection — applied to invoice description + contact name
const SERIES_MAP = [
  { keywords: ["vector iii", "vector-iii", "fc-vector-iii", "reach power"],      tag: "VECTOR-III" },
  { keywords: ["vector iv", "vector-iv",   "fc-vector-iv",  "prometheus"],        tag: "VECTOR-IV"  },
  { keywords: ["vector i ", "vector-i ",   "fc-vector-i",   "shield ai"],         tag: "VECTOR-I"   },
];

function detectSeries(text) {
  const lower = (text || "").toLowerCase();
  for (const { keywords, tag } of SERIES_MAP) {
    if (keywords.some(k => lower.includes(k))) return tag;
  }
  return "PLATFORM";
}

function parseXeroDate(xeroDateStr) {
  // Xero dates: "/Date(1694563200000+0000)/"
  if (!xeroDateStr) return null;
  const m = xeroDateStr.match(/\/Date\((\d+)/);
  if (m) return new Date(parseInt(m[1])).toISOString().slice(0, 10);
  return xeroDateStr.slice(0, 10);
}

// ─── HTTP HELPERS ─────────────────────────────────────────────────────────────
function httpRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const u   = new URL(url);
    const lib = u.protocol === "https:" ? https : http;
    const req = lib.request({
      hostname: u.hostname,
      port:     u.port || (u.protocol === "https:" ? 443 : 80),
      path:     u.pathname + u.search,
      method:   options.method || "GET",
      headers:  options.headers || {},
    }, (res) => {
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

// ─── XERO TOKEN ──────────────────────────────────────────────────────────────
async function getXeroToken() {
  if (!process.env.XERO_REFRESH_TOKEN) return null;
  const creds = Buffer.from(`${process.env.XERO_CLIENT_ID}:${process.env.XERO_CLIENT_SECRET}`).toString("base64");
  const r = await httpRequest(
    "https://identity.xero.com/connect/token",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization:  `Basic ${creds}`,
      },
    },
    `grant_type=refresh_token&refresh_token=${process.env.XERO_REFRESH_TOKEN}`,
  );
  return r.body.access_token || null;
}

// ─── XERO BILLS ──────────────────────────────────────────────────────────────
async function fetchXeroBills(token, page = 1) {
  const r = await httpRequest(
    `https://api.xero.com/api.xro/2.0/Invoices?Type=ACCPAY&page=${page}&pageSize=100`,
    {
      headers: {
        Authorization:  `Bearer ${token}`,
        "Xero-Tenant-Id": XERO_TENANT,
        Accept: "application/json",
      },
    },
  );
  return r.body?.Invoices || [];
}

// ─── SUPABASE UPSERT ─────────────────────────────────────────────────────────
async function supabaseUpsert(rows) {
  if (!rows.length) return;
  const r = await httpRequest(
    `${SUPABASE_URL}/rest/v1/invoices`,
    {
      method: "POST",
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${ANON_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
    },
    rows,
  );
  return r;
}

async function getEntityMap() {
  const r = await httpRequest(
    `${SUPABASE_URL}/rest/v1/entities?select=id,short_code&archived_at=is.null`,
    { headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } },
  );
  const map = {};
  (r.body || []).forEach(e => { map[e.short_code] = e.id; });
  return map;
}

// ─── MAIN ────────────────────────────────────────────────────────────────────
async function main() {
  console.log("[XeroAPSync] Starting Xero → Supabase AP sync…");

  const token = await getXeroToken();
  if (!token) {
    console.log("[XeroAPSync] No Xero token — exiting. Add XERO_* env vars to Railway.");
    return { synced: 0, errors: [] };
  }

  const entityMap = await getEntityMap();
  const codeMap = {
    "VECTOR-III": "FC-VECTOR-III",
    "VECTOR-IV":  "FC-VECTOR-IV",
    "VECTOR-I":   "FC-VECTOR-I",
    "PLATFORM":   "FC-PLATFORM",
  };

  let page = 1;
  let allBills = [];
  while (true) {
    const bills = await fetchXeroBills(token, page);
    if (!bills.length) break;
    allBills = allBills.concat(bills);
    if (bills.length < 100) break;
    page++;
  }

  console.log(`[XeroAPSync] Fetched ${allBills.length} bills from Xero`);

  const rows = allBills.map(b => {
    const desc   = (b.LineItems || []).map(l => l.Description || "").join("; ");
    const series = detectSeries(desc + " " + (b.Contact?.Name || ""));
    const entityId = entityMap[codeMap[series]] || entityMap["FC-PLATFORM"] || null;

    const xeroStatus = b.Status; // DRAFT, SUBMITTED, AUTHORISED, PAID, VOIDED
    let status = "unpaid";
    if (xeroStatus === "PAID")   status = "paid";
    if (xeroStatus === "VOIDED") status = "void";
    if (xeroStatus === "DRAFT")  status = "draft";

    // Mark overdue if unpaid and past due date
    const dueDate = parseXeroDate(b.DueDate);
    if (status === "unpaid" && dueDate && dueDate < new Date().toISOString().slice(0, 10)) {
      status = "overdue";
    }

    // Tracking option name (first tracking option on first line item)
    const tracking = b.LineItems?.[0]?.Tracking?.[0]?.Option || null;

    return {
      xero_invoice_id:    b.InvoiceID,
      invoice_number:     b.InvoiceNumber || null,
      vendor:             b.Contact?.Name || "Unknown",
      description:        desc || b.Reference || null,
      invoice_date:       parseXeroDate(b.Date),
      due_date:           dueDate,
      amount:             Number(b.Total) || 0,
      currency:           b.CurrencyCode || "USD",
      entity_id:          entityId,
      series_tag:         series,
      xero_tracking_name: tracking,
      status,
      paid_date:          status === "paid" ? parseXeroDate(b.FullyPaidOnDate) : null,
      payment_reference:  b.Payments?.[0]?.Reference || null,
      xero_url:           b.Url || null,
      has_attachment:     b.HasAttachments || false,
    };
  });

  // Batch upsert in chunks of 50
  const CHUNK = 50;
  let synced = 0;
  const errors = [];
  for (let i = 0; i < rows.length; i += CHUNK) {
    try {
      await supabaseUpsert(rows.slice(i, i + CHUNK));
      synced += Math.min(CHUNK, rows.length - i);
    } catch (err) {
      errors.push(err.message);
    }
  }

  console.log(`[XeroAPSync] Done — synced: ${synced}, errors: ${errors.length}`);
  return { synced, errors };
}

main().then(r => {
  process.exit(r.errors.length > 0 ? 1 : 0);
}).catch(err => {
  console.error("[XeroAPSync] FATAL:", err.message);
  process.exit(1);
});
