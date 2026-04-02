import React, { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, onValue, off, set, remove, update, get } from "firebase/database";
import {
  Calendar,
  Clock,
  PlusCircle,
  Trash2,
  Edit2,
  CheckCircle,
  CreditCard,
  Search,
  AlertCircle
} from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // export-safe pattern

/*
  ScheduledBills.jsx - Inline-styled premium UI (fixed: disabled bills cannot be acted upon;
  bills are displayed inside a single list card). This version honors printMode/forcedPeriod props
  and hides interactive elements when printMode === true.
*/

const THEME = {
  pageGradient: "linear-gradient(135deg,#eef2ff 0%,#f3f6f9 100%)",
  panelBg: "#eef2f6",
  cardBg: "#ffffff",
  muted: "#374151",
  heading: "#07103a",
  primary: "#4338ca",
  primaryDark: "#2b235e",
  accent: "#059669",
  danger: "#dc2626",
  border: "rgba(15,23,42,0.08)",
  subtleShadow: "0 10px 34px rgba(16,24,40,0.07)",
  glass: "rgba(255,255,255,0.6)"
};

const COLOR_PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#10b981",
  "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899"
];

function moneyINR(n) {
  if (n == null) return "₹0";
  const num = Number(n) || 0;
  return "₹" + new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(num);
}
function renderIcon(IconComp, size = 18, style = {}) {
  try { return IconComp ? <IconComp size={size} style={style} /> : null; } catch (e) { return null; }
}
function isOverdue(ts) { return ts ? Number(ts) < Date.now() : false; }

function formatDDMMYYYY(ts) {
  if (!ts) return null;
  const d = new Date(Number(ts));
  if (Number.isNaN(d.getTime())) return null;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function nextDueLabel(tsOrStr) {
  if (!tsOrStr) return "—";
  if (typeof tsOrStr === 'string' && tsOrStr.includes('/')) return tsOrStr;
  return formatDDMMYYYY(tsOrStr);
}
function advanceDate(ts, recurrence) {
  const d = new Date(Number(ts) || Date.now());
  switch ((recurrence || "").toLowerCase()) {
    case "weekly": d.setDate(d.getDate() + 7); break;
    case "biweekly": d.setDate(d.getDate() + 14); break;
    case "monthly": d.setMonth(d.getMonth() + 1); break;
    case "quarterly": d.setMonth(d.getMonth() + 3); break;
    case "yearly": d.setFullYear(d.getFullYear() + 1); break;
    default: return null;
  }
  return d.getTime();
}
function formatRecurrence(r) {
  if (!r) return "";
  const s = String(r);
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

// deterministic lightweight hash to pick a color from palette
function pickColorKey(key) {
  if (!key) return COLOR_PALETTE[0];
  let sum = 0;
  for (let i = 0; i < key.length; i++) sum = (sum + key.charCodeAt(i) * (i + 1)) >>> 0;
  return COLOR_PALETTE[sum % COLOR_PALETTE.length];
}

export default function ScheduledBills({ forcedMonth = null, forcedYear = null, printMode = false }) {
  const auth = (() => { try { return getAuth(); } catch (e) { return null; } })();
  const db = (() => { try { return getDatabase(); } catch (e) { return null; } })();

  // follow export-safe pattern even if page doesn't use months
  const [hookMonth, , hookYear] = useForcedPeriod(forcedMonth, forcedYear);

  const [user, setUser] = useState(null);
  const [bills, setBills] = useState([]);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);

  // UI
  const [adding, setAdding] = useState({ open: false, anchor: null });
  const [editingId, setEditingId] = useState(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [sortBy, setSortBy] = useState("nextDue");

  /* ================= CONFIRM / ALERT MODAL STATE ================= */
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

  useEffect(() => {
    if (!auth || !db) {
      setDemoMode(true);
      const demo = [
        { id: "d1", name: "Electricity", amount: 3500, nextDue: Date.now() + 3 * 86400000, recurrence: "monthly", active: true, category: "Utilities" },
        { id: "d2", name: "Netflix", amount: 499, nextDue: Date.now() - 2 * 86400000, recurrence: "monthly", active: true, category: "Subscriptions" },
        { id: "d3", name: "Car insurance", amount: 7600, nextDue: Date.now() + 40 * 86400000, recurrence: "yearly", active: true, category: "Insurance" },
        { id: "d4", name: "Gym", amount: 1200, nextDue: Date.now() + 10 * 86400000, recurrence: "monthly", active: false, category: "Health" }
      ].map((b, i) => ({
        ...b,
        amount: Number(b.amount || 0),
        color: b.color || pickColorKey((b.id || b.name || '') + String(i)),
        nextDueFormatted: b.nextDue ? formatDDMMYYYY(b.nextDue) : null
      }));

      setBills(demo);
      setLoading(false);
      return;
    }

    // keep refs outside to cleanup properly
    let billsRefLocal = null;
    let handlerLocal = null;

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);

      // clear previous listener if any
      try { if (billsRefLocal && handlerLocal) off(billsRefLocal, "value", handlerLocal); } catch (e) {}

      if (u && db) {
        billsRefLocal = ref(db, `users/${u.uid}/scheduledBills`);
        handlerLocal = (snap) => {
          const data = snap.val() || {};
          const arr = Object.entries(data).map(([id, val]) => ({ id, ...val }));
          // ensure numeric amounts, dd/mm formatted date, and unique color
          const normalized = arr.map((b, i) => ({
            ...b,
            amount: Number(b.amount || 0),
            nextDueFormatted: b.nextDueFormatted || (b.nextDue ? formatDDMMYYYY(b.nextDue) : null),
            color: b.color || pickColorKey((b.id || b.name || '') + String(i))
          }));
          setBills(normalized);
          setLoading(false);
        };

        onValue(billsRefLocal, handlerLocal, (err) => { console.error(err); setLoading(false); });
      }
    });

    return () => {
      try { if (billsRefLocal && handlerLocal) off(billsRefLocal, "value", handlerLocal); } catch (e) {}
      try { unsub(); } catch (e) {}
    };
  }, [auth, db]);

  // filtering + sorting
  const filtered = useMemo(() => {
    const q = (query || "").trim().toLowerCase();
    let arr = bills.slice();
    if (q) arr = arr.filter(b => (b.name || "").toLowerCase().includes(q) || (b.category || "").toLowerCase().includes(q));
    if (filter === "upcoming") arr = arr.filter(b => !isOverdue(b.nextDue) && b.active !== false);
    if (filter === "overdue") arr = arr.filter(b => isOverdue(b.nextDue) && b.active !== false);
    if (filter === "inactive") arr = arr.filter(b => b.active === false);

    if (sortBy === "amount") arr.sort((a, b) => b.amount - a.amount);
    else if (sortBy === "name") arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    else arr.sort((a, b) => (Number(a.nextDue || 0) - Number(b.nextDue || 0)));

    return arr;
  }, [bills, query, filter, sortBy]);

  function openAdd() { setEditingId(null); setAdding({ open: true, anchor: "header" }); }
  function closeAdd() { setAdding({ open: false, anchor: null }); setEditingId(null); }

  // ensure color is set when saving (assign deterministic color when missing)
  function ensureColorFor(finalPayload, idForHash) {
    if (finalPayload.color) return finalPayload.color;
    const key = (idForHash || '') + (finalPayload.name || '');
    return pickColorKey(key);
  }

  // helper: get latest bill from DB (if available) or from local state
  async function fetchLatestBill(id) {
    if (!id) return null;
    if (db && user) {
      try {
        const snap = await get(ref(db, `users/${user.uid}/scheduledBills/${id}`));
        if (snap && snap.exists()) {
          return { id, ...snap.val() };
        }
      } catch (e) {
        console.error("fetchLatestBill db get error:", e);
        // fall through to local
      }
    }
    // fallback to local state
    return bills.find(b => b.id === id) || null;
  }

  async function saveBill(payload, id = null) {
    // if editing existing, disallow editing when the *latest* bill is disabled
    if (id) {
      const latest = await fetchLatestBill(id);
      if (latest && latest.active === false) {
        openModal({ title: "Disabled", message: "This scheduled bill is disabled. Enable to edit.", showCancel: false, confirmText: "OK" });
        return;
      }
    }

    const final = { ...payload, amount: Number(payload.amount || 0), updatedAt: Date.now() };
    // ensure the formatted string is saved alongside the numeric timestamp
    final.nextDueFormatted = final.nextDue ? formatDDMMYYYY(final.nextDue) : null;

    const idToUse = id || String(Date.now());
    final.color = ensureColorFor(final, idToUse);

    if (!db || !user) {
      if (id) setBills(s => s.map(x => x.id === id ? { ...x, ...final } : x));
      else setBills(s => [{ id: idToUse, ...final }, ...s]);
      closeAdd();
      return;
    }
    try {
      if (id) await update(ref(db, `users/${user.uid}/scheduledBills/${id}`), final);
      else await set(ref(db, `users/${user.uid}/scheduledBills/${idToUse}`), final);
      closeAdd();
    } catch (e) { console.error("saveBill err", e); openModal({ title: "Save failed", message: "Failed to save scheduled bill. Check console.", showCancel: false, confirmText: "OK" }); }
  }

  async function deleteBill(id) {
    if (!id) return;
    // re-check latest: do not allow deletion if currently disabled
    const latest = await fetchLatestBill(id);
    if (latest && latest.active === false) {
      openModal({ title: "Disabled", message: "This scheduled bill is disabled. Enable to delete.", showCancel: false, confirmText: "OK" });
      return;
    }

    openModal({
      title: "Delete scheduled bill",
      message: "Are you sure you want to delete this scheduled bill? This action cannot be undone.",
      showCancel: true,
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          if (!db || !user) { setBills(s => s.filter(x => x.id !== id)); }
          else { await remove(ref(db, `users/${user.uid}/scheduledBills/${id}`)); }
        } catch (e) { console.error("delete err", e); }
        closeModal();
      },
    });
  }

  async function toggleActive(id, current) {
    // always allowed — toggles active state (but in printMode only show label)
    if (printMode) return;
    if (!db || !user) { setBills(s => s.map(x => x.id === id ? { ...x, active: !current } : x)); return; }
    try { await update(ref(db, `users/${user.uid}/scheduledBills/${id}`), { active: !current, updatedAt: Date.now() }); } catch (e) { console.error(e); }
  }

  async function markPaid(bill, createExpense = true) {
    if (!bill || !bill.id) { openModal({ title: "Invalid", message: "Invalid bill", showCancel: false, confirmText: "OK" }); return; }

    // fetch latest copy (DB preferred). If the latest copy is disabled, abort.
    const latest = await fetchLatestBill(bill.id);
    if (!latest) { openModal({ title: "Not found", message: "Bill not found", showCancel: false, confirmText: "OK" }); return; }
    if (latest.active === false) { openModal({ title: "Disabled", message: "This scheduled bill is disabled. Enable to mark it paid.", showCancel: false, confirmText: "OK" }); return; }

    const id = latest.id;
    const next = advanceDate(latest.nextDue || Date.now(), latest.recurrence);

    if (!db || !user) {
      // update local only
      setBills(s => s.map(x => x.id === id ? { ...x, nextDue: next || null, nextDueFormatted: next ? formatDDMMYYYY(next) : null } : x));
      if (createExpense) openModal({ title: "Payment recorded", message: `Recorded payment ${moneyINR(latest.amount)} for ${latest.name}`, showCancel: false, confirmText: "OK" });
      return;
    }

    try {
      if (createExpense) {
        const expenseId = String(Date.now());
        const expensePayload = {
          name: latest.name,
          amount: Number(latest.amount || 0),
          category: latest.category || "Bills",
          date: Date.now(),
          note: `Paid scheduled bill (${latest.name})`,
          createdAt: Date.now(),
          source: "scheduledBills"
        };
        await set(ref(db, `users/${user.uid}/expenses/${expenseId}`), expensePayload);
      }

      if (next) await update(ref(db, `users/${user.uid}/scheduledBills/${id}`), { nextDue: next, nextDueFormatted: formatDDMMYYYY(next), updatedAt: Date.now() });
      else await update(ref(db, `users/${user.uid}/scheduledBills/${id}`), { nextDue: null, nextDueFormatted: null, active: false, updatedAt: Date.now() });

    } catch (e) { console.error("markPaid err", e); openModal({ title: "Error", message: "Failed to mark as paid. Check console.", showCancel: false, confirmText: "OK" }); }
  }

  // Add/Edit form (inline) — removed color picker to ensure unique automatic colors
  const AddEditForm = ({ anchor, existing }) => {
    const show = adding.open && adding.anchor === anchor && (editingId === (existing && existing.id) || !existing);
    const isEdit = Boolean(existing);
    const [local, setLocal] = useState(() => existing ? { ...existing } : { name: "", amount: "", nextDue: new Date().toISOString().slice(0,10), recurrence: "monthly", category: "", active: true });

    useEffect(() => { if (isEdit) setLocal({ ...existing }); }, [existing]); // eslint-disable-line

    if (!show || printMode) return null; // hide form in print mode

    function onChange(k, v) { setLocal(s => ({ ...s, [k]: v })); }

    function submit(e) {
      e.preventDefault();
      if (!local.name.trim()) {
        openModal({ title: "Missing name", message: "Please enter a name", showCancel: false, confirmText: "OK" });
        return;
      }
      if (!local.amount) {
        openModal({ title: "Missing amount", message: "Please enter an amount", showCancel: false, confirmText: "OK" });
        return;
      }
      const payload = {
        name: local.name.trim(),
        amount: Number(local.amount || 0),
        nextDue: local.nextDue ? new Date(local.nextDue).getTime() : null,
        nextDueFormatted: local.nextDue ? formatDDMMYYYY(new Date(local.nextDue).getTime()) : null,
        recurrence: local.recurrence || "once",
        category: local.category || "Bills",
        active: local.active !== false
        // color intentionally omitted -> assigned automatically in saveBill
      };
      saveBill(payload, isEdit ? existing.id : null);
    }

    return (
      <form onSubmit={submit} style={styles.addForm}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 130px 160px", gap: 12 }}>
          <input placeholder="Name (e.g. Electricity)" value={local.name} onChange={e => onChange("name", e.target.value)} style={styles.input} />
          <input placeholder="Amount" inputMode="numeric" value={local.amount} onChange={e => onChange("amount", e.target.value)} style={styles.input} />
          <input type="date" value={local.nextDue ? new Date(local.nextDue).toISOString().slice(0,10) : new Date().toISOString().slice(0,10)} onChange={e => onChange("nextDue", e.target.value)} style={styles.input} />
          <select value={local.recurrence} onChange={e => onChange("recurrence", e.target.value)} style={styles.input}>
            <option value="once">Once</option>
            <option value="weekly">Weekly</option>
            <option value="biweekly">Biweekly</option>
            <option value="monthly">Monthly</option>
            <option value="quarterly">Quarterly</option>
            <option value="yearly">Yearly</option>
          </select>
          <input placeholder="Category (optional)" value={local.category} onChange={e => onChange("category", e.target.value)} style={styles.input} />
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button type="submit" style={styles.primaryBtn}>{isEdit ? "Save" : "Add"}</button>
            <button type="button" onClick={closeAdd} style={styles.ghostBtn}>Cancel</button>
          </div>
        </div>
      </form>
    );
  };

  // summary metrics
  const activeCount = bills.filter(b => b.active !== false).length;
  const monthlyOutgoing = bills.filter(b => (b.recurrence || "").toLowerCase() === "monthly").reduce((s, x) => s + (Number(x.amount || 0)), 0);
  const nextDueTs = bills.length ? Math.min(...bills.map(b => Number(b.nextDue || Infinity))) : null;
  const overdueCount = bills.filter(b => isOverdue(b.nextDue)).length;

  return (
    <div style={{ minHeight: "100vh", padding: 28, background: THEME.pageGradient, fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial" }}>
      <div style={{ maxWidth: 1180, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16, marginBottom: 18, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ margin: 0, display: "flex", alignItems: "center", gap: 12, color: THEME.heading, fontSize: 28, fontWeight: 800 }}>
              <span style={{ width: 44, height: 44, display: "inline-grid", placeItems: "center", borderRadius: 10, background: "linear-gradient(180deg,#eef2ff,#eefbf1)" }}>
                {renderIcon(Calendar, 20, { color: THEME.primary }) }
              </span>
              <span>Scheduled Bills</span>
            </h1>
            <div style={{ marginTop: 8, color: THEME.muted }}>Manage subscriptions, recurring payments and upcoming bills — premium view.</div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* hide filters/search/add when in printMode */}
              {!printMode && (
                <>
                  <div style={styles.searchWrap}>
                    {renderIcon(Search, 16, { color: THEME.muted })}
                    <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search bills or category" style={styles.searchInput} />
                  </div>

                  <select value={filter} onChange={e => setFilter(e.target.value)} style={styles.select}>
                    <option value="all">All</option>
                    <option value="upcoming">Upcoming</option>
                    <option value="overdue">Overdue</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={styles.select}>
                    <option value="nextDue">Next due</option>
                    <option value="amount">Amount</option>
                    <option value="name">Name</option>
                  </select>
                </>
              )}
            </div>

            <div>
              {/* hide Add button in printMode */}
              {!printMode && (
                <button onClick={openAdd} style={styles.addBtn}>
                  {renderIcon(PlusCircle, 14, { color: "#fff" })} <span style={{ marginLeft: 8, fontWeight: 800 }}>Add bill</span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* KPI summary */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 18 }}>
          <div style={{ ...styles.kpiCard, borderLeft: `6px solid ${THEME.accent}` }}>
            <div style={{ color: THEME.muted, fontSize: 13, fontWeight: 700 }}>Active bills</div>
            <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900, color: THEME.heading }}>{activeCount}</div>
            <div style={{ marginTop: 10, color: THEME.muted, fontSize: 12 }}>Manage active subscriptions</div>
          </div>

          <div style={{ ...styles.kpiCard, borderLeft: `6px solid ${THEME.primary}` }}>
            <div style={{ color: THEME.muted, fontSize: 13, fontWeight: 700 }}>Total monthly outgoing (est)</div>
            <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900, color: THEME.heading }}>{moneyINR(monthlyOutgoing)}</div>
            <div style={{ marginTop: 10, color: THEME.muted, fontSize: 12 }}>Recurring monthly subscriptions</div>
          </div>

          <div style={{ ...styles.kpiCard, borderLeft: `6px solid ${overdueCount > 0 ? THEME.danger : THEME.primaryDark}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ color: THEME.muted, fontSize: 13, fontWeight: 700 }}>Next due</div>
              <div style={{ color: THEME.muted, fontSize: 13 }}>{overdueCount} overdue</div>
            </div>
            <div style={{ marginTop: 8, fontSize: 20, fontWeight: 900, color: THEME.heading }}>{nextDueTs ? nextDueLabel(nextDueTs) : "—"}</div>
            <div style={{ marginTop: 10, color: THEME.muted, fontSize: 12 }}>Keep your cashflow healthy</div>
          </div>
        </div>

        {/* Inline add form */}
        <AddEditForm anchor="header" existing={editingId ? bills.find(x => x.id === editingId) : null} />

        {/* ---- Bills list wrapped in ONE card (changed) ---- */}
        <div style={{ marginBottom: 16 }}>
          <div style={{ padding: 12, borderRadius: 12, background: THEME.cardBg, boxShadow: THEME.subtleShadow, border: `1px solid ${THEME.border}` }}>
            {/* Loading / Empty states inside wrapper */}
            {loading && <div style={{ padding: 18 }}>Loading…</div>}

            {!loading && filtered.length === 0 && (
              <div style={{ padding: 18, display: "flex", gap: 12, alignItems: "center" }}>
                {renderIcon(AlertCircle, 18, { color: "#9ca3af" })}
                <div style={{ color: THEME.muted }}>No scheduled bills match your filters. Add one with the Add button.</div>
              </div>
            )}

            {/* bill rows */}
            {!loading && filtered.length > 0 && filtered.map((bill, idx) => {
              const overdue = isOverdue(bill.nextDue);
              const accent = bill.color || pickColorKey((bill.id || bill.name || '') + String(idx));
              const disabled = bill.active === false;

              // treat actions as disabled in printMode
              const actionDisabled = disabled || printMode;

              // Buttons: render truly disabled when bill is disabled OR when in printMode
              const PayButton = actionDisabled ? (
                <button title="Mark paid" disabled style={{ ...styles.payBtn, opacity: 0.5, pointerEvents: 'none', cursor: 'default' }}>
                  {renderIcon(CheckCircle, 14, { color: "#fff" })} <span style={{ marginLeft: 6, fontWeight: 800 }}>Pay</span>
                </button>
              ) : (
                <button title="Mark paid" onClick={() => markPaid(bill, true)} style={styles.payBtn}>
                  {renderIcon(CheckCircle, 14, { color: "#fff" })} <span style={{ marginLeft: 6, fontWeight: 800 }}>Pay</span>
                </button>
              );

              const EditButton = actionDisabled ? (
                <button title="Edit" disabled style={{ ...styles.iconBtn, opacity: 0.5, pointerEvents: 'none', cursor: 'default' }}>
                  {renderIcon(Edit2, 16, { color: THEME.primaryDark })}
                </button>
              ) : (
                <button title="Edit" onClick={() => { setEditingId(bill.id); setAdding({ open: true, anchor: "header" }); }} style={styles.iconBtn}>
                  {renderIcon(Edit2, 16, { color: THEME.primaryDark })}
                </button>
              );

              const DeleteButton = actionDisabled ? (
                <button title="Delete" disabled style={{ ...styles.deleteBtn, opacity: 0.5, pointerEvents: 'none', cursor: 'default' }}>
                  {renderIcon(Trash2, 16, { color: THEME.danger })}
                </button>
              ) : (
                <button title="Delete" onClick={() => deleteBill(bill.id)} style={styles.deleteBtn}>
                  {renderIcon(Trash2, 16, { color: THEME.danger })}
                </button>
              );

              return (
                <div key={bill.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: 14, borderRadius: 8, background: "transparent", borderBottom: idx < filtered.length - 1 ? `1px solid ${THEME.border}` : "none", opacity: disabled ? 0.7 : 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div style={{ width: 56, height: 56, borderRadius: 12, display: "grid", placeItems: "center", background: `linear-gradient(180deg, ${accent}25, ${accent}12)`, borderLeft: `6px solid ${accent}` }}>
                      {renderIcon(CreditCard, 20, { color: accent })}
                    </div>
                    <div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ fontSize: 16, fontWeight: 800, color: THEME.heading }}>{bill.name}</div>
                        <div style={{ fontSize: 12, color: THEME.muted }}>· {bill.category || "Bills"}</div>
                        {overdue && <div style={{ padding: "4px 8px", background: "#fee2e2", color: THEME.danger, fontWeight: 700, borderRadius: 999, fontSize: 12 }}>Overdue</div>}
                        {!overdue && bill.recurrence && <div style={{ padding: "4px 8px", background: "#eef2ff", color: THEME.primaryDark, fontWeight: 700, borderRadius: 999, fontSize: 12 }}>{formatRecurrence(bill.recurrence)}</div>}
                      </div>
                      <div style={{ marginTop: 6, color: THEME.muted, fontSize: 13 }}>
                        Next: <span style={{ fontWeight: 700, color: "#0f172a" }}>{bill.nextDueFormatted ? bill.nextDueFormatted : nextDueLabel(bill.nextDue)}</span>
                        <span style={{ marginLeft: 12, color: THEME.muted, fontSize: 12, marginRight: 6 }}>{renderIcon(Clock, 12, { color: THEME.muted })}</span>
                        <span style={{ fontSize: 12, color: THEME.muted }}>Updated {bill.updatedAt ? new Date(bill.updatedAt).toLocaleDateString() : '—'}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ textAlign: "right", marginRight: 6 }}>
                      <div style={{ fontSize: 18, fontWeight: 900, color: THEME.heading }}>{moneyINR(bill.amount)}</div>
                      <div style={{ fontSize: 12, color: THEME.muted }}>{disabled ? "Inactive" : "Active"}</div>
                    </div>

                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      {PayButton}
                      {EditButton}
                      {DeleteButton}

                      {/* toggle button: disabled in printMode */}
                      <button onClick={() => toggleActive(bill.id, bill.active)} style={styles.linkBtn} disabled={printMode}>
                        {bill.active === false ? "Enable" : "Disable"}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* help / tips */}
        <div style={{ marginTop: 20, padding: 16, borderRadius: 12, background: THEME.cardBg, boxShadow: THEME.subtleShadow, color: THEME.muted }}>
          <div style={{ fontWeight: 800, marginBottom: 8 }}>Tips</div>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li style={{ marginBottom: 6 }}>Use <strong>Pay</strong> to record an expense automatically and advance the next due date for recurring bills.</li>
            <li style={{ marginBottom: 6 }}>Set recurrence to <em>Once</em> for one-off payments — they will be marked inactive after payment.</li>
            <li style={{ marginBottom: 6 }}>Use the search and filters to find subscriptions quickly. Colors are now assigned automatically and uniquely for easier scanning.</li>
          </ul>
        </div>

      </div>

      {/* ======= MODAL ======= */}
      {modal.open && (
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
                    } catch (e) { console.error("modal onConfirm error", e); }
                  }
                  closeModal();
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
      )}
    </div>
  );
}

// ---------- styles ----------
const styles = {
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderRadius: 12,
    background: "#fff",
    boxShadow: "0 8px 22px rgba(16,24,40,0.06)",
    border: "1px solid rgba(15,23,42,0.06)",
    minWidth: 0,
    width: "100%",
    maxWidth: 340,
    flex: "1 1 180px"
  },
  searchInput: {
    border: "none",
    outline: "none",
    fontSize: 14,
    flex: 1,
    color: "#0f172a"
  },
  select: {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.08)",
    background: "#fff",
    fontSize: 13,
    color: "#0f172a",
    height: 38,
    flexShrink: 0
  },
  addBtn: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "7px 12px",
    borderRadius: 10,
    border: "none",
    cursor: "pointer",
    background: "linear-gradient(90deg,#4338ca,#6d28d9)",
    color: "#fff",
    fontWeight: 800,
    fontSize: 13,
    lineHeight: 1,
    height: 38,
    boxShadow: "0 8px 20px rgba(67,56,202,0.16)"
  },
  kpiCard: {
    padding: 16,
    borderRadius: 12,
    background: THEME.panelBg,
    border: "1px solid rgba(15,23,42,0.06)",
    boxShadow: "0 10px 30px rgba(16,24,40,0.05)"
  },
  addForm: {
    marginTop: 10,
    padding: 14,
    borderRadius: 12,
    background: THEME.cardBg,
    border: "1px solid rgba(15,23,42,0.06)",
    boxShadow: "0 8px 30px rgba(16,24,40,0.05)",
    marginBottom: 8
  },
  input: {
    padding: "10px 12px",
    borderRadius: 10,
    border: "1px solid rgba(15,23,42,0.08)",
    outline: "none",
    fontSize: 14,
    color: "#0f172a"
  },
  primaryBtn: {
    background: "linear-gradient(90deg,#059669,#047857)",
    border: "none",
    color: "#fff",
    padding: "10px 14px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
    fontSize: 14
  },
  ghostBtn: {
    background: "transparent",
    border: "1px solid rgba(15,23,42,0.06)",
    padding: "10px 12px",
    borderRadius: 10,
    cursor: "pointer",
    color: "#0f172a"
  },
  payBtn: {
    background: "linear-gradient(90deg,#059669,#047857)",
    border: "none",
    color: "#fff",
    padding: "9px 14px",
    borderRadius: 10,
    fontWeight: 800,
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8
  },
  iconBtn: {
    background: "#fff",
    border: "1px solid rgba(15,23,42,0.06)",
    padding: 8,
    borderRadius: 10,
    cursor: "pointer"
  },
  deleteBtn: {
    background: "#fff",
    border: "1px solid rgba(15,23,42,0.06)",
    padding: 8,
    borderRadius: 10,
    cursor: "pointer"
  },
  linkBtn: {
    background: "transparent",
    border: "none",
    color: "#374151",
    cursor: "pointer",
    fontSize: 13
  }
};
