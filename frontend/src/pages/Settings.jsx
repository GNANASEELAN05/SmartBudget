import React, { useEffect, useMemo, useState } from "react";
import { ChevronRight, Download, Upload, ShieldCheck, User, Moon, Sun, FileText, Copy } from "lucide-react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, set, get, remove } from "firebase/database";

/**
 * SettingsPremium_withPinGate.jsx
 * - Removed all "Forgot PIN" flows (no server temporary PIN requests).
 * - Adds a prominent reminder "top page" shown when user opens the Set PIN flow.
 * - Updated button colors and styles for a more colorful premium look.
 *
 * Updates in this file (non-behavioral additions):
 * - Adds a subtle "pin card line" inside the Security card showing last-updated time
 *   and a quick-copy action. This is purely UI + lightweight metadata (pinUpdatedAt)
 *   stored alongside the pinHash for clarity; core flows remain unchanged.
 */

const DARK = {
  pageBg: "linear-gradient(135deg,#eef2ff,#f3f7fb)",
  heading: "#0b1220",
  muted: "#374151",
  primary: "#4f46e5",
  success: "#16a34a",
  danger: "#dc2626",
  cardBorder: "rgba(15,23,42,0.06)",
  mainCardBg: "#e6eefc",
};

const DEFAULTS = {
  dateFormat: "DD/MM/YYYY",
  language: "en",
  theme: "dark",
};

async function hashPinHex(pin) {
  const enc = new TextEncoder();
  const data = enc.encode(pin);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default function SettingsPremium() {
  const [dateFormat, setDateFormat] = useState(DEFAULTS.dateFormat);
  const [language, setLanguage] = useState(DEFAULTS.language);
  const [theme, setTheme] = useState(DEFAULTS.theme);
  const [importing, setImporting] = useState(false);

  // security / pin
  const [pinEnabled, setPinEnabled] = useState(false);
  const [checkingPinState, setCheckingPinState] = useState(true);
  const [userUid, setUserUid] = useState(null);

  // small metadata: when the PIN was last changed/created (ISO string)
  const [pinUpdatedAt, setPinUpdatedAt] = useState(null);

  const [showSetPin, setShowSetPin] = useState(false);
  const [mode, setMode] = useState("set"); // "set" | "change" | "remove"
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  // reminder shown when user opens the Set PIN flow
  const [showReminder, setShowReminder] = useState(false);

  // inline status
  const [statusMessage, setStatusMessage] = useState("");
  const [statusType, setStatusType] = useState("info"); // info | success | error

  // inject CSS (keeps your premium styles)
  useEffect(() => {
    const css = `
      :root {
        --radius:12px;
        --muted:${DARK.muted};
        --card-shadow: 0 10px 30px rgba(16,24,40,0.06);
        --accent:${DARK.primary};
        --bg: ${DARK.pageBg};
        --surface:#ffffff;
        --card-contrast: rgba(15,23,42,0.04);
        --card-padding:18px;
      }

      .sb-container { padding:28px; font-family: Inter, system-ui, -apple-system, 'Segoe UI', Roboto, Arial; min-height: 80vh; background: var(--bg); }
      .sb-wrap { max-width:1100px; margin:0 auto; display: grid; grid-template-columns: 1fr; gap:18px; }
      .sb-title { font-size:22px; font-weight:800; margin-bottom:4px; color: ${DARK.heading}; }
      .sb-sub { color:var(--muted); font-size:13px; margin-bottom:12px; }

      .card { border-radius: var(--radius); padding: var(--card-padding); box-shadow: var(--card-shadow); border:1px solid var(--card-contrast); background: var(--surface); color: ${DARK.heading}; }
      .card .row { display:flex; align-items:center; gap:12px; justify-content:space-between; }
      .card h3 { margin:0; font-size:15px; font-weight:700; }
      .card p { margin:0; color:var(--muted); font-size:13px; }

      .icon-box { width:44px; height:44px; min-width:44px; display:flex; align-items:center; justify-content:center; border-radius:10px; background: rgba(11,71,150,0.06); }
      .icon-box svg { display:block; }

      .card--teal { border-left: 4px solid rgba(79,70,229,0.10); background: linear-gradient(180deg, rgba(79,70,229,0.03), #fff); }
      .card--indigo { border-left: 4px solid rgba(88,102,241,0.10); }
      .card--amber { border-left: 4px solid rgba(235,146,0,0.10); }

      .controls { margin-top:12px; display:flex; gap:8px; align-items:center; }

      .select, .input, .btn { font-family:inherit; box-sizing: border-box; }
      .select { padding:8px 10px; border-radius:10px; border:1px solid rgba(15,23,42,0.06); background: white; min-width:160px; color: ${DARK.heading}; }
      .input { padding:10px; border-radius:8px; border:1px solid rgba(15,23,42,0.06); min-width:160px; color: ${DARK.heading}; background: #fff; }

      /* Updated button colors */
      .btn { padding:10px 12px; border-radius:10px; border:none; cursor:pointer; font-weight:700; background: linear-gradient(180deg, ${DARK.primary} 0%, #3730a3 100%); color:#fff; display:inline-flex; gap:8px; align-items:center; box-shadow: 0 8px 20px rgba(79,70,229,0.14); }
      .btn[disabled], .btn:disabled { opacity: 0.6; cursor: not-allowed; }

      .btn-ghost { padding:10px 12px; border-radius:10px; border:1px solid rgba(15,23,42,0.06); background: linear-gradient(180deg,#ffffff,#fbfdff); color: ${DARK.heading}; cursor:pointer; font-weight:700; display:inline-flex; gap:8px; align-items:center; }
      .btn-ghost:hover { transform: translateY(-1px); box-shadow: 0 8px 30px rgba(2,6,23,0.06); }

      .btn-success { background: linear-gradient(180deg,#10b981,#059669); color: #fff; box-shadow: 0 8px 20px rgba(16,185,129,0.12); }
      .btn-danger { background: linear-gradient(180deg,#ef4444,#b91c1c); color: #fff; box-shadow: 0 8px 20px rgba(239,68,68,0.12); }

      .btn .btn-icon { display:inline-flex; align-items:center; justify-content:center; }

      .sb-modal-overlay { position:fixed; inset:0; background: rgba(10,12,14,0.36); display:flex; align-items:center; justify-content:center; z-index:9999; padding: 16px; }
      .sb-modal { background: #fff; padding:18px; border-radius:12px; width:420px; box-shadow: 0 18px 60px rgba(10,12,20,0.12); color: ${DARK.heading}; }
      .sb-modal h4 { margin:0 0 8px 0; font-size:16px; }
      .muted { color:var(--muted); font-size:13px; }

      .status { margin-bottom:12px; padding:10px 12px; border-radius:10px; font-weight:600; }
      .status.info { background: rgba(99,102,241,0.06); color:#0f172a; border:1px solid rgba(99,102,241,0.07); }
      .status.success { background: rgba(16,185,129,0.06); color:#064e3b; border:1px solid rgba(16,185,129,0.07); }
      .status.error { background: rgba(239,68,68,0.06); color:#7f1d1d; border:1px solid rgba(239,68,68,0.08); }

      /* Top reminder "small page" when user opens Set PIN */
      .pin-reminder { position: fixed; top: 16px; left: 50%; transform: translateX(-50%); z-index: 10000; width: min(760px, calc(100% - 32px)); border-radius: 12px; padding: 12px 14px; display:flex; align-items:center; gap:12px; justify-content:space-between; background: linear-gradient(90deg,#fff7ed,#fffbeb); border:1px solid rgba(245,158,11,0.14); box-shadow: 0 12px 40px rgba(245,158,11,0.08); }
      .pin-reminder .text { color: #92400e; font-weight:600; font-size:14px; }
      .pin-reminder .sub { color: #92400e; opacity:0.9; font-weight:500; font-size:13px; }

      /* PIN card line */
      .pin-line { margin-top:12px; padding-top:12px; border-top:1px dashed var(--card-contrast); display:flex; align-items:center; justify-content:space-between; gap:12px; }
      .pin-line .left { display:flex; align-items:center; gap:10px; }
      .pin-line .time { color:var(--muted); font-size:13px; }

      @media (max-width:640px) { .sb-modal { width: 92%; } .pin-reminder { left: 50%; transform: translateX(-50%); } }
    `;
    const tag = document.createElement("style");
    tag.setAttribute("data-sb-settings", "true");
    tag.innerHTML = css;
    document.head.appendChild(tag);
    return () => { document.head.removeChild(tag); };
  }, []);

  // watch auth and read whether pin exists for current user (and last-updated metadata)
  useEffect(() => {
    const auth = getAuth();
    const db = getDatabase();
    let cancelled = false;
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        setUserUid(null);
        setPinEnabled(false);
        setPinUpdatedAt(null);
        setCheckingPinState(false);
        return;
      }
      setUserUid(u.uid);
      try {
        const snap = await get(ref(db, `users/${u.uid}/security`));
        if (!cancelled) {
          if (snap.exists()) {
            const obj = snap.val();
            setPinEnabled(Boolean(obj.pinHash));
            setPinUpdatedAt(obj.pinUpdatedAt || null);
          } else {
            setPinEnabled(false);
            setPinUpdatedAt(null);
          }
        }
      } catch (err) {
        console.warn("read pin state failed", err);
        setPinEnabled(false);
        setPinUpdatedAt(null);
      } finally {
        if (!cancelled) setCheckingPinState(false);
      }
    });
    return () => { cancelled = true; unsub(); };
  }, []);

  function isValidPinCandidate(pin) { return /^\d{4,8}$/.test(pin); }

  // Save new PIN (Set flow)
  async function saveNewPinFlow() {
    setStatusMessage(""); setStatusType("info");
    if (!userUid) { setStatusMessage("Not signed in."); setStatusType("error"); return; }
    if (!isValidPinCandidate(newPin)) { setStatusMessage("PIN must be 4-8 digits."); setStatusType("error"); return; }
    if (newPin !== confirmPin) { setStatusMessage("PIN and confirmation do not match."); setStatusType("error"); return; }
    setBusy(true);
    try {
      const db = getDatabase();
      const pinHash = await hashPinHex(newPin);
      await set(ref(db, `users/${userUid}/security/pinHash`), pinHash);
      // store a lightweight last-updated timestamp for the UI
      await set(ref(db, `users/${userUid}/security/pinUpdatedAt`), new Date().toISOString());
      setPinEnabled(true);
      setShowSetPin(false);
      setShowReminder(false);
      setNewPin(""); setConfirmPin("");
      setStatusMessage("PIN saved (app-level). Remember your PIN — we cannot recover it for you.");
      setStatusType("success");
      setPinUpdatedAt(new Date().toISOString());
    } catch (err) {
      console.error(err);
      setStatusMessage("Failed to save PIN. Check network and Firebase rules.");
      setStatusType("error");
    } finally { setBusy(false); }
  }

  // Change PIN (requires current PIN)
  async function changePinFlow() {
    setStatusMessage(""); setStatusType("info");
    if (!userUid) { setStatusMessage("Not signed in."); setStatusType("error"); return; }
    if (!isValidPinCandidate(newPin)) { setStatusMessage("New PIN must be 4-8 digits."); setStatusType("error"); return; }
    if (newPin !== confirmPin) { setStatusMessage("New PIN and confirmation do not match."); setStatusType("error"); return; }
    setBusy(true);
    try {
      const db = getDatabase();
      const snap = await get(ref(db, `users/${userUid}/security/pinHash`));
      const stored = snap.exists() ? snap.val() : null;
      const attempted = await hashPinHex(currentPin);
      if (!stored || attempted !== stored) { setStatusMessage("Current PIN incorrect."); setStatusType("error"); setBusy(false); return; }
      const newHash = await hashPinHex(newPin);
      await set(ref(db, `users/${userUid}/security/pinHash`), newHash);
      await set(ref(db, `users/${userUid}/security/pinUpdatedAt`), new Date().toISOString());
      setShowSetPin(false); setCurrentPin(""); setNewPin(""); setConfirmPin("");
      setStatusMessage("PIN changed successfully.");
      setStatusType("success");
      setPinUpdatedAt(new Date().toISOString());
    } catch (err) {
      console.error(err);
      setStatusMessage("Failed to change PIN.");
      setStatusType("error");
    } finally { setBusy(false); }
  }

  // Remove PIN (requires current PIN)
  async function removePinFlow() {
    setStatusMessage(""); setStatusType("info");
    if (!userUid) { setStatusMessage("Not signed in."); setStatusType("error"); return; }
    setBusy(true);
    try {
      const db = getDatabase();
      const snap = await get(ref(db, `users/${userUid}/security/pinHash`));
      const stored = snap.exists() ? snap.val() : null;
      const attempted = await hashPinHex(currentPin);
      if (!stored || attempted !== stored) { setStatusMessage("Current PIN incorrect."); setStatusType("error"); setBusy(false); return; }
      await remove(ref(db, `users/${userUid}/security/pinHash`));
      // remove the pinUpdatedAt metadata as well (keeps node tidy)
      await set(ref(db, `users/${userUid}/security/pinUpdatedAt`), null);
      setPinEnabled(false); setShowSetPin(false); setCurrentPin("");
      setStatusMessage("PIN removed.");
      setStatusType("success");
      setPinUpdatedAt(null);
    } catch (err) {
      console.error(err);
      setStatusMessage("Failed to remove PIN.");
      setStatusType("error");
    } finally { setBusy(false); }
  }

  const payload = useMemo(() => ({ dateFormat, language, exportedAt: new Date().toISOString() }), [dateFormat, language]);

  // Exports & clipboard use inline status instead of alert
  function handleExportPDF() {
    setStatusMessage(""); setStatusType("info");
    try {
      const win = window.open("", "_blank");
      if (!win) { setStatusMessage("Failed to open a new window. Allow popups to export PDF."); setStatusType("error"); return; }
      const html = `
        <html>
          <head>
            <title>Smart Budget - Settings export</title>
            <meta name="viewport" content="width=device-width,initial-scale=1" />
            <style>
              body { font-family: Arial, Helvetica, sans-serif; padding:24px; color:#0b1220; }
              h1 { font-size:20px; margin-bottom:6px; }
              p { color:#444; }
              .k { font-weight:700; }
              .row { margin-bottom:10px; }
              .box { padding:12px; border-radius:8px; border:1px solid #e6e6e6; background:#fff; }
            </style>
          </head>
          <body>
            <h1>Smart Budget — Settings Export</h1>
            <div class="row">Exported at: <span class="k">${new Date().toLocaleString()}</span></div>
            <div class="box">
              <div class="row"><span class="k">Date format:</span> ${dateFormat}</div>
              <div class="row"><span class="k">Language:</span> ${language}</div>
              <div class="row"><span class="k">PIN enabled:</span> ${pinEnabled ? 'Yes' : 'No'}</div>
            </div>
            <p style="margin-top:18px; color:#666; font-size:12px">Note: For security reasons the PIN value is not included in exports.</p>
          </body>
        </html>
      `;
      win.document.open(); win.document.write(html); win.document.close();
      setTimeout(() => {
        try { win.focus(); win.print(); setStatusMessage("Export opened — use Print dialog to save as PDF."); setStatusType("success"); } catch (e) { console.warn(e); setStatusMessage("Export opened but printing failed."); setStatusType("error"); }
      }, 350);
    } catch (err) { console.error(err); setStatusMessage("Export failed."); setStatusType("error"); }
  }

  async function handleCopyToClipboard() {
    setStatusMessage(""); setStatusType("info");
    try { await navigator.clipboard.writeText(JSON.stringify(payload, null, 2)); setStatusMessage("Settings JSON copied to clipboard."); setStatusType("success"); }
    catch (err) { console.error(err); setStatusMessage("Copy failed."); setStatusType("error"); }
  }

  async function handleImport(file) {
    setStatusMessage(""); setStatusType("info");
    if (!file) return;
    setImporting(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setDateFormat(parsed.dateFormat || DEFAULTS.dateFormat);
      setLanguage(parsed.language || DEFAULTS.language);
      setStatusMessage("Settings imported successfully.");
      setStatusType("success");
    } catch (e) {
      console.error(e);
      setStatusMessage("Failed to import settings: invalid file.");
      setStatusType("error");
    } finally { setImporting(false); }
  }

  const onSetNewPinInput = (v) => setNewPin(v.replace(/\D/g, "").slice(0, 8));
  const onSetConfirmPinInput = (v) => setConfirmPin(v.replace(/\D/g, "").slice(0, 8));
  const onSetCurrentPinInput = (v) => setCurrentPin(v.replace(/\D/g, "").slice(0, 8));

  useEffect(() => { const savedTheme = window.localStorage.getItem("sb_theme"); const savedLang = window.localStorage.getItem("sb_lang"); if (savedTheme) setTheme(savedTheme); if (savedLang) setLanguage(savedLang); }, []);
  useEffect(() => { window.localStorage.setItem("sb_theme", theme); }, [theme]);
  useEffect(() => { window.localStorage.setItem("sb_lang", language); }, [language]);

  // quick-copy of the pin line metadata
  async function copyPinLine() {
    setStatusMessage(""); setStatusType("info");
    try {
      const text = `PIN enabled: ${pinEnabled ? 'Yes' : 'No'}${pinUpdatedAt ? ` — updated ${new Date(pinUpdatedAt).toLocaleString()}` : ''}`;
      await navigator.clipboard.writeText(text);
      setStatusMessage("PIN status copied."); setStatusType("success");
    } catch (e) {
      console.error(e);
      setStatusMessage("Failed to copy PIN status."); setStatusType("error");
    }
  }

  return (
    <div className="sb-container">
      {/* Top reminder shown only when opening Set PIN */}
      {showReminder && (
        <div className="pin-reminder" role="status" aria-live="polite">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div className="text">Important — remember your PIN</div>
            <div className="sub">If you forget your PIN we cannot recover it. Keep it somewhere safe.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-success" onClick={() => setShowReminder(false)}>I understand</button>
            <button className="btn-ghost" onClick={() => setShowReminder(false)}>Close</button>
          </div>
        </div>
      )}

      <div className="sb-wrap">
        <div>
          <div className="sb-title">Settings</div>
          <div className="sb-sub">Manage account & preferences</div>

          {statusMessage && <div className={`status ${statusType}`} style={{ marginBottom: 12 }}>{statusMessage}</div>}

          {/* SECURITY / PIN */}
          <div style={{ marginTop: 14 }} className="card card--teal">
            <div className="row">
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <div className="icon-box"><ShieldCheck size={18} /></div>
                <div>
                  <h3>Security — App PIN</h3>
                  <p className="muted">Require a numeric PIN after signing in to lock the app</p>
                </div>
              </div>

              <div>
                {checkingPinState ? (
                  <div className="muted">Checking…</div>
                ) : pinEnabled ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-ghost" onClick={() => { setMode("change"); setShowSetPin(true); setShowReminder(false); }} aria-label="Change PIN">Change PIN</button>
                    <button className="btn-ghost" onClick={() => { setMode("remove"); setShowSetPin(true); setShowReminder(false); }} aria-label="Remove PIN">Remove PIN</button>
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn" onClick={() => { setMode("set"); setShowSetPin(true); setShowReminder(true); }} aria-label="Set PIN"><span className="btn-icon"><ShieldCheck size={16} /></span> Set PIN</button>
                  </div>
                )}
              </div>
            </div>

            {/* PIN card line: last-updated + copy action (UI-only convenience) */}
            <div className="pin-line" aria-hidden={pinUpdatedAt ? "false" : "true"}>
              <div className="left">
                <FileText size={16} />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{pinEnabled ? 'PIN active' : 'PIN not set'}</div>
                  <div className="time">{pinUpdatedAt ? `Last updated: ${new Date(pinUpdatedAt).toLocaleString()}` : 'No PIN metadata'}</div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="btn-ghost" onClick={copyPinLine} title="Copy PIN status"><span style={{ display: 'inline-flex', alignItems: 'center' }}><Copy size={14} />&nbsp;Copy</span></button>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* PIN modal (set/change/remove) */}
      {showSetPin && (
        <div className="sb-modal-overlay" role="dialog" aria-modal="true">
          <div className="sb-modal">
            <h4>{mode === "set" ? "Set App PIN" : mode === "change" ? "Change App PIN" : "Remove App PIN"}</h4>
            <div style={{ marginTop: 8 }}>
              {mode === "set" && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }} className="muted">Enter new PIN (4-8 digits)</div>
                    <input className="input" type="password" inputMode="numeric" value={newPin} onChange={(e) => onSetNewPinInput(e.target.value)} placeholder="New PIN" aria-label="New PIN" />
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ fontSize: 13, marginBottom: 6 }} className="muted">Confirm PIN</div>
                    <input className="input" type="password" inputMode="numeric" value={confirmPin} onChange={(e) => onSetConfirmPinInput(e.target.value)} placeholder="Confirm PIN" aria-label="Confirm PIN" />
                  </div>
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="btn" onClick={saveNewPinFlow} disabled={busy}>{busy ? "Saving…" : "Save PIN"}</button>
                    <button className="btn-ghost" onClick={() => { setShowSetPin(false); setShowReminder(false); }}>Cancel</button>
                  </div>
                </>
              )}

              {mode === "change" && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>Current PIN</div>
                    <input className="input" type="password" inputMode="numeric" value={currentPin} onChange={(e) => onSetCurrentPinInput(e.target.value)} placeholder="Current PIN" aria-label="Current PIN" />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>New PIN</div>
                    <input className="input" type="password" inputMode="numeric" value={newPin} onChange={(e) => onSetNewPinInput(e.target.value)} placeholder="New PIN" aria-label="New PIN" />
                  </div>

                  <div style={{ marginBottom: 8 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>Confirm new PIN</div>
                    <input className="input" type="password" inputMode="numeric" value={confirmPin} onChange={(e) => onSetConfirmPinInput(e.target.value)} placeholder="Confirm new PIN" aria-label="Confirm new PIN" />
                  </div>

                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="btn" onClick={changePinFlow} disabled={busy}>{busy ? "Working…" : "Change PIN"}</button>
                    <button className="btn-ghost" onClick={() => setShowSetPin(false)}>Cancel</button>
                  </div>
                </>
              )}

              {mode === "remove" && (
                <>
                  <div style={{ marginBottom: 8 }}>
                    <div className="muted" style={{ marginBottom: 6 }}>Enter current PIN to remove</div>
                    <input className="input" type="password" inputMode="numeric" value={currentPin} onChange={(e) => onSetCurrentPinInput(e.target.value)} placeholder="Current PIN" aria-label="Current PIN" />
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn btn-danger" onClick={removePinFlow} disabled={busy}>{busy ? "Working…" : "Remove PIN"}</button>
                    <button className="btn-ghost" onClick={() => setShowSetPin(false)}>Cancel</button>
                  </div>
                </>
              )}
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
