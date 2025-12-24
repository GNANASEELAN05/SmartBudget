// frontend/src/pages/Income.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import {
  getDatabase,
  ref,
  onValue,
  off,
  push,
  set,
  remove,
  update,
} from "firebase/database";
import { Wallet, List as ListIcon, Calendar, X } from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // <-- added hook import

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export default function Income({
  forcedMonth = null,
  forcedYear = null,
  printMode = false,
}) {
  const auth = getAuth();
  const db = getDatabase();

  // Use forced period hook so Export can force month/year,
  // but the page still supports local selection when printMode === false.
  const [month, setMonth, year, setYear] = useForcedPeriod(forcedMonth, forcedYear);

  // Keep both a typed input string (so user can type freely) and a committed numeric year used for listeners
  const [yearInput, setYearInput] = useState(String(year));

  const [user, setUser] = useState(auth.currentUser || null);

  const [incomes, setIncomes] = useState([]); // array [{ id, name, amount, source, createdAt }]
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const nameRef = useRef();
  const amountRef = useRef();
  const sourceRef = useRef();
  const fileRef = useRef();

  // Modal state (updated to match reference code style)
  const [modal, setModal] = useState({
    open: false,
    title: "",
    message: "",
    showCancel: false,
    confirmText: "OK",
    cancelText: "Cancel",
    onConfirm: null,
  });

  const openModal = ({
    title = "",
    message = "",
    showCancel = false,
    confirmText = "OK",
    cancelText = "Cancel",
    onConfirm = null,
  }) => {
    // wrap provided onConfirm so we ensure modal closes after completion (like the previous behavior)
    const wrapped = onConfirm
      ? async () => {
          try {
            await onConfirm();
          } finally {
            setModal((m) => ({ ...m, open: false }));
          }
        }
      : () => setModal((m) => ({ ...m, open: false }));

    setModal({ open: true, title, message, showCancel, confirmText, cancelText, onConfirm: wrapped });
  };

  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  // keep auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [auth]);

  // sync yearInput when year changes (so typed input matches forced changes)
  useEffect(() => {
    setYearInput(String(year));
  }, [year]);

  // build monthKey like your reference code: YYYY-MM (month 01..12)
  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  /* ============== Listen for incomes for selected month ============== */
  useEffect(() => {
    if (!user) {
      setIncomes([]);
      return;
    }

    setLoading(true);
    const incomesRef = ref(
      db,
      `users/${user.uid}/monthlyBudgets/${monthKey}/incomes`
    );

    const handler = onValue(incomesRef, (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, v]) => ({
        id,
        name: v.name || "Untitled",
        amount: Number(v.amount || 0),
        source: v.source || "",
        createdAt: v.createdAt || 0,
      }));
      // sort newest first
      list.sort((a, b) => b.createdAt - a.createdAt);
      setIncomes(list);
      setLoading(false);
    });

    return () => off(incomesRef, "value", handler);
  }, [db, user, monthKey]);

  /* ==================== helpers ==================== */
  function formatCurrency(n) {
    try {
      return `₹${Math.round(n).toLocaleString()}`;
    } catch {
      return `₹${n}`;
    }
  }

  const totalIncome = useMemo(
    () => incomes.reduce((s, i) => s + Number(i.amount || 0), 0),
    [incomes]
  );

  /* ================= add / edit / delete ==================== */
  async function handleAddOrUpdate(e) {
    e?.preventDefault?.();

    if (!user) {
      openModal({
        title: "Not signed in",
        message: "Please log in to add incomes.",
        confirmText: "OK",
        showCancel: false,
      });
      return;
    }

    const name = (nameRef.current?.value || "").trim() || "Salary";
    const amount = Number(amountRef.current?.value || 0);
    const source = (sourceRef.current?.value || "").trim() || "General";

    if (!amount || isNaN(amount) || amount <= 0) {
      openModal({
        title: "Invalid amount",
        message: "Enter a valid amount greater than 0.",
        confirmText: "OK",
        showCancel: false,
      });
      return;
    }

    const incomesBaseRef = ref(
      db,
      `users/${user.uid}/monthlyBudgets/${monthKey}/incomes`
    );

    try {
      if (editingId) {
        // update existing
        const updateRef = ref(
          db,
          `users/${user.uid}/monthlyBudgets/${monthKey}/incomes/${editingId}`
        );
        await update(updateRef, {
          name,
          amount,
          source,
          // keep createdAt as-is if it exists; set an updatedAt as convenience
          updatedAt: Date.now(),
        });
        setEditingId(null);
        openModal({
          title: "Updated",
          message: "Income updated successfully.",
          confirmText: "OK",
          showCancel: false,
        });
      } else {
        // push new
        const newRef = push(incomesBaseRef);
        await set(newRef, {
          name,
          amount,
          source,
          createdAt: Date.now(),
        });
        openModal({
          title: "Added",
          message: "Income added successfully.",
          confirmText: "OK",
          showCancel: false,
        });
      }

      // clear inputs
      if (nameRef.current) nameRef.current.value = "";
      if (amountRef.current) amountRef.current.value = "";
      if (sourceRef.current) sourceRef.current.value = "";
    } catch (err) {
      console.error(err);
      openModal({
        title: "Save failed",
        message: "Failed to save income. See console.",
        confirmText: "OK",
        showCancel: false,
      });
    }
  }

  function startEdit(item) {
    setEditingId(item.id);
    if (nameRef.current) nameRef.current.value = item.name;
    if (amountRef.current) amountRef.current.value = item.amount;
    if (sourceRef.current) sourceRef.current.value = item.source;
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    if (!user) {
      openModal({
        title: "Not signed in",
        message: "Please log in to delete incomes.",
        confirmText: "OK",
        showCancel: false,
      });
      return;
    }

    // Show confirmation modal; actual deletion happens in onConfirm
    openModal({
      title: "Delete income?",
      message: "Are you sure? If deleted it cannot be undone.",
      confirmText: "Delete",
      cancelText: "Cancel",
      showCancel: true,
      onConfirm: async () => {
        try {
          await remove(
            ref(
              db,
              `users/${user.uid}/monthlyBudgets/${monthKey}/incomes/${id}`
            )
          );
          // optional success notification (modal will close in wrapper)
        } catch (err) {
          console.error(err);
          // show failure modal after close (or you could show it instead of closing)
          setTimeout(() => {
            openModal({ title: "Delete failed", message: "Failed to delete income.", confirmText: "OK", showCancel: false });
          }, 250);
        }
      },
    });
  }

  function cancelEdit() {
    setEditingId(null);
    if (nameRef.current) nameRef.current.value = "";
    if (amountRef.current) amountRef.current.value = "";
    if (sourceRef.current) sourceRef.current.value = "";
  }

  /* ================= CSV Import (basic) =================
     - expects CSV with header: name,amount,source (order doesn't matter)
     - import will push rows into currently selected month
  ======================================================= */
  function parseCSV(text) {
    // very small robust CSV parse (no quoted-field full support)
    const lines = text
      .split(/\r\n|\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) return [];

    const headers = lines[0]
      .split(",")
      .map((h) => h.trim().toLowerCase());

    const rows = lines.slice(1).map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      const obj = {};
      headers.forEach((h, i) => (obj[h] = cols[i] ?? ""));
      return obj;
    });

    // map to expected shape
    return rows.map((r) => ({
      name: r.name || r.title || r.label || "Income",
      amount: Number(r.amount || r.value || r.amt || 0),
      source: r.source || r.from || "Imported",
    }));
  }

  const [selectedFileName, setSelectedFileName] = useState("");

  async function handleCSVImport(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!user) {
      openModal({
        title: "Not signed in",
        message: "Please log in to import CSV.",
        confirmText: "OK",
        showCancel: false,
      });
      return;
    }

    // set the filename so UI shows it below the download button
    setSelectedFileName(file.name);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const text = ev.target.result;
        const rows = parseCSV(text);
        if (!rows.length) {
          openModal({
            title: "No rows",
            message: "No rows found in CSV.",
            confirmText: "OK",
            showCancel: false,
          });
          return;
        }

        const baseRef = ref(
          db,
          `users/${user.uid}/monthlyBudgets/${monthKey}/incomes`
        );

        // push each row (sequentially)
        let importedCount = 0;
        for (const r of rows) {
          if (!r.amount || isNaN(r.amount)) continue; // skip invalid rows
          const p = push(baseRef);
          await set(p, {
            name: r.name,
            amount: Number(r.amount),
            source: r.source || "Imported",
            createdAt: Date.now(),
            imported: true,
          });
          importedCount++;
        }

        // clear file input (keeps displayed filename)
        if (fileRef.current) fileRef.current.value = "";
        openModal({
          title: "Import complete",
          message: `Imported ${importedCount} rows into ${MONTHS[month]} ${year}`,
          confirmText: "OK",
          showCancel: false,
        });
      } catch (err) {
        console.error(err);
        openModal({
          title: "Import failed",
          message: "Failed to import CSV.",
          confirmText: "OK",
          showCancel: false,
        });
      }
    };
    reader.readAsText(file, "utf-8");
  }

  function clearSelectedFile() {
    setSelectedFileName("");
    if (fileRef.current) {
      try {
        fileRef.current.value = "";
      } catch (e) {
        // ignore
      }
    }
  }

  /* ========== YEAR input helpers ========== */
  function commitYearFromInput() {
    const parsed = parseInt((yearInput || "").replace(/\D/g, ""), 10);
    if (!Number.isNaN(parsed) && parsed > 1900 && parsed < 3000) {
      setYear(parsed);
      setYearInput(String(parsed));
    } else {
      // reset input back to committed year if invalid
      setYearInput(String(year));
    }
  }

  return (
    <div
      style={{
        padding: 28,
        borderRadius: 22,
        background: "linear-gradient(135deg,#fff7ed,#f8fafc)",
        boxShadow: "0 20px 42px rgba(3,7,18,0.06)",
        color: "#0f172a",
      }}
    >
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 12 }}>
        <div>
          <h2 style={{ fontWeight: 900, fontSize: 26, margin: 0, color: "#0b1220" }}>Manage Income</h2>
          <p style={{ opacity: 0.85, marginTop: 6, color: "#334155" }}>
            Add monthly incomes, import from CSV, or edit existing amounts. All incomes are saved per month.
          </p>
        </div>

        {/* Month / Year selection (premium pill) */}
        {!printMode && (
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <select
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
              style={{
                padding: "10px 14px",
                borderRadius: 12,
                fontWeight: 800,
                border: "1px solid rgba(15,23,42,0.06)",
                background: "#ffffff",
                boxShadow: "0 6px 18px rgba(99,102,241,0.08)"
              }}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i}>
                  {m}
                </option>
              ))}
            </select>

            {/* yearInput is a text field so user can type freely; we commit on blur/enter */}
            <input
              type="text"
              value={yearInput}
              onChange={(e) => setYearInput(e.target.value)}
              onBlur={commitYearFromInput}
              onKeyDown={(e) => { if (e.key === "Enter") { commitYearFromInput(); e.currentTarget.blur(); } }}
              style={{
                width: 120,
                padding: "10px 14px",
                borderRadius: 12,
                fontWeight: 800,
                border: "1px solid rgba(15,23,42,0.06)",
                background: "#ffffff",
                boxShadow: "0 6px 18px rgba(34,211,238,0.04)"
              }}
            />
          </div>
        )}
      </div>

      {/* SUMMARY CARDS */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))", gap: 18, marginBottom: 18 }}>
        <InfoCard label="Total Income (this month)" value={formatCurrency(totalIncome)} icon={Wallet} />
        <InfoCard label="Entries" value={incomes.length} icon={ListIcon} />
        <InfoCard label="Selected" value={`${MONTHS[month]} ${year}`} icon={Calendar} />
      </div>

      {/* ADD / EDIT FORM + CSV IMPORT */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 18, marginBottom: 18 }}>
        <form onSubmit={handleAddOrUpdate} style={{ padding: 18, borderRadius: 14, background: "#ffffff", boxShadow: "0 10px 30px rgba(2,6,23,0.04)" }}>
          <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
            <input ref={nameRef} placeholder="Income name (e.g., Salary, Freelance)" style={inputStyle()} />
            <input ref={amountRef} placeholder="Amount" type="number" style={inputStyle({ width: 160 })} />
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <input ref={sourceRef} placeholder="Source (Bank, Employer, etc.)" style={inputStyle()} />
            <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
              {editingId ? (
                <>
                  <button type="button" onClick={cancelEdit} style={secondaryButtonStyle()}>
                    Cancel
                  </button>
                  <button type="submit" style={primaryButtonStyle()}>
                    Update
                  </button>
                </>
              ) : (
                <button type="submit" style={primaryButtonStyle()}>
                  Add Income
                </button>
              )}
            </div>
          </div>

          <div style={{ fontSize: 12, opacity: 0.7, color: "#475569" }}>
            Adding / updating incomes saves them to <code>monthlyBudgets/{year}-{String(month+1).padStart(2,"0")}/incomes</code>
          </div>
        </form>

        {/* CSV import card */}
        <div style={{ padding: 18, borderRadius: 14, background: "linear-gradient(135deg,#ffffff,#fbfbff)", boxShadow: "0 10px 30px rgba(2,6,23,0.04)" }}>
          <h4 style={{ marginTop: 0, marginBottom: 8, color: "#0b1220" }}>Import CSV</h4>
          <p style={{ marginTop: 0, marginBottom: 12, opacity: 0.8, fontSize: 13, color: "#475569" }}>
            CSV columns: <b>name, amount, source</b>. First row is header. Imported rows go into the selected month.
          </p>

          {/* hidden file input (we removed the visible file input) */}
          <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleCSVImport} style={{ display: "none" }} />

          <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={() => {
                  // sample CSV download via data URI
                  const sample = "name,amount,source\nSalary,50000,Employer\nFreelance,7500,ClientA\n";
                  const blob = new Blob([sample], { type: "text/csv" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "incomes-sample.csv";
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                style={secondaryButtonStyle()}
              >
                Download sample
              </button>

              {/* filename display under download button with cancel (X) */}
              <div style={{ fontSize: 12, color: selectedFileName ? "#0b1220" : "#94a3b8", opacity: 0.95, display: "flex", alignItems: "center", gap: 8 }}>
                {selectedFileName ? (
                  <>
                    <span>Selected file: {selectedFileName}</span>
                    <button
                      type="button"
                      onClick={clearSelectedFile}
                      title="Remove file"
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: 6,
                        borderRadius: 8,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        color: "#94a3b8"
                      }}
                    >
                      <X size={14} />
                    </button>
                  </>
                ) : (
                  "No file selected"
                )}
              </div>
            </div>

            <div style={{ marginLeft: "auto" }}>
              <button
                type="button"
                onClick={() => fileRef.current && fileRef.current.click()}
                style={primaryButtonStyle()}
              >
                Choose CSV
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* INCOMES LIST */}
      <div style={{ padding: 12, borderRadius: 12, background: "#ffffff", boxShadow: "0 8px 26px rgba(2,6,23,0.03)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h3 style={{ margin: 0, fontSize: 18, color: "#0b1220" }}>Monthly Incomes</h3>
          <div style={{ fontSize: 13, color: "#475569" }}>{loading ? "Loading..." : `${incomes.length} entries`}</div>
        </div>

        {incomes.length === 0 && !loading && (
          <div style={{ padding: 16, textAlign: "center", color: "#475569" }}>
            No incomes for <b style={{ color: "#0b1220" }}>{MONTHS[month]} {year}</b>. Add one or import a CSV.
          </div>
        )}

        {incomes.map((it) => (
          <div key={it.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderBottom: "1px solid rgba(2,6,23,0.03)" }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                <div style={{ fontWeight: 900, color: "#0b1220" }}>{it.name}</div>
                <div style={{ fontSize: 12, color: "#475569" }}>{it.source}</div>
              </div>
              <div style={{ fontSize: 13, color: "#64748b" }}>{new Date(it.createdAt).toLocaleString()}</div>
            </div>

            <div style={{ minWidth: 120, textAlign: "right", fontWeight: 800, color: "#065f46" }}>{formatCurrency(it.amount)}</div>

            <div style={{ display: "flex", gap: 8, marginLeft: 8 }}>
              <button onClick={() => startEdit(it)} style={smallButtonStyle()}>Edit</button>
              <button onClick={() => handleDelete(it.id)} style={dangerButtonStyle()}>Delete</button>
            </div>
          </div>
        ))}
      </div>

      {/* ======= MODAL (reference style) ======= */}
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
                    await modal.onConfirm();
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
      )}
    </div>
  );
}

/* ================= small presentational components / styles ================= */

/**
 * InfoCard now uses Lucide icon components only (no emoji path).
 * icon prop should be a Lucide component (e.g. Wallet) or a React element.
 * If no icon is provided, a sensible Lucide fallback is used.
 */
function InfoCard({ label, value, icon }) {
  // default resolver based on label keywords
  function getDefaultIconByLabel(lbl) {
    const l = (lbl || "").toLowerCase();
    if (l.includes("income") || l.includes("total")) return Wallet;
    if (l.includes("entry") || l.includes("entries") || l.includes("count")) return ListIcon;
    if (l.includes("date") || l.includes("month") || l.includes("selected")) return Calendar;
    if (l.includes("report") || l.includes("file")) return ListIcon;
    return Wallet; // fallback
  }

  let iconNode = null;

  // If user supplied a React element directly
  if (React.isValidElement(icon)) {
    iconNode = icon;
  } else if (typeof icon === "function") {
    // icon is a Lucide React component (functional component)
    const IconComp = icon;
    // render with JSX to ensure proper rendering
    iconNode = <IconComp size={22} />;
  } else {
    // always use Lucide fallback (we avoid emoji rendering)
    const DefaultIcon = getDefaultIconByLabel(label);
    iconNode = <DefaultIcon size={22} />;
  }

  return (
    <div style={{
      padding: 18,
      borderRadius: 14,
      /* slightly darker but still soft gradient for better contrast */
      background: "linear-gradient(135deg,#f3f6fb,#e9efff)",
      boxShadow: "0 10px 26px rgba(2,6,23,0.06)",
      display: "flex",
      gap: 12,
      alignItems: "center",
      justifyContent: "space-between",
      /* a bit stronger border for clarity */
      border: "1px solid rgba(79,70,229,0.10)"
    }}>
      <div>
        {/* value slightly darker */}
        <div style={{ fontSize: 18, fontWeight: 900, color: "#071033" }}>{value}</div>
        {/* label slightly darker and bolder */}
        <div style={{ fontSize: 13, opacity: 1, color: "#243241", fontWeight: 800 }}>{label}</div>
      </div>

      {/* icon color deepened a little */}
      <div style={{ fontSize: 22, color: "#4f46e5" }}>{iconNode}</div>
    </div>
  );
}

function inputStyle(extra = {}) {
  return {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid rgba(2,6,23,0.06)",
    background: "#f8fafc",
    fontWeight: 700,
    outline: "none",
    ...extra,
  };
}

function primaryButtonStyle() {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    background: "linear-gradient(90deg,#6366f1,#22d3ee)",
    color: "#fff",
    border: "none",
    fontWeight: 900,
    cursor: "pointer",
    boxShadow: "0 8px 26px rgba(34,211,238,0.08)",
  };
}

function secondaryButtonStyle() {
  return {
    padding: "10px 14px",
    borderRadius: 12,
    background: "#fff",
    border: "1px solid rgba(2,6,23,0.06)",
    fontWeight: 800,
    cursor: "pointer",
    color: "#0b1220"
  };
}

function smallButtonStyle() {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(2,6,23,0.06)",
    background: "#fff",
    fontWeight: 800,
    cursor: "pointer",
  };
}

function dangerButtonStyle() {
  return {
    padding: "8px 10px",
    borderRadius: 10,
    border: "1px solid rgba(239,68,68,0.12)",
    background: "#fff5f5",
    color: "#b91c1c",
    fontWeight: 800,
    cursor: "pointer",
  };
}
