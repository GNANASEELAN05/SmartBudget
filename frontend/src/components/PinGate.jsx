import React, { useEffect, useState } from "react";
import { getDatabase, ref, get } from "firebase/database";
import { signOut, onAuthStateChanged } from "firebase/auth";
import { ShieldCheck } from "lucide-react";
import { auth } from "../firebase"; // adjust if needed

/**
 * AppPinGate
 *
 * Props:
 * - children
 * - user (optional)
 * - maxAttempts (default 5)
 *
 * Behavior:
 * - Simple numeric PIN gate. The "Forgot PIN" flow has been removed entirely.
 * - DOES NOT mutate pinHash or change passwords.
 */
export function AppPinGate({
  children,
  user: userFromProp = null,
  maxAttempts = 5,
}) {
  const [user, setUser] = useState(userFromProp);
  const [checking, setChecking] = useState(true);
  const [requiresPin, setRequiresPin] = useState(false);
  const [pinInput, setPinInput] = useState("");
  const [attemptsLeft, setAttemptsLeft] = useState(maxAttempts);
  const [locked, setLocked] = useState(true);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");

  // premium styles (kept from earlier)
  useEffect(() => {
    const css = `
      .apg-root { position: fixed; inset: 0; display: grid; place-items: center; z-index: 9999; background: linear-gradient(180deg, rgba(4,6,20,0.45), rgba(4,6,20,0.45)); font-family: Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial; }
      .apg-card { width: 460px; max-width: 94%; background: linear-gradient(180deg,#ffffff,#fbfdff); border-radius: 14px; padding: 22px; box-shadow: 0 30px 70px rgba(2,6,23,0.6); box-sizing: border-box; border: 1px solid rgba(15,23,42,0.06); }
      .apg-head { display:flex; gap:14px; align-items:center; margin-bottom:12px; }
      .apg-icon { width:54px; height:54px; border-radius:12px; display:grid; place-items:center; background: linear-gradient(135deg, rgba(79,70,229,0.12), rgba(79,70,229,0.04)); }
      .apg-title { font-size:18px; font-weight:800; color:#0b1220; line-height:1; }
      .apg-sub { color:#475569; font-size:13px; margin-top:4px; }
      .apg-input { width:100%; padding:12px 14px; font-size:16px; border-radius:10px; border:1px solid rgba(15,23,42,0.08); box-sizing:border-box; outline:none; margin-bottom:8px; }
      .apg-row { display:flex; justify-content:space-between; align-items:center; gap:12px; }
      .apg-btn { padding:10px 14px; border-radius:10px; border:none; cursor:pointer; font-weight:700; display:inline-flex; gap:8px; align-items:center; }
      .apg-btn-primary { background: linear-gradient(180deg,#4f46e5,#4338ca); color:#fff; box-shadow: 0 8px 24px rgba(79,70,229,0.18); }
      .apg-btn-ghost { background: transparent; border:1px solid rgba(15,23,42,0.06); color:#0b1220; }
      .apg-muted { color:#6b7280; font-size:13px; }
      .apg-status { margin-top:10px; padding:10px 12px; border-radius:10px; font-weight:600; }
      .apg-status.info { background: rgba(99,102,241,0.06); color: #1e293b; border:1px solid rgba(99,102,241,0.08); }
      .apg-status.error { background: rgba(239,68,68,0.06); color:#7f1d1d; border:1px solid rgba(239,68,68,0.08); }
      .apg-attempts { color:#64748b; font-size:13px; }
      .apg-spinner { width:16px; height:16px; border-radius:50%; border:2px solid rgba(255,255,255,0.25); border-top-color: rgba(255,255,255,0.9); animation: apg-spin 0.9s linear infinite; }
      @keyframes apg-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @media (max-width:520px) { .apg-card { padding:16px; } .apg-icon { width:48px; height:48px; } }
    `;
    const tag = document.createElement("style");
    tag.setAttribute("data-apg-style", "true");
    tag.innerHTML = css;
    document.head.appendChild(tag);
    return () => { document.head.removeChild(tag); };
  }, []);

  async function hashPinHex(pin) {
    const enc = new TextEncoder();
    const data = enc.encode(pin);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // auth listener
  useEffect(() => {
    if (userFromProp) {
      setUser(userFromProp);
      return;
    }
    let unsub;
    try {
      unsub = onAuthStateChanged(auth, (u) => setUser(u));
    } catch (e) {
      console.warn("AppPinGate: onAuthStateChanged unavailable", e);
    }
    return () => { if (typeof unsub === "function") unsub(); };
  }, [userFromProp]);

  // check DB for pinHash presence
  useEffect(() => {
    let cancelled = false;
    async function checkPin() {
      setChecking(true);
      setRequiresPin(false);
      setLocked(true);
      setError("");
      setPinInput("");
      setAttemptsLeft(maxAttempts);
      setStatusMessage("");

      if (!user) { setChecking(false); setLocked(true); return; }

      try {
        const db = getDatabase();
        const snap = await get(ref(db, `users/${user.uid}/security/pinHash`));
        const stored = snap.exists() ? snap.val() : null;
        if (!cancelled) {
          if (stored) {
            setRequiresPin(true);
            setLocked(true);
          } else {
            setRequiresPin(false);
            setLocked(false);
          }
        }
      } catch (err) {
        console.error("AppPinGate: failed reading pin state", err);
        if (!cancelled) {
          setRequiresPin(false);
          setLocked(false);
          setStatusMessage("Unable to read PIN state — proceeding without PIN (read error).");
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    }
    checkPin();
    return () => { cancelled = true; };
  }, [user, maxAttempts]);

  async function verifyPin() {
    setError("");
    setStatusMessage("");
    if (!user) return;

    // validation: 4..8 digits only
    if (!/^\d{4,8}$/.test(pinInput)) {
      setError("PIN must be 4–8 digits.");
      setPinInput("");
      return;
    }

    setChecking(true);
    try {
      const db = getDatabase();
      const snap = await get(ref(db, `users/${user.uid}/security/pinHash`));
      const stored = snap.exists() ? snap.val() : null;
      if (!stored) {
        setRequiresPin(false);
        setLocked(false);
        setPinInput("");
        setChecking(false);
        setStatusMessage("PIN removed while prompted — continuing.");
        return;
      }
      const hashed = await hashPinHex(pinInput);
      if (hashed === stored) {
        setLocked(false);
        setRequiresPin(false);
        setPinInput("");
        setAttemptsLeft(maxAttempts);
        setError("");
        setStatusMessage("");
      } else {
        const left = attemptsLeft - 1;
        setAttemptsLeft(left);
        setError(left <= 0 ? "Too many incorrect attempts — signing out." : `Incorrect PIN. ${left} attempts left.`);
        setPinInput("");
        if (left <= 0) {
          try {
            await signOut(auth);
          } catch (e) {
            console.error("AppPinGate signOut failed", e);
            setStatusMessage("Failed to sign out automatically. Please refresh.");
          }
        }
      }
    } catch (err) {
      console.error("AppPinGate verify error", err);
      setError("Verification failed.");
    } finally {
      setChecking(false);
    }
  }

  function onKey(e) { if (e.key === "Enter") verifyPin(); }

  if (checking && locked) {
    return <div style={{ minHeight: "100vh", display: "grid", placeItems: "center", color: "#94a3b8" }}>Checking security…</div>;
  }

  if (!requiresPin && !locked) return <>{children}</>;

  return (
    <div className="apg-root" role="dialog" aria-modal="true" aria-label="App PIN Gate">
      <div className="apg-card" role="document">
        <div className="apg-head">
          <div className="apg-icon" aria-hidden><ShieldCheck size={22} /></div>
          <div style={{ flex: 1 }}>
            <div className="apg-title">Enter App PIN</div>
            <div className="apg-sub">This device requires your numeric PIN to continue.</div>
          </div>
        </div>

        <div>
          <input
            className="apg-input"
            type="password"
            inputMode="numeric"
            value={pinInput}
            onChange={(e) => {
              const v = e.target.value;
              // numeric-only mode, accept digits only, max 8
              setPinInput(v.replace(/\D/g, "").slice(0, 8));
            }}
            onKeyDown={onKey}
            placeholder={"Enter 4–8 digit PIN"}
            aria-label="App PIN"
            autoFocus
          />

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
            <div className="apg-attempts">{attemptsLeft} attempts left</div>

            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="apg-btn apg-btn-primary"
                onClick={verifyPin}
                aria-label="Unlock"
                disabled={checking}
              >
                {checking ? <span className="apg-spinner" /> : "Unlock"}
              </button>
            </div>
          </div>

          {error && <div className="apg-status error" role="alert" style={{ marginTop: 12 }}>{error}</div>}
          {statusMessage && <div className="apg-status info" role="status" style={{ marginTop: 12 }}>{statusMessage}</div>}
        </div>
      </div>
    </div>
  );
}

export default AppPinGate;
