// scripts/generateTrendWithGemini.js
// Node 18+ (ESM). Generates a 6-point net-worth trend using Gemini and writes it into
// Firebase Realtime Database under users/{uid}/assets/_generated_trend and
// users/{uid}/liabilities/_generated_trend_zero.
//
// Usage (recommended):
// 1) Add GEMINI_API_KEY to frontend/.env.local (see instructions below).
// 2) Ensure backend service account JSON exists (default path below).
// 3) Install deps: npm install firebase-admin dotenv
//    If your Node < 18 or doesn't have fetch, also: npm install node-fetch
// 4) Ensure package.json has "type": "module" OR rename file to .mjs
// 5) Run: node scripts/generateTrendWithGemini.js <USER_UID>
//    or set TARGET_UID in env and run: node scripts/generateTrendWithGemini.js
//
// NOTE: Keep GEMINI_API_KEY *server-side only* — do not commit it to source control.

import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import admin from "firebase-admin";

// Load env in two places (project root and frontend/.env.local) so the script behaves like your setup.
// Order: root .env (if any), then frontend/.env.local (overrides).
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const frontendEnvPath = path.resolve(process.cwd(), "frontend", ".env.local");
if (fs.existsSync(frontendEnvPath)) {
  dotenv.config({ path: frontendEnvPath });
}

// read envs — support both plain and VITE_ prefixes just in case
const GEMINI_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || process.env.REACT_APP_GEMINI_API_KEY;
const SERVICE_ACCOUNT_PATH =
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH ||
  path.resolve(process.cwd(), "backend", "src", "main", "resources", "firebase-service-account.json");
const FIREBASE_DB_URL =
  process.env.FIREBASE_DATABASE_URL || process.env.VITE_FIREBASE_DATABASE_URL || process.env.REACT_APP_FIREBASE_DATABASE_URL;
const UID = process.argv[2] || process.env.TARGET_UID;

async function ensureFetch() {
  if (typeof fetch === "undefined") {
    // dynamic import for node-fetch if running on older Node where fetch is absent
    try {
      const mod = await import("node-fetch");
      globalThis.fetch = mod.default || mod;
    } catch (e) {
      console.error("fetch is not available and node-fetch failed to load. Use Node 18+ or install node-fetch.");
      throw e;
    }
  }
}

if (!GEMINI_KEY) {
  console.error(
    "Missing GEMINI_API_KEY. Add GEMINI_API_KEY to frontend/.env.local (or root .env). Example:\n\n" +
      "frontend/.env.local\nGEMINI_API_KEY=ya29.xxxxxxxxxxxxxxxxxxxxxx\n"
  );
  process.exit(1);
}

if (!UID) {
  console.error("Usage: node scripts/generateTrendWithGemini.js <USER_UID>  (or set TARGET_UID in env)");
  process.exit(1);
}

if (!FIREBASE_DB_URL) {
  console.error(
    "Missing FIREBASE_DATABASE_URL in env. You can add FIREBASE_DATABASE_URL to frontend/.env.local or root .env.\n" +
      "Example: FIREBASE_DATABASE_URL=https://<your-project>.firebaseio.com"
  );
  process.exit(1);
}

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error("Service account JSON not found at:", SERVICE_ACCOUNT_PATH);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, "utf8"));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: FIREBASE_DB_URL,
});

const db = admin.database();

async function readUserAssetsLiabilities(uid) {
  const assetsSnap = await db.ref(`users/${uid}/assets`).once("value");
  const liabilitiesSnap = await db.ref(`users/${uid}/liabilities`).once("value");
  const assets = assetsSnap.val() || {};
  const liabilities = liabilitiesSnap.val() || {};
  return { assets, liabilities };
}

function sumValues(obj) {
  return Object.values(obj).reduce((s, item) => s + (Number((item && item.value) || 0)), 0);
}

function buildPrompt(currentNetWorth) {
  return `You are an assistant that returns only a strict JSON array of 6 integer numbers.
Generate six realistic net-worth numbers (INR) for the last 6 periods (most recent last). The user's current net worth is ${Math.round(currentNetWorth)}.
- Each number must be an integer.
- Keep values roughly within ±10% of current net worth.
- Introduce small ups and downs (no perfectly straight lines).
- Return ONLY a valid JSON array (example: [123456,123000,124500,122900,125300,124800]) and nothing else.`;
}

async function callGemini(prompt) {
  await ensureFetch();

  const url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent";
  const body = {
    contents: [
      {
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": GEMINI_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Gemini API error ${res.status}: ${txt}`);
  }

  const data = await res.json();

  // The response shape may vary. Try to extract the text content robustly.
  const textCandidates = [];
  try {
    // Common nested locations:
    const candidates = data?.candidates || data?.output?.candidates;
    if (Array.isArray(candidates) && candidates.length) {
      for (const c of candidates) {
        // candidate.content may be an array or object
        if (Array.isArray(c.content)) {
          for (const part of c.content) {
            if (Array.isArray(part.parts)) {
              for (const p of part.parts) {
                if (typeof p.text === "string") textCandidates.push(p.text);
              }
            } else if (typeof part.text === "string") {
              textCandidates.push(part.text);
            }
          }
        } else if (c.content && c.content.parts) {
          for (const p of c.content.parts) {
            if (typeof p.text === "string") textCandidates.push(p.text);
          }
        }
      }
    }
  } catch (e) {
    // fallthrough
  }

  // fallback: flatten entire JSON
  if (!textCandidates.length) {
    textCandidates.push(JSON.stringify(data));
  }

  // Attempt parse each candidate until successful
  for (const text of textCandidates) {
    // 1) direct JSON parse
    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed;
    } catch (e) {
      // ignore
    }

    // 2) extract first [ ... ] and parse
    const m = text.match(/\[[\s\d,.\-]+\]/m);
    if (m) {
      try {
        const parsed = JSON.parse(m[0]);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {
        // ignore
      }
    }

    // 3) try to extract numbers with regex as fallback (last resort)
    const nums = text.match(/-?\d{2,}/g); // integers with at least 2 digits (avoids accidental single-digit noise)
    if (nums && nums.length >= 6) {
      // take last 6 numbers (most recent last)
      const last6 = nums.slice(-6).map((n) => Number(n));
      return last6;
    }
  }

  throw new Error("Could not parse Gemini response into an integer array. Raw candidates: " + JSON.stringify(textCandidates));
}

async function saveGeneratedHistory(uid, trendArray) {
  const ts = Date.now();
  const assetPath = `users/${uid}/assets/_generated_trend`;
  const liabilityPath = `users/${uid}/liabilities/_generated_trend_zero`;

  const assetPayload = {
    id: "_generated_trend",
    name: "_generated trend (gemini)",
    value: trendArray[trendArray.length - 1] || 0,
    history: trendArray,
    createdAt: ts,
    updatedAt: ts,
  };

  const liabilityPayload = {
    id: "_generated_trend_zero",
    name: "_generated trend (zero)",
    value: 0,
    history: Array(trendArray.length).fill(0),
    createdAt: ts,
    updatedAt: ts,
  };

  // set the nodes
  await db.ref(assetPath).set(assetPayload);
  await db.ref(liabilityPath).set(liabilityPayload);
}

(async function main() {
  try {
    console.log("Reading user assets/liabilities for UID:", UID);
    const { assets, liabilities } = await readUserAssetsLiabilities(UID);
    const totalA = sumValues(assets);
    const totalL = sumValues(liabilities);
    const netWorth = totalA - totalL;
    console.log("Totals — assets:", totalA, "liabilities:", totalL, "netWorth:", netWorth);

    const prompt = buildPrompt(netWorth || 0);
    console.log("Calling Gemini to generate trend...");
    const trend = await callGemini(prompt);

    if (!Array.isArray(trend) || trend.length === 0) {
      throw new Error("Gemini returned invalid trend: " + JSON.stringify(trend));
    }

    // normalize into integers
    const trendInts = trend.map((n) => Math.round(Number(n) || 0));

    console.log("Generated trend (ints):", trendInts);
    await saveGeneratedHistory(UID, trendInts);
    console.log("Saved generated history to Firebase for UID:", UID);
    process.exit(0);
  } catch (err) {
    console.error("Error:", err);
    process.exit(1);
  }
})();
