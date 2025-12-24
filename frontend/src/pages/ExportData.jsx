// frontend/src/pages/ExportExactPage.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, get } from "firebase/database";
import html2canvas from "html2canvas";
import jsPDF from "jspdf";

import Dashboard from "C:/Users/Gnanaseelan V/Downloads/smart-budget-tracker/frontend/src/pages/Dashboard.jsx";
import BudgetsOverview from "./BudgetsOverview";
import Categories from "./Categories";
import Analytics from "./Analytics";
import Transactions from "./Transactions";
import Reports from "./Reports";
import Trends from "./Trends";
import Recurring from "./Recurring";
import NetWorth from "./NetWorth";
import Savings from "./Savings";
import ScheduledBills from "./ScheduledBills";

const MONTHS_FULL = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

function moneyINR(n) {
  if (n == null || isNaN(Number(n))) return "₹0";
  return "₹" + Number(n).toLocaleString("en-IN");
}

function safeParseDate(raw) {
  if (raw === undefined || raw === null) return null;
  if (raw instanceof Date) {
    if (!isNaN(raw)) return raw;
    return null;
  }
  if (typeof raw === "number") {
    if (raw < 1e12) return new Date(raw * 1000);
    return new Date(raw);
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (s.includes("/")) {
      const parts = s.split("/");
      if (parts.length === 3) {
        const [d, m, y] = parts;
        const dd = parseInt(d, 10);
        const mm = parseInt(m, 10) - 1;
        const yy = parseInt(y, 10);
        if (!Number.isNaN(dd) && !Number.isNaN(mm) && !Number.isNaN(yy)) {
          const constructed = new Date(yy, mm, dd);
          if (!isNaN(constructed)) return constructed;
        }
      }
    }
    const asNum = Number(s);
    if (!Number.isNaN(asNum)) {
      if (asNum < 1e12) return new Date(asNum * 1000);
      return new Date(asNum);
    }
    const iso = new Date(s);
    if (!isNaN(iso)) return iso;
  }
  return null;
}

export default function ExportExactPage() {
  const auth = getAuth();
  const db = getDatabase();
  const [user, setUser] = useState(auth.currentUser || null);

  const [mode, setMode] = useState("month");
  const now = new Date();
  const [selMonth, setSelMonth] = useState(now.getMonth());
  const [selYear, setSelYear] = useState(now.getFullYear());

  const [loading, setLoading] = useState(false);
  const [loadedOnce, setLoadedOnce] = useState(false);

  const [profile, setProfile] = useState(null);
  const [allExpenses, setAllExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [monthlyBudgetsMap, setMonthlyBudgetsMap] = useState({});
  const [assets, setAssets] = useState([]);
  const [liabilities, setLiabilities] = useState([]);

  const exportRef = useRef(null);

  // NetWorth extraction refs/state:
  const networthHostRef = useRef(null); // hidden host where NetWorth is rendered to read its DOM
  const [networthCardHtml, setNetworthCardHtml] = useState([]); // array of HTML strings (one per card)

  // --- New modal / progress state (added) ---
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [progress, setProgress] = useState(0); // 0..100
  const [progressMessage, setProgressMessage] = useState("");
  const [progressReady, setProgressReady] = useState(false); // true when 100 and ready to export

  // controllers/refs for progress animation and cancellation
  const progressAnimationControllerRef = useRef(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => {
      isMountedRef.current = false;
      unsub && unsub();
      // cancel any running animation
      if (progressAnimationControllerRef.current && progressAnimationControllerRef.current.cancel) {
        progressAnimationControllerRef.current.cancel();
      }
    };
  }, [auth]);

  function computeMonthKeys() {
    if (mode === "month") {
      const monthKey = `${selYear}-${String(selMonth + 1).padStart(2, "0")}`;
      return [monthKey];
    }
    return Array.from({length: 12}).map((_, i) => `${selYear}-${String(i+1).padStart(2,"0")}`);
  }

  // startProgressLoop now returns a promise that resolves when the checkpoint animation completes.
  // total animation time ~10-15s, at least 5 stops/checkpoints before finalizing (not counting the final 100% set by caller).
  // IMPORTANT: progress will never go backward; we maintain a local currentProgress to ensure monotonic increases.
  function startProgressLoop({ minDuration = 10000, maxExtra = 5000 } = {}) {
    // cancel any previous animation
    if (progressAnimationControllerRef.current && progressAnimationControllerRef.current.cancel) {
      progressAnimationControllerRef.current.cancel();
    }

    let cancelled = false;
    const controller = {};
    progressAnimationControllerRef.current = controller;

    // local current progress value used for monotonic updates
    let currentProgress = Math.max(0, Math.min(100, Number(progress) || 0));
    // initialize UI
    if (isMountedRef.current) {
      setProgress(currentProgress);
      setProgressMessage("Initializing...");
      setProgressReady(false);
    }

    const promise = new Promise(async (resolve) => {
      controller.cancel = () => {
        cancelled = true;
        if (isMountedRef.current) {
          // keep progress at current value but not 100
          setProgress((p) => Math.min(99, Math.max(0, p)));
          setProgressMessage("Cancelled");
        }
        resolve();
      };

      // pick a total duration between minDuration and minDuration + maxExtra
      const totalDuration = minDuration + Math.floor(Math.random() * maxExtra); // ms

      // checkpoints (must be at least 5 stops)
      const checkpoints = [8, 22, 40, 58, 72, 86, 95]; // 7 stops (≥5)
      const segments = checkpoints.length;
      const segmentDuration = Math.floor(totalDuration / segments);

      // helper that animates progress from currentProgress to target over duration (ms)
      const animateTo = (target, duration) => new Promise((res) => {
        if (cancelled || !isMountedRef.current) return res();
        // ensure target is always >= currentProgress (monotonic)
        const safeTarget = Math.max(target, currentProgress);
        const start = Date.now();
        const startValue = currentProgress;
        const delta = safeTarget - startValue;
        if (delta <= 0) {
          currentProgress = safeTarget;
          if (isMountedRef.current) setProgress(currentProgress);
          return res();
        }
        const tick = 120; // ms per frame
        let iv = setInterval(() => {
          if (cancelled || !isMountedRef.current) {
            clearInterval(iv);
            return res();
          }
          const now = Date.now();
          const elapsed = now - start;
          const t = Math.min(1, elapsed / duration);
          const eased = t; // linear easing
          const next = Math.round(startValue + delta * eased);
          // enforce monotonic increase
          if (next > currentProgress) {
            currentProgress = next;
            if (isMountedRef.current) setProgress(currentProgress);
          }
          if (t >= 1) {
            clearInterval(iv);
            // small safety ensure exact
            currentProgress = safeTarget;
            if (isMountedRef.current) setProgress(currentProgress);
            return res();
          }
        }, tick);
      });

      // iterate checkpoints sequentially with small pauses (explicit stops)
      for (let i = 0; i < checkpoints.length; i++) {
        if (cancelled || !isMountedRef.current) break;
        const target = checkpoints[i];
        // animate to this checkpoint
        await animateTo(target, segmentDuration);
        if (cancelled || !isMountedRef.current) break;

        // update message based on progress
        if (currentProgress < 30) {
          if (isMountedRef.current) setProgressMessage("Connecting to database...");
        } else if (currentProgress < 60) {
          if (isMountedRef.current) setProgressMessage("Reading data...");
        } else if (currentProgress < 90) {
          if (isMountedRef.current) setProgressMessage("Processing and formatting...");
        } else {
          if (isMountedRef.current) setProgressMessage("Finalizing...");
        }

        // explicit stop / pause to create "at least 5 stops"
        const pauseMs = 300 + Math.floor(Math.random() * 900); // 300-1200ms
        await new Promise((r) => setTimeout(r, pauseMs));
      }

      // resolve to indicate the checkpoint animation finished (not yet 100)
      if (!cancelled && isMountedRef.current) {
        // set to a high non-final value (95-99) to show nearly done, but ensure monotonic
        const finalNear = Math.min(99, Math.max(currentProgress, 95));
        currentProgress = finalNear;
        setProgress(currentProgress);
        setProgressMessage("Almost ready...");
      }
      resolve();
    });

    controller.promise = promise;
    return promise;
  }

  // loadAllData optionally accepts an options object:
  // { autoExport: boolean } - if true, after load completes and progress reaches 100, automatically call exportPdf()
  async function loadAllData({ autoExport = false } = {}) {
    if (!user) {
      alert("Please sign in to load data.");
      return;
    }

    // show modal and start progress simulation (retain existing UX)
    setShowProgressModal(true);
    const animationPromise = startProgressLoop();

    setLoading(true);
    await new Promise((resolve) => {
      if (typeof requestAnimationFrame === "function") requestAnimationFrame(resolve);
      else setTimeout(resolve, 16);
    });

    try {
      const profileSnap = await get(ref(db, `users/${user.uid}/profile`));
      setProfile(profileSnap.exists() ? profileSnap.val() : null);

      const catSnap = await get(ref(db, `users/${user.uid}/categories`));
      const catObj = catSnap.exists() ? catSnap.val() : {};
      const catArr = Object.entries(catObj || {}).map(([id, v]) => ({ id, ...v }));
      setCategories(catArr);

      const expSnap = await get(ref(db, `users/${user.uid}/expenses`));
      const expObj = expSnap.exists() ? expSnap.val() : {};
      const expArr = Object.entries(expObj || {}).map(([id, v]) => ({ id, ...v }));
      expArr.forEach(e => { e.amount = Number(e.amount || 0); });
      setAllExpenses(expArr);

      const months = computeMonthKeys();
      const newMap = {...monthlyBudgetsMap};
      for (const k of months) {
        const snap = await get(ref(db, `users/${user.uid}/monthlyBudgets/${k}`));
        newMap[k] = snap.exists() ? snap.val() : null;
      }
      setMonthlyBudgetsMap(newMap);

      const asSnap = await get(ref(db, `users/${user.uid}/assets`));
      setAssets(asSnap.exists() ? Object.entries(asSnap.val() || {}).map(([id, v]) => ({ id, ...v })) : []);
      const liSnap = await get(ref(db, `users/${user.uid}/liabilities`));
      setLiabilities(liSnap.exists() ? Object.entries(liSnap.val() || {}).map(([id, v]) => ({ id, ...v })) : []);

      setLoadedOnce(true);

      // Wait for the animation checkpoints to finish as well (so progress completes over 10-15s)
      try {
        if (progressAnimationControllerRef.current && progressAnimationControllerRef.current.promise) {
          await progressAnimationControllerRef.current.promise;
        }
      } catch (e) {
        // ignore
      }

      // small delay to make UX feel natural before hitting 100
      if (isMountedRef.current) {
        await new Promise((r) => setTimeout(r, 350));
        setProgress(100);
        setProgressMessage("Data loaded successfully — ready to export.");
        setProgressReady(true);
      }

      // If autoExport was requested, automatically call export after a short UX pause
      if (autoExport && isMountedRef.current) {
        // small delay so user sees 100% state
        await new Promise((r) => setTimeout(r, 350));
        // call exportPdf (it handles its own loading state)
        exportPdf();
      }
    } catch (err) {
      console.error("loadAllData error", err);
      alert("Failed to load export data (see console).");
      if (isMountedRef.current) {
        setProgressMessage("Failed to load data. See console.");
      }
    } finally {
      setLoading(false);
    }
  }

  const filteredExpenses = useMemo(() => {
    try {
      if (!allExpenses || !allExpenses.length) return [];
      return allExpenses.filter(e => {
        const parsed = safeParseDate(e.date || e.dateDMY || e.dateISO || e.createdAt);
        if (!parsed) return false;
        if (mode === "month") {
          return parsed.getMonth() === Number(selMonth) && parsed.getFullYear() === Number(selYear);
        }
        return parsed.getFullYear() === Number(selYear);
      });
    } catch (e) {
      console.error("filteredExpenses error", e);
      return [];
    }
  }, [allExpenses, mode, selMonth, selYear]);

  const selectedMonthlyBudgets = useMemo(() => {
    const keys = computeMonthKeys();
    return keys.map(k => ({ monthKey: k, data: monthlyBudgetsMap[k] || null }));
  }, [monthlyBudgetsMap, mode, selMonth, selYear]);

  // After NetWorth has rendered in the hidden host and loadedOnce is true,
  // extract its top-level child nodes as separate HTML pages.
  useEffect(() => {
    // run whenever we load data or the selected period changes
    if (!loadedOnce) return;
    // give the NetWorth component one animation frame to fully render into hidden host
    let cancelled = false;

    const extract = async () => {
      await new Promise((r) => requestAnimationFrame(r));
      // one more frame to be safe (NetWorth may paint nested children)
      await new Promise((r) => requestAnimationFrame(r));
      if (cancelled) return;
      const host = networthHostRef.current;
      if (!host) return;
      // pick top-level children of the NetWorth root — those are likely the main cards/sections
      const children = Array.from(host.children || []);
      if (children.length === 0) {
        // fallback: use innerHTML of host as a single page
        setNetworthCardHtml([host.innerHTML || ""]);
      } else {
        // convert each top-level child into an HTML string (we keep outerHTML)
        const htmls = children.map((c) => c.outerHTML || c.innerHTML || "");
        setNetworthCardHtml(htmls);
      }
    };

    extract();

    return () => { cancelled = true; };
  }, [loadedOnce, selMonth, selYear, mode]);

  async function exportPdf() {
    if (!exportRef.current) return alert("No content to export. Load data first.");
    try {
      setLoading(true);

      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pdfWpt = pdf.internal.pageSize.getWidth();
      const pdfHpt = pdf.internal.pageSize.getHeight();
      // px per point conversion (96px per CSS inch vs 72pt per inch)
      const PX_PER_PT = 96 / 72;
      const pdfWpx = Math.floor(pdfWpt * PX_PER_PT);
      const pdfHpx = Math.floor(pdfHpt * PX_PER_PT);

      // scale for html2canvas (cap to 3 to prevent huge memory usage)
      const dpr = window.devicePixelRatio || 1;
      const baseScale = Math.min(2 * (dpr || 1), 3);

      // find all direct children pages we created
      const container = exportRef.current;
      const pages = container.querySelectorAll(".export-page");

      if (!pages || pages.length === 0) {
        return alert("No export pages found.");
      }

      // Optionally show progress modal while exporting if not already visible
      if (!showProgressModal) {
        setShowProgressModal(true);
        // start a short progress loop to give UX feedback while PDF is generated
        // but don't override any existing progress if present
        startProgressLoop({ minDuration: 1400, maxExtra: 700 }).then(async () => {
          // ensure progress reaches 100 before save (this is just UX)
          if (isMountedRef.current) {
            setProgress(100);
            setProgressMessage("Rendering PDF...");
            setProgressReady(true);
          }
        }).catch(() => {});
      } else {
        // if modal is shown, update message
        setProgressMessage("Rendering PDF...");
      }

      let first = true;
      for (let i = 0; i < pages.length; i++) {
        const pageEl = pages[i];

        // store original inline styles to restore later
        const origWidth = pageEl.style.width;
        const origBoxSizing = pageEl.style.boxSizing;
        const origTransform = pageEl.style.transform;

        // ensure the page element visually matches an A4 panel width for capture
        pageEl.style.width = `${pdfWpx}px`;
        pageEl.style.boxSizing = "border-box";
        pageEl.style.transform = "none";

        // ensure browser has reflowed with the new width
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => requestAnimationFrame(r));

        // capture the page element individually — prevents splitting cards
        // when using html2canvas on the whole container.
        const canvas = await html2canvas(pageEl, {
          useCORS: true,
          scale: baseScale,
          width: Math.ceil(pageEl.scrollWidth),
          height: Math.ceil(pageEl.scrollHeight),
          windowWidth: Math.max(document.documentElement.clientWidth, pageEl.scrollWidth),
          windowHeight: Math.max(document.documentElement.clientHeight, pageEl.scrollHeight),
          scrollX: 0,
          scrollY: -window.scrollY,
        });

        // restore original styles
        pageEl.style.width = origWidth;
        pageEl.style.boxSizing = origBoxSizing;
        pageEl.style.transform = origTransform;

        const imgData = canvas.toDataURL("image/jpeg", 0.95);

        // compute image size in PDF points while preserving aspect ratio
        let imgWpt = pdfWpt;
        let imgHpt = (canvas.height * imgWpt) / canvas.width;

        // if the rendered image height is larger than page height, scale it to fit
        if (imgHpt > pdfHpt) {
          const factor = pdfHpt / imgHpt;
          imgHpt = imgHpt * factor;
          imgWpt = imgWpt * factor;
        }

        if (!first) {
          pdf.addPage();
        }
        // top-align the image
        pdf.addImage(imgData, "JPEG", 0, 0, imgWpt, imgHpt);
        first = false;
      }

      const fileName = `export_${mode === "month" ? `${MONTHS_FULL[selMonth]}_${selYear}` : selYear}_${Date.now()}.pdf`;
      // make sure modal shows final message before saving
      if (isMountedRef.current) {
        setProgressMessage("Saving PDF...");
        setProgress(100);
        setProgressReady(true);
      }
      // slight delay for UX before invoking save
      await new Promise((r) => setTimeout(r, 200));
      pdf.save(fileName);
    } catch (err) {
      console.error("exportPdf error", err);
      alert("Export failed — see console.");
    } finally {
      setLoading(false);
      // keep modal visible so user sees 100% done; user can close it
    }
  }

  // Handler for the Export button
  // If data is not loaded -> show modal that prompts user to Load Data (button in modal triggers loadAllData with autoExport)
  // If data is loaded -> start progress animation and then call exportPdf when it reaches 100%
  async function handleExportClick() {
    if (!loadedOnce) {
      // show modal with Load Data option
      setShowProgressModal(true);
      setProgress(0);
      setProgressMessage("Please load data before exporting.");
      setProgressReady(false);
      return;
    }

    // If already loaded, run a progress sequence and then export when ready
    setShowProgressModal(true);
    setProgress(0);
    setProgressMessage("Preparing export...");
    setProgressReady(false);

    // start progress animation (shorter range to feel snappy for exports)
    const animPromise = startProgressLoop({ minDuration: 2000, maxExtra: 3000 });

    // wait for the progress animation to finish
    try {
      if (progressAnimationControllerRef.current && progressAnimationControllerRef.current.promise) {
        await progressAnimationControllerRef.current.promise;
      } else {
        await animPromise;
      }
    } catch (e) {
      // ignore
    }

    // finalize progress to 100 and trigger export
    if (isMountedRef.current) {
      setProgress(100);
      setProgressMessage("Ready — exporting now...");
      setProgressReady(true);
      // slight UX delay so 100% is noticeable
      await new Promise((r) => setTimeout(r, 300));
      exportPdf();
    }
  }

  const pageWrapperStyle = {
    width: "210mm",
    minHeight: "297mm",
    padding: "16mm",
    boxSizing: "border-box",
    background: "#fff",
    margin: "0 auto",
    color: "#0f172a",
    overflow: "visible",
    // reduce font-size to make export more compact so pages fit better:
    fontSize: 12,
    lineHeight: 1.25,
  };

  // Improved export CSS:
  const exportCss = `
    .export-print * { box-sizing: border-box; }
    .export-print img, .export-print svg { max-width: 100%; height: auto; }
    .export-print table { table-layout: fixed; word-wrap: break-word; }

    /* hide native selects/inputs & buttons from print wrapper so export is clean */
    .export-print select, .export-print input[type="number"], .export-print input[type="text"], .export-print input[type="date"], .export-print .hide-on-print {
      display: none !important;
    }
    .export-print button { display: none !important; }

    /* hide possible profile / username UI elements that appear in dashboard/topbar */
    .export-print .user-name, .export-print .userName, .export-print .profile-name, .export-print .user-account, .export-print .topbar .profile, .export-print .profileDisplay {
      display: none !important;
    }

    /* prevent elements splitting across pages as much as possible */
    .export-page, .export-page * {
      -webkit-column-break-inside: avoid;
      -moz-column-break-inside: avoid;
      column-break-inside: avoid;
      page-break-inside: avoid;
      break-inside: avoid;
    }

    /* keep content constrained to the A4 panel during export */
    .export-page * {
      max-width: 100% !important;
      box-sizing: border-box !important;
      overflow-wrap: break-word !important;
      word-break: break-word !important;
    }

    /* neutralize positions and transforms which cause overflow outside the export panel */
    .export-print * {
      position: static !important;
      left: auto !important;
      right: auto !important;
      top: auto !important;
      bottom: auto !important;
      transform: none !important;
    }

    /* ensure each page starts on its own printed page */
    .export-page { page-break-after: always; break-after: page; -webkit-print-color-adjust: exact; background: #fff; }

    /* slightly tighten some headings and content specifically for export */
    .export-page h1, .export-page h2, .export-page h3, .export-page h4 {
      margin-top: 0.2em;
      margin-bottom: 0.2em;
      font-weight: 700;
    }

    /* target common networth/card patterns to keep them compact in export (won't affect runtime UI) */
    .export-page .net-worth, .export-page .networth, .export-page .card, .export-page .panel {
      font-size: 13px !important;
    }
  `;

  return (
    <div style={{ padding: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div>
          <h2 style={{ margin: 0 }}>Export — Exact Pages (PDF)</h2>
          <div style={{ opacity: 0.75 }}>Each page will be rendered one-by-one in A4 format. Use "Load Data" then "Export PDF".</div>
        </div>

        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select value={mode} onChange={e => setMode(e.target.value)} style={{ padding: 8, borderRadius: 8 }}>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>

          {mode === "month" ? (
            <>
              <select value={selMonth} onChange={e => setSelMonth(Number(e.target.value))} style={{ padding: 8, borderRadius: 8 }}>
                {MONTHS_FULL.map((m,i) => <option key={i} value={i}>{m}</option>)}
              </select>
              <input type="number" value={selYear} onChange={e => setSelYear(Number(e.target.value))} style={{ width: 100, padding: 8, borderRadius: 8 }} />
            </>
          ) : (
            <input type="number" value={selYear} onChange={e => setSelYear(Number(e.target.value))} style={{ width: 120, padding: 8, borderRadius: 8 }} />
          )}

          <button onClick={() => loadAllData({ autoExport: false })} style={{ background: "#0f9960", color: "#fff", padding: "8px 12px", borderRadius: 8 }}>
            {loading ? "Loading..." : "Load Data"}
          </button>

          <button onClick={handleExportClick} style={{ background: "#0b63ff", color: "#fff", padding: "8px 12px", borderRadius: 8 }}>
            Export PDF
          </button>
        </div>
      </div>

      {/* Progress / modal popup (new) */}
      {showProgressModal && (
        <div
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
            background: progressReady ? "rgba(4,6,11,0.15)" : "rgba(4,6,11,0.45)", // more transparent when ready so background data is more visible
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div style={{ width: 520, maxWidth: "95%", background: "#fff", borderRadius: 12, padding: 18, boxShadow: "0 10px 30px rgba(2,6,23,0.3)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800 }}>Loading export data</div>
                <div style={{ fontSize: 13, opacity: 0.8 }}>{progressMessage || (progress < 100 ? "Please wait..." : "Ready")}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 700 }}>{progress}%</div>
                <div style={{ fontSize: 12, opacity: 0.8 }}>{progressReady ? "Success" : (loading ? "In progress" : "Idle")}</div>
              </div>
            </div>

            <div style={{ height: 14, background: "#eee", borderRadius: 999, overflow: "hidden", marginBottom: 12 }}>
              <div
                aria-valuenow={progress}
                style={{
                  width: `${Math.max(0, Math.min(100, progress))}%`,
                  height: "100%",
                  transition: "width 300ms linear",
                  background: progress === 100 ? "#16a34a" : "#0b63ff",
                }}
              />
            </div>

            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", alignItems: "center" }}>
              {/* Allow closing modal at any time (but keep export available only when ready) */}
              <button
                onClick={() => {
                  setShowProgressModal(false);
                }}
                style={{ padding: "8px 10px", borderRadius: 8, background: "#f3f4f6", border: "none" }}
              >
                Close
              </button>

              {/* If data isn't loaded yet, show Load Data button in modal */}
              {!loadedOnce ? (
                <button
                  onClick={() => {
                    // start load and auto-export after load completes
                    loadAllData({ autoExport: true });
                  }}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: "#0b63ff",
                    color: "#fff",
                    border: "none",
                    cursor: "pointer",
                  }}
                >
                  Load Data & Export
                </button>
              ) : (
                <button
                  onClick={() => {
                    // If progress is ready, allow manual export; otherwise kick off export sequence
                    if (progressReady) {
                      exportPdf();
                      return;
                    }
                    // start export sequence
                    // Note: this duplicates handleExportClick behavior if user pressed Export already,
                    // but kept for manual control inside modal.
                    (async () => {
                      setProgress(0);
                      setProgressMessage("Preparing export...");
                      setProgressReady(false);
                      try {
                        await startProgressLoop({ minDuration: 2000, maxExtra: 3000 });
                      } catch (e) {
                        // ignore
                      }
                      if (isMountedRef.current) {
                        setProgress(100);
                        setProgressMessage("Ready — exporting now...");
                        setProgressReady(true);
                        await new Promise((r) => setTimeout(r, 300));
                        exportPdf();
                      }
                    })();
                  }}
                  disabled={!progressReady && loading}
                  style={{
                    padding: "8px 12px",
                    borderRadius: 8,
                    background: progressReady ? "#0b63ff" : "#94a3b8",
                    color: "#fff",
                    border: "none",
                    cursor: progressReady ? "pointer" : "not-allowed",
                  }}
                >
                  {progressReady ? "Export PDF" : "Preparing..."}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <div
        ref={exportRef}
        className="export-print"
        style={{ background: "#f8fafc", padding: "8px" }}
      >
        <style>{exportCss}</style>

        {/* Header card (small) */}
        <div style={{ padding: 14, background: "#0b63ff", color: "#fff", borderRadius: 8, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 900, fontSize: 18 }}>Smart Budget Tracker — Export</div>
              <div style={{ opacity: 0.9 }}>{mode === "month" ? `${MONTHS_FULL[selMonth]} ${selYear}` : selYear}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              {/* we hide profile name for export; still render mobile in case needed */}
              <div style={{ fontWeight: 800 }} className="profileDisplay">{profile?.mobile || ""}</div>
            </div>
          </div>
        </div>

        {/* ===== Render pages sequentially: each wrapped in a white A4-style panel ===== */}
        <div className="export-page" style={pageWrapperStyle}>
          <Dashboard forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        <div className="export-page" style={pageWrapperStyle}>
          <BudgetsOverview forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        <div className="export-page" style={pageWrapperStyle}>
          <Transactions forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        <div className="export-page" style={pageWrapperStyle}>
          <Reports forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        <div className="export-page" style={pageWrapperStyle}>
          <Analytics forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        <div className="export-page" style={pageWrapperStyle}>
          <Categories forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        <div className="export-page" style={pageWrapperStyle}>
          <Trends forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        <div className="export-page" style={pageWrapperStyle}>
          <Recurring forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        {/* ===== NET WORTH: render as multiple pages (one per top-level NetWorth card) when available ===== */}
        {/* Hidden host: render NetWorth off-screen so we can read its DOM and split into cards */}
        <div
          ref={networthHostRef}
          style={{ position: "absolute", left: -20000, top: 0, width: "210mm", visibility: "hidden", pointerEvents: "none" }}
        >
          <NetWorth forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        {/* If we have extracted card HTMLs, render each as its own export page.
            Otherwise fall back to rendering NetWorth as a single page (visible). */}
        {networthCardHtml.length > 0 ? (
          networthCardHtml.map((html, idx) => (
            <div key={`networth-card-${idx}`} className="export-page" style={pageWrapperStyle} dangerouslySetInnerHTML={{ __html: html }} />
          ))
        ) : (
          <div className="export-page" style={pageWrapperStyle}>
            <NetWorth forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
          </div>
        )}

        <div className="export-page" style={pageWrapperStyle}>
          <Savings forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        <div className="export-page" style={pageWrapperStyle}>
          <ScheduledBills forcedMonth={selMonth} forcedYear={selYear} printMode={true} />
        </div>

        {/* Final budgets page - NOTE: hide this entire "notes" area in export by adding hide-on-print class */}
        <div className="export-page" style={pageWrapperStyle}>
          <div style={{ fontWeight: 900, fontSize: 18, marginBottom: 8 }}>Monthly Budgets & History</div>
          {selectedMonthlyBudgets.map(({ monthKey, data }) => {
            const [y, mStr] = monthKey.split("-");
            const label = `${MONTHS_FULL[Number(mStr) - 1]} ${y}`;
            const budget = Number(data?.amount || 0);
            const spends = data?.spends ? Object.values(data.spends) : [];
            const spent = spends.reduce((s, sp) => s + Number(sp.amount || 0), 0);
            const remaining = Math.max(budget - spent, 0);
            const percent = budget ? Math.round((spent / budget) * 100) : 0;

            return (
              <div key={monthKey} style={{ padding: 12, background: "#fff", borderRadius: 12, marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div style={{ fontWeight: 900 }}>{label}</div>
                  <div style={{ fontWeight: 800 }}>{percent}% used</div>
                </div>

                <div style={{ display: "flex", gap: 12, marginTop: 8 }}>
                  <div><b>Budget:</b> {moneyINR(budget)}</div>
                  <div><b>Spent:</b> {moneyINR(spent)}</div>
                  <div><b>Remaining:</b> {moneyINR(remaining)}</div>
                </div>

                <div style={{ marginTop: 8, height: 12, background: "#eee", borderRadius: 999 }}>
                  <div style={{ width: `${percent}%`, height: "100%", background: "#16a34a" }} />
                </div>

                <div style={{ marginTop: 8 }}>
                  {spends.length === 0 ? <div style={{ opacity: 0.7 }}>No spends</div> : spends.map((s, i) => (
                    <div key={s.id || i} style={{ borderBottom: "1px dashed #eee", padding: "6px 0" }}>
                      <div style={{ fontWeight: 700 }}>{s.name || s.category}</div>
                      <div style={{ fontSize: 12 }}>{moneyINR(s.amount)} • {s.note || "-"}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}

          {/* This notes block is hidden during export (class hide-on-print). In case you want it visible in export, remove the class. */}
          <div className="hide-on-print" style={{ marginTop: 12, fontSize: 12, opacity: 0.85 }}>
            <div><strong>Notes:</strong></div>
            <ul>
              <li>This export reads the same DB paths your app uses: <code>users/{'{uid}'}/expenses</code>, <code>users/{'{uid}'}/categories</code>, <code>users/{'{uid}'}/monthlyBudgets/{'{year-month}'}</code>, <code>users/{'{uid}'}/assets</code>, <code>users/{'{uid}'}/liabilities</code>.</li>
              <li>To get perfect pixel parity, ensure every page uses <code>forcedMonth</code>, <code>forcedYear</code>, and <code>printMode</code> (or <code>useForcedPeriod</code>) to hide interactive controls during export.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
