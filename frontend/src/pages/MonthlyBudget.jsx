import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  getDatabase,
  ref,
  set,
  push,
  onValue,
  remove,
  off,
} from "firebase/database";

import useForcedPeriod from "../hooks/useForcedPeriod"; // <-- added

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const CATEGORIES = [
  "Food","Transport","Shopping","Bills","Entertainment","Other"
];

export default function MonthlyBudget({
  forcedMonth = null,
  forcedYear = null,
  printMode = false,
}) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  const currentYear = new Date().getFullYear();
  const currentMonthIndex = new Date().getMonth(); // 0-based

  // Use the forced period hook so Export page can control the year/month.
  // This defaults to currentMonth/currentYear when not forced, and still allows local updates.
  const [hookMonth, setHookMonth, year, setYear] = useForcedPeriod(
    forcedMonth,
    forcedYear,
    currentMonthIndex,
    currentYear
  );

  const [selectedMonths, setSelectedMonths] = useState([]);
  const [budgets, setBudgets] = useState({});
  const [monthlySpends, setMonthlySpends] = useState({});
  const [expenseSpends, setExpenseSpends] = useState({});
  const [amount, setAmount] = useState({});
  const [spendName, setSpendName] = useState({});
  const [viewMonth, setViewMonth] = useState(null);

  // New: store per-month selected date (ISO yyyy-mm-dd) when date picker shown
  const [selectedDate, setSelectedDate] = useState({});

  const pad = (v) => String(v).padStart(2, "0");

  /* ================= CONFIRM MODAL STATE ================= */
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

  /* ================= AUTO LOAD MONTHS ================= */
  useEffect(() => {
    if (!user) return;
    const months = new Set();

    const budgetRef = ref(db, `users/${user.uid}/monthlyBudgets`);
    const expenseRef = ref(db, `users/${user.uid}/expenses`);

    const b = onValue(budgetRef, (s) => {
      Object.keys(s.val() || {}).forEach((k) => {
        if (k.startsWith(`${year}-`)) months.add(+k.split("-")[1] - 1);
      });
      setSelectedMonths((prev) => {
        // preserve externally-forced selection when in printMode (handled separately)
        return Array.from(months);
      });
    });

    const e = onValue(expenseRef, (s) => {
      Object.values(s.val() || {}).forEach((v) => {
        if (!v.date) return;
        const [, m, y] = v.date.split("/");
        if (+y === Number(year) && v.source !== "monthly") months.add(+m - 1);
      });
      setSelectedMonths((prev) => {
        return Array.from(months);
      });
    });

    return () => {
      off(budgetRef, "value", b);
      off(expenseRef, "value", e);
    };
  }, [db, user, year]);

  /* ================= MONTHLY SPENDS ================= */
  useEffect(() => {
    if (!user) return;
    const listeners = [];

    selectedMonths.forEach((m) => {
      const key = `${year}-${String(m + 1).padStart(2, "0")}`;
      const r = ref(db, `users/${user.uid}/monthlyBudgets/${key}`);

      const h = onValue(r, (s) => {
        const d = s.val() || {};
        setBudgets((b) => ({ ...b, [key]: d.amount || 0 }));
        setMonthlySpends((p) => ({
          ...p,
          [key]: d.spends
            ? Object.entries(d.spends).map(([id, v]) => ({
                ...v,
                id,
                source: "monthly",
              }))
            : [],
        }));
      });

      listeners.push({ r, h });
    });

    return () => listeners.forEach(({ r, h }) => off(r, "value", h));
  }, [db, user, selectedMonths, year]);

  /* ================= EXPENSE SPENDS ================= */
  useEffect(() => {
    if (!user) return;
    const r = ref(db, `users/${user.uid}/expenses`);

    const h = onValue(r, (s) => {
      const g = {};
      Object.entries(s.val() || {}).forEach(([id, e]) => {
        // Skip entries that are monthly-originated
        if (e.source === "monthly") return;
        if (!e.date) return;
        const [, m, y] = e.date.split("/");
        if (+y !== Number(year)) return;
        const key = `${y}-${String(m).padStart(2, "0")}`;
        if (!g[key]) g[key] = [];
        // keep original id so we can dedupe against monthly entries
        g[key].push({ ...e, id, source: "expense", name: e.category });
      });
      setExpenseSpends(g);
    });

    return () => off(r, "value", h);
  }, [db, user, year]);

  /* ================= ACTIONS ================= */

  const saveBudget = (k, v) =>
    v > 0 && set(ref(db, `users/${user.uid}/monthlyBudgets/${k}/amount`), +v);

  const addSpend = async (k) => {
    if (!amount[k] || !spendName[k]) return;

    // parse year and month from key, e.g. "2024-05"
    const [yStr, mmStr] = k.split("-");
    const yNum = Number(yStr);
    const mIndex = Number(mmStr) - 1; // 0-based

    // Determine whether date-picker behavior applies to this month:
    const isPastMonth =
      yNum < currentYear || (yNum === currentYear && mIndex < currentMonthIndex);

    // Build date string in dd/mm/yyyy for storage:
    let date;
    if (isPastMonth) {
      // if user selected a date for that month use it, else default to last day of that month
      const iso = selectedDate[k];
      if (iso) {
        // iso expected "yyyy-mm-dd"
        const [yy, mm, dd] = iso.split("-");
        date = `${dd}/${mm}/${yy}`;
      } else {
        const lastDay = new Date(yNum, mIndex + 1, 0).getDate();
        date = `${pad(lastDay)}/${pad(mIndex + 1)}/${yNum}`;
      }
    } else {
      // current month: keep current date (unchanged behavior)
      const d = new Date();
      date = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    }

    const expRef = await push(ref(db, `users/${user.uid}/expenses`), {
      category: spendName[k],
      amount: +amount[k],
      date,
      source: "monthly",
    });

    await push(ref(db, `users/${user.uid}/monthlyBudgets/${k}/spends`), {
      name: spendName[k],
      amount: +amount[k],
      date,
      linkedExpenseId: expRef.key,
    });

    setAmount({ ...amount, [k]: "" });
    setSpendName({ ...spendName, [k]: "" });
    setSelectedDate((pd) => ({ ...pd, [k]: undefined }));
  };

  const removeHistory = async (k, e) => {
    if (e.source === "monthly") {
      await remove(ref(db, `users/${user.uid}/monthlyBudgets/${k}/spends/${e.id}`));
      if (e.linkedExpenseId)
        await remove(ref(db, `users/${user.uid}/expenses/${e.linkedExpenseId}`));
    } else {
      await remove(ref(db, `users/${user.uid}/expenses/${e.id}`));
    }
  };

  const deleteMonth = async (k) => {
    // Open modal instead of window.confirm
    openModal({
      title: "Delete this month's budget",
      message: "Are you sure you want to delete this month's entire budget and its spends? This action cannot be undone.",
      showCancel: true,
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          // 1) read this month's spends once and remove any linked expense entries
          const spendsRef = ref(db, `users/${user.uid}/monthlyBudgets/${k}/spends`);
          const handler = onValue(spendsRef, async (snap) => {
            const data = snap.val() || {};
            const removes = [];

            Object.entries(data).forEach(([spendId, spendObj]) => {
              // if spend has linkedExpenseId remove that expense
              const linkedId = spendObj && (spendObj.linkedExpenseId || spendObj.linkedExpense || spendObj.expenseId);
              if (linkedId) {
                removes.push(
                  remove(ref(db, `users/${user.uid}/expenses/${linkedId}`)).catch((err) => {
                    console.error("Failed to remove linked expense", linkedId, err);
                  })
                );
              }
            });

            // wait for all linked-expense removals to complete (if any)
            try {
              await Promise.all(removes);
            } catch (err) {
              // already logged individually, continue
              console.error("Error removing linked expenses:", err);
            }

            // detach listener for spends
            off(spendsRef, "value", handler);

            // 2) remove the entire monthlyBudgets/{k} node
            await remove(ref(db, `users/${user.uid}/monthlyBudgets/${k}`));

            // 3) close modal and reset view
            setViewMonth(null);
            closeModal();
          });
        } catch (err) {
          console.error("deleteMonth failed", err);
          closeModal();
          openModal({
            title: "Delete failed",
            message: "Failed to delete month. See console for details.",
            showCancel: false,
            confirmText: "OK",
          });
        }
      },
    });
  };

  /* ============== Sync selectedMonths when Export forces a period ============== */
  useEffect(() => {
    if (!printMode) return;

    // If export forced a month, show only that month
    if (hookMonth !== null && hookMonth !== undefined) {
      setSelectedMonths([Number(hookMonth)]);
      // also ensure year matches forcedYear if provided
      if (forcedYear !== null && forcedYear !== undefined) {
        setYear(Number(forcedYear));
      }
      return;
    }

    // If export forced only a year, select all months for that year
    if (forcedYear !== null && forcedYear !== undefined) {
      setYear(Number(forcedYear));
      setSelectedMonths(Array.from({ length: 12 }, (_, i) => i));
      return;
    }

    // otherwise leave selectedMonths as loaded from DB
  }, [printMode, hookMonth, forcedYear, setYear]);

  /* ================= STYLES (UNCHANGED) ================= */
  const card = { background:"#ecfdf5", padding:18, borderRadius:16, boxShadow:"0 6px 18px rgba(0,0,0,0.12)" };
  const input = { padding:"6px 8px", borderRadius:6, border:"1px solid #9ca3af", fontSize:12, height:20, width:"94%" };
  const inputsmall = { ...input };
  const button = { padding:"7px 14px", background:"#0f766e", color:"#fff", border:"none", borderRadius:6, fontWeight:700, cursor:"pointer", fontSize:12 };
  const tableHeader = { padding:8, borderBottom:"2px solid #a7f3d0", color:"#065f46", fontSize:12, textAlign:"left" };
  const tableCell = { padding:8, borderBottom:"1px solid #e5e7eb", fontSize:12 };

  // NEW: history container style (keeps card fixed, content scrollable)
  const historyContainer = {
    maxHeight: 300, // adjust as you like (px)
    overflow: "auto",
    background: "#ffffff",
    borderRadius: 10,
    padding: 10,
  };

  /* ================= JSX ================= */
  return (
    <div>
      {/* Hidden-scroll CSS: hides scrollbars but preserves scrolling */}
      <style>{`
        /* Firefox */
        .hidden-scroll { scrollbar-width: none; -ms-overflow-style: none; }
        /* Webkit */
        .hidden-scroll::-webkit-scrollbar { display: none; width: 0; height: 0; }
      `}</style>

      <h3 style={{ color: "#065f46", marginBottom: 10 }}>Select Months</h3>

      {/* Hide year/checkbox selectors in export/print mode */}
      {!printMode && (
        <>
          <input
            type="number"
            value={year}
            onChange={(e) => {
              const y = Number(e.target.value);
              // disallow future year input
              if (y <= currentYear) setYear(y);
            }}
            style={{ ...input, width: 120, marginBottom: 12 }}
          />

          <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
            {MONTHS.map((m, i) => (
              <label key={i} style={{ fontSize: 15 }}>
                <input
                  type="checkbox"
                  checked={selectedMonths.includes(i)}
                  onChange={(e) =>
                    setSelectedMonths((p) =>
                      e.target.checked ? [...p, i] : p.filter((x) => x !== i)
                    )
                  }
                />{" "}
                {m}
              </label>
            ))}
          </div>
        </>
      )}

      {/* When in printMode, we still render the month cards (they reflect the forced selection) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill,minmax(300px,1fr))",
          gap: 18,
          marginTop: 22,
        }}
      >
        {selectedMonths.map((m) => {
          const monthKey = `${year}-${String(m + 1).padStart(2, "0")}`;

          // === DEDUPING MERGE: ensure we don't show the same spend twice ===
          const monthlyList = monthlySpends[monthKey] || [];
          const expenseList = expenseSpends[monthKey] || [];

          // Build set of ids that monthly entries already represent.
          // Monthly entries sometimes have a `linkedExpenseId` (preferred) or an `id`.
          const representedExpenseIds = new Set(
            monthlyList.map((ms) => ms.linkedExpenseId || ms.id).filter(Boolean)
          );

          // Also avoid duplicates if a monthly entry uses the same id as an expense entry:
          monthlyList.forEach((ms) => {
            if (ms.id) representedExpenseIds.add(ms.id);
          });

          // Keep monthly entries first, then only include expense entries not represented above.
          const monthSpends = [
            ...monthlyList,
            ...expenseList.filter((e) => !representedExpenseIds.has(e.id)),
          ];

          const spent = monthSpends.reduce((s, i) => s + Number(i.amount), 0);
          const budget = budgets[monthKey] || 0;
          const remaining = budget - spent;
          const percent = budget ? Math.min((spent / budget) * 100, 100) : 0;

          const color =
            percent < 70 ? "#16a34a" : percent < 100 ? "#f59e0b" : "#dc2626";

          // Decide whether to show the date picker restricted to this month:
          const isPastMonth =
            year < currentYear || (year === currentYear && m < currentMonthIndex);

          // compute min/max (ISO) for date input if needed
          const isoMin = `${year}-${String(m + 1).padStart(2,"0")}-01`;
          const lastDay = new Date(year, m + 1, 0).getDate();
          const isoMax = `${year}-${String(m + 1).padStart(2,"0")}-${String(lastDay).padStart(2,"0")}`;

          if (viewMonth === monthKey) {
            return (
              <div key={monthKey} style={card}>
                <div
                  onClick={() => setViewMonth(null)}
                  style={{ cursor: "pointer", fontWeight: 700, color: "#0369a1" }}
                >
                  ← Back
                </div>

                <h4 style={{ color: "#065f46", margin: "10px 0" }}>
                  {MONTHS[m]} {year} – History
                </h4>

                {/* ONLY CHANGE HERE: wrap table in fixed-height scrollable container with hidden bars */}
                <div style={historyContainer} className="hidden-scroll">
                  <table width="100%" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={tableHeader}>S.No</th>
                        <th style={tableHeader}>Catrgory</th>
                        <th style={tableHeader}>Date</th>
                        <th style={tableHeader}>Amount</th>
                        <th style={tableHeader}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {monthSpends.map((h, i) => (
                        <tr key={h.id}>
                          <td style={tableCell}>{i + 1}</td>
                          <td style={tableCell}>{h.name}</td>
                          <td style={tableCell}>{h.date}</td>
                          <td style={tableCell}>₹{h.amount}</td>
                          <td style={tableCell}>
                            <span
                              onClick={() => removeHistory(monthKey, h)}
                              style={{ color:"#dc2626", cursor:"pointer", fontWeight:700 }}
                            >
                              Remove
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            );
          }

          return (
            <div key={monthKey} style={card}>
              <h4 style={{ color: "#065f46", marginBottom: 8 }}>
                {MONTHS[m]} {year}
              </h4>

              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="number"
                  placeholder="Budget ₹"
                  style={input}
                  value={budget}
                  onChange={(e) =>
                    setBudgets({ ...budgets, [monthKey]: e.target.value })
                  }
                />
                <button style={button} onClick={() => saveBudget(monthKey, budget)}>
                  Save
                </button>
              </div>

              {/* ONLY CHANGE: Category dropdown instead of input */}
              <select
                style={{ ...inputsmall, width: "100%", marginTop: 8, height: 32 }}
                value={spendName[monthKey] || ""}
                onChange={(e) =>
                  setSpendName({ ...spendName, [monthKey]: e.target.value })
                }
              >
                <option value="">Select Category</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>

              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input
                  type="number"
                  placeholder="Amount ₹"
                  style={{ ...input, flex: 1 }}
                  value={amount[monthKey] || ""}
                  onChange={(e) =>
                    setAmount({ ...amount, [monthKey]: e.target.value })
                  }
                />
                <button style={button} onClick={() => addSpend(monthKey)}>
                  Add
                </button>
              </div>

              {/* NEW: Date picker for past months (restricted to that month only) */}
              {isPastMonth ? (
                <div style={{ marginTop: 8 }}>
                  <label style={{ fontSize: 12, color: "#065f46", fontWeight:700 }}>
                    Select Date (only {MONTHS[m]} {year})
                  </label>
                  <input
                    type="date"
                    value={selectedDate[monthKey] || ""}
                    min={isoMin}
                    max={isoMax}
                    onChange={(e) => {
                      // clamp for safety (shouldn't be necessary thanks to min/max)
                      const v = e.target.value;
                      if (v < isoMin) return;
                      if (v > isoMax) return;
                      setSelectedDate(sd => ({ ...sd, [monthKey]: v }));
                    }}
                    style={{ ...input, width: "95%", marginTop: 6 }}
                  />
                </div>
              ) : null}

              <p><b>Budget:</b> ₹{budget}</p>
              <p><b>Spent:</b> ₹{spent}</p>
              <p><b>Remaining:</b> <span style={{ color }}>₹{remaining}</span></p>

              <div style={{ height: 10, background: "#e5e7eb", borderRadius: 999 }}>
                <div
                  style={{
                    width: `${percent}%`,
                    height: "100%",
                    background: color,
                    borderRadius: 999,
                  }}
                />
              </div>

              <p style={{ fontWeight: 700, color }}>{percent.toFixed(1)}%</p>

              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <div
                  onClick={() => setViewMonth(monthKey)}
                  style={{
                    flex: 1,
                    padding: "6px",
                    textAlign: "center",
                    background: "#e0f2fe",
                    color: "#075985",
                    borderRadius: "6px",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: "1px solid #38bdf8",
                  }}
                >
                  View
                </div>

                <div
                  onClick={() => deleteMonth(monthKey)}
                  style={{
                    flex: 1,
                    padding: "6px",
                    textAlign: "center",
                    background: "#fee2e2",
                    color: "#7f1d1d",
                    borderRadius: "6px",
                    fontWeight: 700,
                    cursor: "pointer",
                    border: "1px solid #f87171",
                  }}
                >
                  Delete
                </div>
              </div>
            </div>
          );
        })}
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
