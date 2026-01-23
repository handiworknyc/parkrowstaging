// src/scripts/sync-flex-rest.js
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import crypto from "crypto";

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import cwebp from "cwebp-bin";

const execFileP = promisify(execFile);

function hashJSON(data) {
  return crypto
    .createHash("sha1")
    .update(JSON.stringify(data))
    .digest("hex")
    .slice(0, 12);
}

/* -------------------------------------------
   Load env files only when running locally
------------------------------------------- */
if (!process.env.NETLIFY) {
  try {
    const { config } = await import("dotenv");
    const mode =
      process.env.NODE_ENV === "production" ? "production" : "development";
    config({ path: `.env.${mode}` });
    config();
  } catch {}
}

/* -------------------------------------------
   Env + helpers
------------------------------------------- */
function maskBasicAuthUrl(u) {
  try {
    const url = new URL(u);
    if (url.username || url.password) {
      url.username = "***";
      url.password = "***";
    }
    return url.toString();
  } catch {
    return u;
  }
}

const WP_BASE = (process.env.WP_BASE_URL || "").trim();
const GRAPHQL =
  (process.env.WORDPRESS_API_URL ||
    process.env.WP_GRAPHQL_URL ||
    "").trim();
const PAGE_URIS_ENV = (process.env.PAGE_URIS || "").trim();

const AUTH = process.env.WP_AUTH_BASIC
  ? "Basic " +
    Buffer.from(process.env.WP_AUTH_BASIC, "utf8").toString("base64")
  : null;

if (!WP_BASE) {
  console.error("Missing WP_BASE_URL.");
  process.exit(1);
}

function authHeaders() {
  return AUTH ? { Authorization: AUTH } : {};
}

async function fetchJSON(url, opts = {}) {
  const res = await fetch(url, {
    headers: { ...authHeaders() },
    ...opts,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `HTTP ${res.status} ${url}\n${text.slice(0, 400)}`
    );
  }

  return { json: await res.json(), res };
}

/* -------------------------------------------
   CONTACT TERMS
------------------------------------------- */
async function fetchContactTerms() {
  const url = new URL("/wp-json/astro/v1/contact-terms", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

/* -------------------------------------------
   Fetch Schema Address
------------------------------------------- */
async function fetchSchemaAddress() {
  const url = new URL("/wp-json/astro/v1/schema/address", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

/* -------------------------------------------
   Fetch Specials
------------------------------------------- */
async function fetchSpecials() {
  const url = new URL("/wp-json/astro/v1/specials", WP_BASE);
  const { json } = await fetchJSON(url);
  return json;
}

/* -------------------------------------------
   MAIN
------------------------------------------- */
async function run() {
  console.log("ENV:", {
    WP_BASE_URL: maskBasicAuthUrl(WP_BASE),
  });

  const outPages = path.join(
    process.cwd(),
    "src",
    "content",
    "wp",
    "pages"
  );

  const outSpecials = path.join(
    process.cwd(),
    "src",
    "content",
    "wp",
    "specials.json"
  );

  const outSchemaAddress = path.join(
    process.cwd(),
    "src",
    "content",
    "wp",
    "schema-address.json"
  );

  const outContactTerms = path.join(
    process.cwd(),
    "src",
    "content",
    "wp",
    "contact-terms.json"
  );

  fs.mkdirSync(path.dirname(outContactTerms), { recursive: true });

  /* --------------------------------------------------
     CONTACT TERMS SYNC
  -------------------------------------------------- */
  try {
    console.log("📄 Fetching Contact Terms…");

    const terms = await fetchContactTerms();

    const newHash = hashJSON(terms);
    let oldHash = null;

    if (fs.existsSync(outContactTerms)) {
      try {
        const old = JSON.parse(
          fs.readFileSync(outContactTerms, "utf8")
        );
        oldHash = hashJSON(old);
      } catch {}
    }

    if (newHash !== oldHash) {
      fs.writeFileSync(
        outContactTerms,
        JSON.stringify(terms, null, 2)
      );
      console.log("✨ Contact terms updated");
    } else {
      console.log("⏩ Contact terms unchanged — skip write");
    }
  } catch (e) {
    console.error(
      "❌ Failed to sync Contact Terms:",
      e.message || e
    );
  }

  /* --------------------------------------------------
     SCHEMA ADDRESS SYNC
  -------------------------------------------------- */
  try {
    console.log("🏷 Fetching Schema Address…");

    const schemaAddress = await fetchSchemaAddress();

    const newHash = hashJSON(schemaAddress);
    let oldHash = null;

    if (fs.existsSync(outSchemaAddress)) {
      try {
        const old = JSON.parse(
          fs.readFileSync(outSchemaAddress, "utf8")
        );
        oldHash = hashJSON(old);
      } catch {}
    }

    if (newHash !== oldHash) {
      fs.writeFileSync(
        outSchemaAddress,
        JSON.stringify(schemaAddress, null, 2)
      );
      console.log("✨ Schema address updated");
    } else {
      console.log("⏩ Schema address unchanged — skip write");
    }
  } catch (e) {
    console.error(
      "❌ Failed to sync Schema Address:",
      e.message || e
    );
  }

  /* --------------------------------------------------
     SPECIALS SYNC
  -------------------------------------------------- */
  try {
    console.log("🔄 Fetching Specials…");

    const specials = await fetchSpecials();

    const newHash = hashJSON(specials);
    let oldHash = null;

    if (fs.existsSync(outSpecials)) {
      try {
        const old = JSON.parse(
          fs.readFileSync(outSpecials, "utf8")
        );
        oldHash = hashJSON(old);
      } catch {}
    }

    if (newHash !== oldHash) {
      fs.writeFileSync(
        outSpecials,
        JSON.stringify(specials, null, 2)
      );
      console.log("✨ Specials updated");
    } else {
      console.log("⏩ Specials unchanged — skip write");
    }
  } catch (e) {
    console.error(
      "❌ Failed to sync Specials:",
      e.message || e
    );
  }

  console.log("---------------------------------------------------");
  console.log("✅ Sync complete");
  console.log("---------------------------------------------------");
}

run().catch((e) => {
  console.error("🔥 Sync script crashed:", e);
  process.exit(1);
});
