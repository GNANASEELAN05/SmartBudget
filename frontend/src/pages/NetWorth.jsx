import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, onValue, off, set, remove } from "firebase/database";
import {
  Wallet,
  BarChart2,
  PieChart,
  Home,
  Truck,
  CreditCard,
  Shield,
  PlusCircle,
  Trash2,
  Clock,
  Scale
} from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // added to follow export pattern

/*
  NetWorth.jsx
  - Premium-looking Net Worth / Assets vs Liabilities page
  - Reads from Firebase paths: users/{uid}/assets and users/{uid}/liabilities
  - Graceful fallback when Firebase isn't initialized (shows mock/demo data)
  - Inline add form (appears next to the + button) with Save / Cancel
  - Lucide icons only (emoji removed)
  - NOTE: header icon switched to Scale and muted text color darkened — nothing else changed
*/

const COLORS = {
  pageBg: "linear-gradient(135deg,#f8fafc,#eef2ff)",
  heading: "#0f172a",
  // DARKENED muted color for better readability (kept other dark colors unchanged)
  muted: "#374151",
  primary: "#4f46e5",
  success: "#16a34a",
  danger: "#dc2626",
  cardBorder: "rgba(15,23,42,0.05)",

  // Darkened card colors (adjusted slightly darker from the previous values)
  mainCardBg: "#a8c1ff",         // darker soft blue
  mainCardText: "#04234f",

  allocationBg: "#9edfcf",       // darker green-teal
  allocationText: "#073e34",

  topHoldingsBg: "#ffd39b",      // darker amber
  topHoldingsText: "#58310a",

  assetsCardBg: "#c7b3ff",       // darker lavender
  assetsCardText: "#2f0054",

  liabilitiesCardBg: "#ffb6d1",  // darker rose
  liabilitiesCardText: "#5a0f2a",

  // stat boxes slightly darker
  stat1Bg: "#cfe0ff", stat1Text: "#0f2e6b", // Total assets stat
  stat2Bg: "#ffe2c6", stat2Text: "#6f3a07", // Total liabilities stat
  stat3Bg: "#cdefdc", stat3Text: "#0e4d36"  // Net worth stat
};

function moneyINR(n) {
  if (n == null) return "₹0";
  const num = Number(n) || 0;
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(num).replace(/^/, "₹");
}

function sparklinePoints(data, width = 300, height = 40) {
  if (!data || !data.length) return "";
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  return data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
}

function renderIcon(IconComp, size = 18, color = "#fff") {
  try {
    if (IconComp) return React.createElement(IconComp, { size, style: { color, verticalAlign: "middle" } });
  } catch (e) {
    // fallthrough
  }
  return <span style={{ width: size, height: size, display: "inline-block" }} />;
}

function getItemMeta(name = "") {
  const k = String(name).toLowerCase();
  if (k.includes("home") || k.includes("property") || k.includes("real")) return { Icon: Home, color: "#0ea5a4" };
  if (k.includes("car") || k.includes("vehicle") || k.includes("auto")) return { Icon: Truck, color: "#0ea5e9" };
  if (k.includes("card") || k.includes("credit") || k.includes("bank")) return { Icon: CreditCard, color: "#4338ca" };
  if (k.includes("insurance") || k.includes("policy")) return { Icon: Shield, color: "#065f46" };
  return { Icon: Wallet, color: "#374151" };
}

export default function NetWorth({ printMode = false, forcedMonth = null, forcedYear = null }) {
  // follow the same pattern as Analytics: honor forcedPeriod via hook (even if this page doesn't use month selectors)
  const [hookMonth, , hookYear] = useForcedPeriod(forcedMonth, forcedYear);

  const auth = (() => { try { return getAuth(); } catch (e) { return null; } })();
  const db = (() => { try { return getDatabase(); } catch (e) { return null; } })();

  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState({ name: "You" });
  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  // adding form state: the parent only tracks which form is open; actual typing uses local state in AddForm
  const [adding, setAdding] = useState({ kind: null, name: "", value: "", anchor: null });

  /* ========== MODAL STATE (from your reference) ========== */
  const [modal, setModal] = useState({
    open: false,
    title: "",
    message: "",
    showCancel: true,
    confirmText: "OK",
    cancelText: "Cancel",
    onConfirm: null,
  });

  const openModal = ({ title = "", message = "", showCancel = true, confirmText = "OK", cancelText = "Cancel", onConfirm = null }) => {
    setModal({ open: true, title, message, showCancel, confirmText, cancelText, onConfirm });
  };

  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  /* ====================================================== */

  useEffect(() => {
    if (!auth) {
      // fallback to demo data
      setDemoMode(true);
      setAssets([
        { id: "a1", name: "Home (market)", value: 8200000, updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 5 },
        { id: "a2", name: "Savings account", value: 185000, updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 2 },
        { id: "a3", name: "Investments", value: 420000, updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 10 }
      ]);
      setLiabilities([
        { id: "l1", name: "Home loan", value: 3500000, updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 3 },
        { id: "l2", name: "Car loan", value: 450000, updatedAt: Date.now() - 1000 * 60 * 60 * 24 * 40 }
      ]);
      setLoading(false);
      return;
    }

    // keep references outside so we can off() later
    let assetsRefLocal = null;
    let liabilitiesRefLocal = null;
    let aHandler = null;
    let lHandler = null;

    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);

      // clear previous listeners if any
      try {
        if (assetsRefLocal && aHandler) off(assetsRefLocal, "value", aHandler);
      } catch (e) {}
      try {
        if (liabilitiesRefLocal && lHandler) off(liabilitiesRefLocal, "value", lHandler);
      } catch (e) {}

      if (u && db) {
        assetsRefLocal = ref(db, `users/${u.uid}/assets`);
        liabilitiesRefLocal = ref(db, `users/${u.uid}/liabilities`);

        aHandler = (snap) => {
          const data = snap.val() || {};
          const arr = Object.entries(data).map(([id, val]) => ({ id, ...val }));
          setAssets(arr.map(a => ({ ...a, value: Number(a.value || 0) })));
          setLoading(false);
        };
        lHandler = (snap) => {
          const data = snap.val() || {};
          const arr = Object.entries(data).map(([id, val]) => ({ id, ...val }));
          setLiabilities(arr.map(l => ({ ...l, value: Number(l.value || 0) })));
          setLoading(false);
        };

        onValue(assetsRefLocal, aHandler, (err) => { console.error("assets listen err", err); setLoading(false); });
        onValue(liabilitiesRefLocal, lHandler, (err) => { console.error("liabilities listen err", err); setLoading(false); });
      } else {
        // when user logs out, clear lists
        setAssets([]);
        setLiabilities([]);
      }
    });

    // cleanup on unmount: off DB listeners and unsubscribe auth
    return () => {
      try {
        if (assetsRefLocal && aHandler) off(assetsRefLocal, "value", aHandler);
      } catch (e) {}
      try {
        if (liabilitiesRefLocal && lHandler) off(liabilitiesRefLocal, "value", lHandler);
      } catch (e) {}
      try { unsubAuth(); } catch (e) {}
    };
  }, [auth, db]);

  // --------------- NEW: Gemini client call to generate and save trend into Firebase ---------------
  const ranGeminiRef = useRef(false);

  // helper to read possible env locations (supports Vite import.meta.env, process.env fallback and window global)
  function getClientGeminiKey() {
    try {
      // Vite style
      if (typeof import.meta !== "undefined" && import.meta.env) {
        if (import.meta.env.VITE_GEMINI_API_KEY) return import.meta.env.VITE_GEMINI_API_KEY;
        if (import.meta.env.GEMINI_API_KEY) return import.meta.env.GEMINI_API_KEY;
      }
    } catch (e) {}
    // process.env (some bundlers)
    try {
      if (typeof process !== "undefined" && process.env) {
        if (process.env.VITE_GEMINI_API_KEY) return process.env.VITE_GEMINI_API_KEY;
        if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
        if (process.env.REACT_APP_GEMINI_API_KEY) return process.env.REACT_APP_GEMINI_API_KEY;
      }
    } catch (e) {}
    // window global fallback
    try {
      if (typeof window !== "undefined" && window.__GEMINI_API_KEY) return window.__GEMINI_API_KEY;
    } catch (e) {}
    return null;
  }

  // browser-friendly Gemini call + robust parsing
  async function callGeminiFromClient(prompt, apiKey) {
    if (!apiKey) throw new Error("No Gemini key provided to client callGeminiFromClient");
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
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      throw new Error(`Gemini API error ${res.status}: ${txt}`);
    }

    const data = await res.json();

    // robust text extraction (similar to server script)
    const textCandidates = [];
    try {
      const candidates = data?.candidates || data?.output?.candidates;
      if (Array.isArray(candidates) && candidates.length) {
        for (const c of candidates) {
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

    if (!textCandidates.length) textCandidates.push(JSON.stringify(data));

    for (const text of textCandidates) {
      try {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) return parsed;
      } catch (e) {}

      const m = text.match(/\[[\s\d,.\-]+\]/m);
      if (m) {
        try {
          const parsed = JSON.parse(m[0]);
          if (Array.isArray(parsed)) return parsed;
        } catch (e) {}
      }

      const nums = text.match(/-?\d{2,}/g);
      if (nums && nums.length >= 6) {
        const last6 = nums.slice(-6).map((n) => Number(n));
        return last6;
      }
    }

    throw new Error("Could not parse Gemini response into an integer array. Raw candidates: " + JSON.stringify(textCandidates));
  }

  useEffect(() => {
    // run only once per session, only when user & db present and not demo
    if (ranGeminiRef.current) return;
    if (!user || !db) return;
    if (demoMode) return;

    // if trend already present, skip
    if (assets.some(a => a.id === "_generated_trend")) {
      ranGeminiRef.current = true;
      return;
    }

    const GEMINI_KEY = getClientGeminiKey();
    if (!GEMINI_KEY) {
      // nothing to do client-side
      return;
    }

    // warn user (console) about client-side key exposure
    console.warn("Using client-side Gemini key to generate trend. This exposes the key in browser. Prefer server-side script.");

    let cancelled = false;

    (async () => {
      try {
        const totalA = assets.reduce((s, a) => s + (Number(a.value || 0)), 0);
        const totalL = liabilities.reduce((s, l) => s + (Number(l.value || 0)), 0);
        const netWorth = totalA - totalL;
        const prompt = `You are an assistant that returns only a strict JSON array of 6 integer numbers.
Generate six realistic net-worth numbers (INR) for the last 6 periods (most recent last). The user's current net worth is ${Math.round(netWorth || 0)}.
- Each number must be an integer.
- Keep values roughly within ±10% of current net worth.
- Introduce small ups and downs (no perfectly straight lines).
- Return ONLY a valid JSON array (example: [123456,123000,124500,122900,125300,124800]) and nothing else.`;

        const trend = await callGeminiFromClient(prompt, GEMINI_KEY);

        if (cancelled) return;
        if (!Array.isArray(trend) || trend.length === 0) {
          console.error("Gemini returned invalid trend:", trend);
          return;
        }

        const trendInts = trend.map(n => Math.round(Number(n) || 0));

        const ts = Date.now();
        const assetPath = `users/${user.uid}/assets/_generated_trend`;
        const liabilityPath = `users/${user.uid}/liabilities/_generated_trend_zero`;

        const assetPayload = {
          id: "_generated_trend",
          name: "_generated trend (gemini)",
          value: trendInts[trendInts.length - 1] || 0,
          history: trendInts,
          createdAt: ts,
          updatedAt: ts,
        };

        const liabilityPayload = {
          id: "_generated_trend_zero",
          name: "_generated trend (zero)",
          value: 0,
          history: Array(trendInts.length).fill(0),
          createdAt: ts,
          updatedAt: ts,
        };

        await set(ref(db, assetPath), assetPayload);
        await set(ref(db, liabilityPath), liabilityPayload);
        ranGeminiRef.current = true;
        // assets listener will pick up the new generated asset and re-render
      } catch (e) {
        console.error("Gemini generation failed (client):", e);
      }
    })();

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, db, assets, liabilities, demoMode]);

  // --------------- END NEW Gemini client logic ---------------

  const totalAssets = useMemo(() => assets.reduce((s, a) => s + (Number(a.value || 0)), 0), [assets]);
  const totalLiabilities = useMemo(() => liabilities.reduce((s, l) => s + (Number(l.value || 0)), 0), [liabilities]);
  const netWorth = useMemo(() => totalAssets - totalLiabilities, [totalAssets, totalLiabilities]);

  const trend = useMemo(() => {
    // If asset/liability histories are present build trend from them (existing behavior)
    const hasHist = assets.some(a => Array.isArray(a.history)) || liabilities.some(l => Array.isArray(l.history));
    if (hasHist) {
      const points = [];
      const maxLen = Math.max(...assets.map(a => (a.history||[]).length), ...liabilities.map(l => (l.history||[]).length), 0);
      for (let i = 0; i < Math.min(6, maxLen || 6); i++) {
        const aSum = assets.reduce((s, a) => s + ((a.history && a.history[i]) ? Number(a.history[i]) : 0), 0);
        const lSum = liabilities.reduce((s, l) => s + ((l.history && l.history[i]) ? Number(l.history[i]) : 0), 0);
        points.push(aSum - lSum);
      }
      if (points.length) {
        // if historical points exist but are very flat, add a small deterministic jitter so sparkline shows subtle motion
        const flat = points.every(p => p === points[0]);
        if (flat) {
          const seed = Math.abs(Number(points[0]) || 1);
          const seededRandom = (s, idx) => {
            const x = Math.sin(s * 0.0001 + idx * 12.9898) * 43758.5453;
            return x - Math.floor(x);
          };
          const jitterFactor = 0.035; // ±3.5%
          const sinAmp = 0.02;
          let jittered = points.map((p, i) => {
            const r = seededRandom(seed, i);
            const sinOffset = Math.sin(i * 1.7) * sinAmp;
            const j = (r - 0.5) * 2 * jitterFactor;
            return Math.round(p * (1 + j + sinOffset));
          });

          // light smoothing
          if (jittered.length >= 3) {
            const cpy = jittered.slice();
            for (let i = 1; i < jittered.length - 1; i++) {
              cpy[i] = Math.round(jittered[i - 1] * 0.25 + jittered[i] * 0.5 + jittered[i + 1] * 0.25);
            }
            jittered = cpy;
          }
          return jittered;
        }
        // otherwise points already have variation — lightly smooth to avoid jagged spikes
        if (points.length >= 3) {
          const copy = points.slice();
          for (let i = 1; i < points.length - 1; i++) {
            copy[i] = Math.round(points[i - 1] * 0.25 + points[i] * 0.5 + points[i + 1] * 0.25);
          }
          return copy;
        }
        return points;
      }
    }

    // --- FALLBACK (previously linear). produce a nicer-looking trend with small ups/downs
    const seed = Math.abs(Number(netWorth) || 1234567);
    const basePoints = Array.from({ length: 6 }, (_, i) => {
      // base linear progression used previously
      return netWorth * (0.92 + i * 0.016);
    });

    const seededRandom = (s, idx) => {
      const x = Math.sin(s * 0.00001234 + idx * 12.9898) * 43758.5453;
      return x - Math.floor(x);
    };

    const jitterFactor = 0.035; // ~3.5% max jitter
    const sinAmp = 0.02; // ±2%

    let points = basePoints.map((base, i) => {
      const r = seededRandom(seed, i);
      const sinOffset = Math.sin(i * 1.7) * sinAmp; // gentle wave
      const j = (r - 0.5) * 2 * jitterFactor; // range ±jitterFactor
      const val = base * (1 + j + sinOffset);
      return Math.round(val);
    });

    // light smoothing to avoid too sharp spikes: weighted moving average (keeps deviations but softens)
    if (points.length >= 3) {
      const copy = points.slice();
      for (let i = 1; i < points.length - 1; i++) {
        copy[i] = Math.round(points[i - 1] * 0.25 + points[i] * 0.5 + points[i + 1] * 0.25);
      }
      points = copy;
    }

    return points;
  }, [assets, liabilities, netWorth]);

  // Save function now takes kind explicitly to avoid relying on 'adding' closure
  async function saveNewItem(kind, nameVal, valueVal) {
    const name = (typeof nameVal === "string" ? nameVal.trim() : "").trim();
    if (!name) {
      openModal({
        title: "Missing name",
        message: "Please enter a name before saving.",
        showCancel: false,
        confirmText: "OK",
      });
      return;
    }
    const numeric = Number(valueVal || 0);
    const id = String(Date.now());
    const payload = { name, value: numeric, createdAt: Date.now(), updatedAt: Date.now() };

    if (!db || !user) {
      if (kind === "asset") setAssets(s => [{ id, ...payload }, ...s]);
      else setLiabilities(s => [{ id, ...payload }, ...s]);
      setAdding({ kind: null, name: "", value: "", anchor: null });
      return;
    }

    const targetPath = `users/${user.uid}/${kind === "asset" ? "assets" : "liabilities"}/${id}`;
    try {
      await set(ref(db, targetPath), payload);
      setAdding({ kind: null, name: "", value: "", anchor: null });
    } catch (e) {
      console.error("save err", e);
      openModal({
        title: "Save failed",
        message: "Failed to save item. Check console for details.",
        showCancel: false,
        confirmText: "OK",
      });
    }
  }

  function cancelAdding() {
    setAdding({ kind: null, name: "", value: "", anchor: null });
  }

  function deleteItem(kind = "asset", id) {
    // open modal and perform deletion in onConfirm so UI matches reference modal style
    openModal({
      title: "Delete item",
      message: "Are you sure you want to delete this item? This action cannot be undone.",
      showCancel: true,
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          if (!db || !user) {
            if (kind === "asset") setAssets(s => s.filter(x => x.id !== id));
            else setLiabilities(s => s.filter(x => x.id !== id));
            closeModal();
            return;
          }
          const delRef = ref(db, `users/${user.uid}/${kind === "asset" ? "assets" : "liabilities"}/${id}`);
          await remove(delRef);
        } catch (e) {
          console.error(e);
        } finally {
          closeModal();
        }
      },
    });
  }

  // Local AddForm component that keeps its own typing state to avoid parent re-render clobbering.
  const AddForm = ({ anchor }) => {
    const show = adding.kind && adding.anchor === anchor;
    const kind = adding.kind; // 'asset' | 'liability' | null
    const [localName, setLocalName] = useState("");
    const [localValue, setLocalValue] = useState("");

    // initialize when form opens
    useEffect(() => {
      if (show) {
        setLocalName(adding.name || "");
        setLocalValue(adding.value || "");
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [show, adding.kind, adding.anchor]);

    if (!show) return null;

    return (
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 8 }}>
        <input
          placeholder={kind === "asset" ? "Asset name" : "Liability name"}
          value={localName}
          onChange={e => setLocalName(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(15,23,42,0.08)", minWidth: 160 }}
        />
        <input
          placeholder="Value"
          value={localValue}
          onChange={e => setLocalValue(e.target.value)}
          style={{ padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(15,23,42,0.08)", width: 110 }}
          inputMode="numeric"
        />
        <button onClick={() => saveNewItem(kind, localName, localValue)} style={{ border: "none", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: COLORS.primary, color: "#fff", fontWeight: 700 }}>Save</button>
        <button onClick={cancelAdding} style={{ border: "none", padding: "8px 10px", borderRadius: 8, cursor: "pointer", background: "transparent", color: COLORS.muted }}>Cancel</button>
      </div>
    );
  };

  // helper to render the modal (so we can reuse in both branches)
  const renderModal = () => {
    if (!modal.open) return null;
    return (
      <div
        role="dialog"
        aria-modal="true"
        style={{
          position: "fixed",
          inset: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      >
        <div
          onClick={closeModal}
          style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}
        />

        <div
          style={{
            background: "#ffffff",
            padding: "20px",
            borderRadius: "10px",
            width: "420px",
            boxShadow: "0 12px 40px rgba(2,6,23,0.2)",
            position: "relative",
            zIndex: 10000,
          }}
        >
          <div style={{ fontWeight: 800, marginBottom: "8px", color: "#0f172a" }}>{modal.title}</div>
          <div style={{ fontSize: "14px", color: "#334155", marginBottom: "18px" }}>{modal.message}</div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            {modal.showCancel && (
              <button
                onClick={closeModal}
                style={{
                  padding: "8px 12px",
                  borderRadius: "6px",
                  border: "1px solid #cbd5e1",
                  background: "white",
                  cursor: "pointer",
                  fontWeight: 700,
                }}
              >
                {modal.cancelText}
              </button>
            )}

            <button
              onClick={async () => {
                if (typeof modal.onConfirm === "function") {
                  try {
                    await modal.onConfirm();
                  } catch (e) {
                    console.error("modal onConfirm error", e);
                    closeModal();
                  }
                } else {
                  closeModal();
                }
              }}
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                border: "none",
                background: modal.confirmText === "Delete" ? "#dc2626" : "#0f9960",
                color: "white",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              {modal.confirmText}
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Render demo-mode (no firebase) and active firebase states
  if (!auth || !db) {
    return (
      <div style={{ padding: 28, fontFamily: "system-ui, -apple-system, Roboto, 'Segoe UI', 'Helvetica Neue', Arial", background: COLORS.pageBg, borderRadius: 18 }}>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, color: COLORS.heading, display: "flex", alignItems: "center", gap: 10 }}>
                {renderIcon(Scale, 20, COLORS.primary)} <span>Net Worth</span>
              </h1>
              <div style={{ color: COLORS.muted, marginTop: 6 }}>Assets vs liabilities — demo mode (Firebase not initialized)</div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* plus buttons — open inline form in header; hide in printMode */}
              {!printMode && !adding.kind && (
                <>
                  <button onClick={() => setAdding({ kind: "asset", name: "", value: "", anchor: "header" })} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(PlusCircle, 20, COLORS.primary)}</button>
                  <button onClick={() => setAdding({ kind: "liability", name: "", value: "", anchor: "header" })} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(PlusCircle, 20, COLORS.danger)}</button>
                </>
              )}

              {/* show header add form if triggered (hide in printMode) */}
              {!printMode && <AddForm anchor="header" />}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 16 }}>
            <div style={{ background: COLORS.mainCardBg, padding: 16, borderRadius: 12, boxShadow: "0 10px 30px rgba(16,24,40,0.06)", border: `1px solid ${COLORS.cardBorder}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.muted }}>Net worth</div>
                  <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.mainCardText }}>{moneyINR(netWorth)}</div>
                </div>
                <div style={{ textAlign: "right", color: COLORS.muted }}>
                  <div style={{ color: COLORS.muted }}>Total assets</div>
                  <div style={{ fontWeight: 800, color: COLORS.mainCardText }}>{moneyINR(totalAssets)}</div>
                  <div style={{ marginTop: 6 }}>Liabilities: <span style={{ fontWeight: 800, color: COLORS.mainCardText }}>{moneyINR(totalLiabilities)}</span></div>
                </div>
              </div>

              <div style={{ height: 88 }}>
                <svg width="100%" height="100%" viewBox="0 0 300 88" preserveAspectRatio="none">
                  <polyline fill="none" stroke={COLORS.primary} strokeWidth="2.5" points={sparklinePoints(trend, 300, 88)} />
                </svg>
              </div>

              <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
                <div style={{ flex: 1, padding: 10, borderRadius: 10, background: COLORS.stat1Bg, border: `1px solid ${COLORS.cardBorder}` }}>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>Total assets</div>
                  <div style={{ fontWeight: 800, color: COLORS.stat1Text }}>{moneyINR(totalAssets)}</div>
                </div>
                <div style={{ flex: 1, padding: 10, borderRadius: 10, background: COLORS.stat2Bg, border: `1px solid ${COLORS.cardBorder}` }}>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>Total liabilities</div>
                  <div style={{ fontWeight: 800, color: COLORS.stat2Text }}>{moneyINR(totalLiabilities)}</div>
                </div>
                <div style={{ flex: 1, padding: 10, borderRadius: 10, background: COLORS.stat3Bg, border: `1px solid ${COLORS.cardBorder}` }}>
                  <div style={{ fontSize: 12, color: COLORS.muted }}>Net worth</div>
                  <div style={{ fontWeight: 800, color: COLORS.stat3Text }}>{moneyINR(netWorth)}</div>
                </div>
              </div>
            </div>

            <div style={{ background: COLORS.allocationBg, padding: 14, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                <div style={{ fontWeight: 700, color: COLORS.allocationText }}>Allocation</div>
                <div style={{ color: COLORS.muted, fontSize: 13 }}>{assets.length + liabilities.length} items</div>
              </div>

              <div style={{ marginTop: 8 }}>
                {[...assets.slice(0,4), ...liabilities.slice(0,4)].map(it => {
                  const meta = getItemMeta(it.name);
                  const pct = Math.round((Number(it.value || 0) / Math.max(totalAssets,1)) * 100);
                  return (
                    <div key={it.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                        <div style={{ width: 36, height: 36, borderRadius: 8, display: "grid", placeItems: "center", background: meta.color }}>
                          {renderIcon(meta.Icon, 16, "#fff")}
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.allocationText }}>{it.name}</div>
                          <div style={{ fontSize: 12, color: COLORS.muted }}>{moneyINR(it.value)}</div>
                        </div>
                      </div>

                      <div style={{ width: 90, textAlign: "right", fontWeight: 700, color: COLORS.muted }}>{pct}%</div>
                    </div>
                  );
                })}

                <div style={{ marginTop: 6, display: "flex", alignItems: "center" }}>
                  {/* allocation plus buttons — show the inline form here when clicked; hide in printMode */}
                  {!printMode && !adding.kind && (
                    <>
                      <button onClick={() => setAdding({ kind: "asset", name: "", value: "", anchor: "allocation" })} style={{ marginRight: 8, border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(PlusCircle, 18, COLORS.primary)}</button>
                      <button onClick={() => setAdding({ kind: "liability", name: "", value: "", anchor: "allocation" })} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(PlusCircle, 18, COLORS.danger)}</button>
                    </>
                  )}
                  {!printMode && <AddForm anchor="allocation" />}
                </div>
              </div>
            </div>
          </div>

          {/* full lists */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }}>
            <div style={{ background: COLORS.assetsCardBg, padding: 14, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 800, color: COLORS.assetsCardText }}>Assets</div>
                <div style={{ color: COLORS.muted }}>{assets.length} items</div>
              </div>
              <div>
                {assets.map(a => (
                  <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid rgba(15,23,42,0.03)" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: getItemMeta(a.name).color, display: "grid", placeItems: "center" }}>
                        {renderIcon(getItemMeta(a.name).Icon, 16, "#fff")}
                      </div>
                      <div>
                        <div style={{ fontWeight: 700, color: COLORS.assetsCardText }}>{a.name}</div>
                        <div style={{ fontSize: 12, color: COLORS.muted }}><Clock size={12} /> {new Date(a.updatedAt || a.createdAt || Date.now()).toLocaleDateString('en-GB')}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ fontWeight: 800 }}>{moneyINR(a.value)}</div>
                      {/* keep delete enabled in printMode? we hide interactive controls elsewhere; keep delete visible only when NOT printMode */}
                      {!printMode && <button onClick={() => deleteItem("asset", a.id)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(Trash2, 16, COLORS.danger)}</button>}
                    </div>
                  </div>
                ))}
                {assets.length === 0 && <div style={{ color: COLORS.muted, padding: 12 }}>No assets recorded</div>}
              </div>
            </div>

            <div style={{ background: COLORS.liabilitiesCardBg, padding: 14, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 800, color: COLORS.liabilitiesCardText }}>Liabilities</div>
                <div style={{ color: COLORS.muted }}>{liabilities.length} items</div>
              </div>
              <div>
                {liabilities.map(l => (
                  <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid rgba(15,23,42,0.03)" }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: getItemMeta(l.name).color, display: "grid", placeItems: "center" }}>{renderIcon(getItemMeta(l.name).Icon, 16, "#fff")}</div>
                      <div>
                        <div style={{ fontWeight: 700, color: COLORS.liabilitiesCardText }}>{l.name}</div>
                        <div style={{ fontSize: 12, color: COLORS.muted }}>{new Date(l.updatedAt || l.createdAt || Date.now()).toLocaleDateString('en-GB')}</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                      <div style={{ fontWeight: 800 }}>{moneyINR(l.value)}</div>
                      {!printMode && <button onClick={() => deleteItem("liability", l.id)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(Trash2, 16, COLORS.danger)}</button>}
                    </div>
                  </div>
                ))}
                {liabilities.length === 0 && <div style={{ color: COLORS.muted, padding: 12 }}>No liabilities recorded</div>}
              </div>
            </div>
          </div>

        </div>
        {renderModal()}
      </div>
    );
  }

  // when firebase present and available
  return (
    <div style={{ padding: 28, fontFamily: "system-ui, -apple-system, Roboto, 'Segoe UI', 'Helvetica Neue', Arial", background: COLORS.pageBg, borderRadius: 18 }} className="nw-page-wrap">
      <div style={{ maxWidth: 1200, margin: "0 auto", minWidth: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, color: COLORS.heading, display: "flex", alignItems: "center", gap: 10 }}>
              {renderIcon(Scale, 20, COLORS.primary)} <span>Net Worth</span>
            </h1>
            <div style={{ color: COLORS.muted, marginTop: 6 }}>Assets vs liabilities — consolidated view</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {/* hide interactive add controls in printMode */}
            {!printMode && !adding.kind && (
              <>
                <button onClick={() => setAdding({ kind: "asset", name: "", value: "", anchor: "header" })} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(PlusCircle, 20, COLORS.primary)}</button>
                <button onClick={() => setAdding({ kind: "liability", name: "", value: "", anchor: "header" })} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(PlusCircle, 20, COLORS.danger)}</button>
              </>
            )}
            {!printMode && <AddForm anchor="header" />}
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 16, minWidth: 0 }} className="nw-main-grid">
          <div style={{ background: COLORS.mainCardBg, padding: 18, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}`, boxShadow: "0 10px 30px rgba(16,24,40,0.04)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, flexWrap: "wrap" }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 13, color: COLORS.muted, fontWeight: 700 }}>Net worth</div>
                <div style={{ fontSize: 28, fontWeight: 900, color: COLORS.mainCardText, wordBreak: "break-word" }}>{moneyINR(netWorth)}</div>
                <div style={{ color: COLORS.muted, marginTop: 6, fontSize: 13, wordBreak: "break-word" }}>Assets {moneyINR(totalAssets)} · Liabilities {moneyINR(totalLiabilities)}</div>
              </div>
              <div style={{ textAlign: "right", flexShrink: 0 }} className="nw-lastsync">
                <div style={{ fontSize: 13, color: COLORS.muted }}>Last sync</div>
                <div style={{ fontWeight: 800, color: COLORS.mainCardText, fontSize: 12 }}>{new Date(Math.max(...assets.map(a => a.updatedAt || 0), ...liabilities.map(l => l.updatedAt || 0), Date.now())).toLocaleString('en-GB')}</div>
              </div>
            </div>

            <div style={{ height: 160, marginTop: 14 }}>
              <svg width="100%" height="100%" viewBox="0 0 720 160" preserveAspectRatio="none">
                <polyline fill="none" stroke={COLORS.primary} strokeWidth="2.2" points={sparklinePoints(trend, 720, 160)} />
              </svg>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }} className="nw-stat-boxes">
              <div style={{ flex: "1 1 80px", minWidth: 0, padding: 10, borderRadius: 10, background: COLORS.stat1Bg, border: `1px solid ${COLORS.cardBorder}` }}>
                <div style={{ fontSize: 11, color: COLORS.muted }}>Total assets</div>
                <div style={{ fontWeight: 800, color: COLORS.stat1Text, fontSize: 13, wordBreak: "break-word" }}>{moneyINR(totalAssets)}</div>
              </div>

              <div style={{ flex: "1 1 80px", minWidth: 0, padding: 10, borderRadius: 10, background: COLORS.stat2Bg, border: `1px solid ${COLORS.cardBorder}` }}>
                <div style={{ fontSize: 11, color: COLORS.muted }}>Total liabilities</div>
                <div style={{ fontWeight: 800, color: COLORS.stat2Text, fontSize: 13, wordBreak: "break-word" }}>{moneyINR(totalLiabilities)}</div>
              </div>

              <div style={{ flex: "1 1 80px", minWidth: 0, padding: 10, borderRadius: 10, background: COLORS.stat3Bg, border: `1px solid ${COLORS.cardBorder}` }}>
                <div style={{ fontSize: 11, color: COLORS.muted }}>Net worth</div>
                <div style={{ fontWeight: 800, color: COLORS.stat3Text, fontSize: 13, wordBreak: "break-word" }}>{moneyINR(netWorth)}</div>
              </div>

            </div>

          </div>

          <div style={{ background: COLORS.topHoldingsBg, padding: 14, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: COLORS.topHoldingsText }}>Top holdings</div>
              <div style={{ color: COLORS.muted }}>{assets.length} assets</div>
            </div>

            <div>
              {assets.slice(0,6).map(a => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(15,23,42,0.03)", gap: 8, minWidth: 0 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", minWidth: 0, flex: 1 }}>
                    <div style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 10, background: getItemMeta(a.name).color, display: "grid", placeItems: "center" }}>{renderIcon(getItemMeta(a.name).Icon, 18, "#fff")}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 700, color: COLORS.topHoldingsText, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>{moneyINR(a.value)}</div>
                    </div>
                  </div>
                  <div style={{ fontWeight: 800, flexShrink: 0, fontSize: 13 }}>{moneyINR(a.value)}</div>
                </div>
              ))}

              {assets.length === 0 && <div style={{ color: COLORS.muted, padding: 12 }}>No assets available</div>}

              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.heading }}>Notes</div>
                <div style={{ color: COLORS.muted, marginTop: 6 }}>Add assets and liabilities to get a consolidated view of your net worth. Use the + buttons above to quickly add items.</div>
              </div>
            </div>
          </div>
        </div>

        {/* lists */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 16 }} className="nw-lists-grid">
          <div style={{ background: COLORS.assetsCardBg, padding: 14, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 800, color: COLORS.assetsCardText }}>Assets</div>
              <div style={{ color: COLORS.muted }}>{assets.length} items</div>
            </div>
            <div>
              {assets.map(a => (
                <div key={a.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid rgba(15,23,42,0.03)" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: getItemMeta(a.name).color, display: "grid", placeItems: "center" }}>{renderIcon(getItemMeta(a.name).Icon, 16, "#fff")}</div>
                    <div>
                      <div style={{ fontWeight: 700, color: COLORS.assetsCardText }}>{a.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>{new Date(a.updatedAt || a.createdAt || Date.now()).toLocaleDateString('en-GB')}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{moneyINR(a.value)}</div>
                    {!printMode && <button onClick={() => deleteItem("asset", a.id)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(Trash2, 16, COLORS.danger)}</button>}
                  </div>
                </div>
              ))}
              {assets.length === 0 && <div style={{ color: COLORS.muted, padding: 12 }}>No assets recorded</div>}
            </div>
          </div>

          <div style={{ background: COLORS.liabilitiesCardBg, padding: 14, borderRadius: 12, border: `1px solid ${COLORS.cardBorder}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div style={{ fontWeight: 800, color: COLORS.liabilitiesCardText }}>Liabilities</div>
              <div style={{ color: COLORS.muted }}>{liabilities.length} items</div>
            </div>
            <div>
              {liabilities.map(l => (
                <div key={l.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid rgba(15,23,42,0.03)" }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 40, height: 40, borderRadius: 8, background: getItemMeta(l.name).color, display: "grid", placeItems: "center" }}>{renderIcon(getItemMeta(l.name).Icon, 16, "#fff")}</div>
                    <div>
                      <div style={{ fontWeight: 700, color: COLORS.liabilitiesCardText }}>{l.name}</div>
                      <div style={{ fontSize: 12, color: COLORS.muted }}>{new Date(l.updatedAt || l.createdAt || Date.now()).toLocaleDateString('en-GB')}</div>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <div style={{ fontWeight: 800 }}>{moneyINR(l.value)}</div>
                    {!printMode && <button onClick={() => deleteItem("liability", l.id)} style={{ border: "none", background: "transparent", cursor: "pointer" }}>{renderIcon(Trash2, 16, COLORS.danger)}</button>}
                  </div>
                </div>
              ))}
              {liabilities.length === 0 && <div style={{ color: COLORS.muted, padding: 12 }}>No liabilities recorded</div>}
            </div>
          </div>
        </div>

      </div>
      {renderModal()}
      <style>{`
        @media (max-width: 768px) {
          .nw-page-wrap {
            padding: 12px !important;
            overflow-x: hidden !important;
          }
          .nw-main-grid {
            grid-template-columns: 1fr !important;
          }
          .nw-lists-grid {
            grid-template-columns: 1fr !important;
          }
          .nw-lastsync {
            display: none !important;
          }
          .nw-stat-boxes {
            flex-wrap: wrap !important;
          }
        }
        .nw-page-wrap * {
          box-sizing: border-box;
        }
      `}</style>
    </div>
  );
}
