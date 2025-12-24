import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, onValue, remove, off } from "firebase/database";

import useForcedPeriod from "../hooks/useForcedPeriod"; // <-- added

export default function ExpenseList({
  forcedMonth = null,
  forcedYear = null,
  printMode = false,
}) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  const [expenses, setExpenses] = useState([]);

  /* ================= FILTER STATES ================= */
  const [filterType, setFilterType] = useState("all");
  const [category, setCategory] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  // hook to read forced period from parent (Export page)
  // returns [month, setMonth, year, setYear]
  const [hookMonth, , hookYear] = useForcedPeriod(forcedMonth, forcedYear);

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

  /* ================ HELPERS ================= */
  // Detect expenses that originated from the Scheduled Bills page.
  // Defensive: check common possible field names and values.
  const isScheduledExpense = (exp) => {
    if (!exp) return false;
    try {
      const src = exp.source || exp.addedFrom || exp.origin || "";
      if (
        (typeof src === "string" && src.toLowerCase().includes("sched")) ||
        (typeof src === "string" && src.toLowerCase().includes("bill") && src.toLowerCase().includes("sched"))
      ) {
        return true;
      }
      if (exp.isScheduled === true) return true;
      if (exp.fromScheduled === true) return true;
      if (exp.scheduledId) return true;
      if (exp.linkedScheduledId) return true;
      // some implementations might set a flag like exp.billPage = true
      if (exp.billPage === true) return true;
      // fallback: if there is a field named `type` with value 'scheduled' or 'bill-scheduled'
      if (typeof exp.type === "string" && exp.type.toLowerCase().includes("sched")) return true;
    } catch (e) {
      // if anything odd happens, don't treat as scheduled
      console.error("isScheduledExpense check error", e);
    }
    return false;
  };

  // Parse many possible date formats to a Date instance (or null)
  const parseToDate = (d) => {
    if (!d && d !== 0) return null;

    // if it's already a number (timestamp ms)
    if (typeof d === "number") {
      const dt = new Date(d);
      return isNaN(dt.getTime()) ? null : dt;
    }

    // firebase timestamp object { seconds, nanoseconds }?
    if (typeof d === "object" && d !== null && ("seconds" in d || "nanoseconds" in d)) {
      try {
        if (typeof d.seconds === "number") return new Date(d.seconds * 1000);
      } catch (e) {
        return null;
      }
    }

    if (typeof d === "string") {
      // if already dd/mm/yyyy
      if (d.includes("/")) {
        const parts = d.split("/");
        if (parts.length === 3) {
          const dd = Number(parts[0]);
          const mm = Number(parts[1]);
          const yyyy = Number(parts[2]);
          if (!Number.isNaN(dd) && !Number.isNaN(mm) && !Number.isNaN(yyyy)) {
            const dt = new Date(yyyy, mm - 1, dd);
            return isNaN(dt.getTime()) ? null : dt;
          }
        }
      }

      // numeric string timestamp (ms)
      const asNum = Number(d);
      if (!Number.isNaN(asNum)) {
        const dt = new Date(asNum);
        if (!isNaN(dt.getTime())) return dt;
      }

      // try Date.parse for ISO strings (handles yyyy-mm-dd)
      const parsed = Date.parse(d);
      if (!Number.isNaN(parsed)) {
        const dt = new Date(parsed);
        return isNaN(dt.getTime()) ? null : dt;
      }
    }

    return null;
  };

  // Format to dd/mm/yyyy (fallback to raw value)
  const formatDisplayDate = (d) => {
    const dt = parseToDate(d);
    if (!dt) {
      // final fallback: show original value as string (or '-')
      return d ? String(d) : "-";
    }
    const dd = String(dt.getDate()).padStart(2, "0");
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const yyyy = dt.getFullYear();
    return `${dd}/${mm}/${yyyy}`;
  };

  // Improved safeGetTime: accepts either a raw date or an expense object
  const safeGetTime = (val) => {
    if (!val) return null;
    // If expense-like object passed, try its date fields
    if (typeof val === "object" && val !== null && (val.date || val.dateISO || val.dateDMY)) {
      const candidate = val.date || val.dateISO || val.dateDMY;
      const dt = parseToDate(candidate);
      return dt ? dt.getTime() : null;
    }
    // otherwise val is a raw date-like value
    const dt = parseToDate(val);
    return dt ? dt.getTime() : null;
  };

  /* ================= FETCH EXPENSES ================= */
  useEffect(() => {
    if (!user) return;

    const expensesRef = ref(db, `users/${user.uid}/expenses`);
    const handler = onValue(expensesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data)
        .map(([id, val]) => ({ id, ...val }))
        // exclude scheduled-bills-originated entries
        .filter((exp) => !isScheduledExpense(exp))
        // sort by createdAt (defensive if createdAt can be string / number / timestamp)
        .sort((a, b) => {
          const aTime =
            a?.createdAt && !Number.isNaN(Number(a.createdAt))
              ? Number(a.createdAt)
              : safeGetTime(a) || 0;
          const bTime =
            b?.createdAt && !Number.isNaN(Number(b.createdAt))
              ? Number(b.createdAt)
              : safeGetTime(b) || 0;
          return bTime - aTime;
        });

      setExpenses(list);
    });

    // cleanup
    return () => off(expensesRef, "value", handler);
  }, [db, user]);

  /* ================= When in printMode, sync date filters to forced period ================= */
  useEffect(() => {
    if (!printMode) return;
    // Force page into date-filter mode and set from/to bounds based on forced period
    setFilterType("date");

    // forcedMonth is 0..11; forcedYear is a number
    if (hookMonth !== null && hookMonth !== undefined && hookYear !== null && hookYear !== undefined) {
      const y = Number(hookYear);
      const m = Number(hookMonth) + 1; // 1..12
      const pad = (n) => String(n).padStart(2, "0");
      const from = `${y}-${pad(m)}-01`;
      const lastDay = new Date(y, m, 0).getDate(); // day-of-month
      const to = `${y}-${pad(m)}-${pad(lastDay)}`;
      setFromDate(from);
      setToDate(to);
    } else if (hookYear !== null && hookYear !== undefined) {
      // fallback: whole year
      const y = Number(hookYear);
      setFromDate(`${y}-01-01`);
      setToDate(`${y}-12-31`);
    } else {
      // if no forced info, clear explicit date bounds so page behaves normally but still hides UI
      setFromDate("");
      setToDate("");
    }
  }, [printMode, hookMonth, hookYear]);

  /* ================= FILTER LOGIC ================= */
  const filteredExpenses = expenses.filter((exp) => {
    if (filterType === "category" && category) {
      return exp.category === category;
    }

    if (filterType === "payment" && paymentMode) {
      return exp.paymentMode === paymentMode;
    }

    if (filterType === "date") {
      const expTime = safeGetTime(exp);
      // if user selected from/to dates they are in yyyy-mm-dd format
      const from = fromDate ? new Date(fromDate) : null;
      const to = toDate ? new Date(toDate) : null;

      // normalize bounds
      const fromTime = from ? new Date(from.setHours(0, 0, 0, 0)).getTime() : null;
      const toTime = to ? new Date(to.setHours(23, 59, 59, 999)).getTime() : null;

      // if exp has no parseable date, we exclude it when a filter is applied (safer)
      if (expTime === null) return false;
      if (fromTime && expTime < fromTime) return false;
      if (toTime && expTime > toTime) return false;
      return true;
    }

    if (filterType === "amount") {
      if (minAmount && Number(exp.amount) < Number(minAmount)) return false;
      if (maxAmount && Number(exp.amount) > Number(maxAmount)) return false;
      return true;
    }

    return true;
  });

  /* ================= DELETE ================= */
  const handleDelete = async (id) => {
    // open confirmation modal instead of window.confirm
    openModal({
      title: "Delete expense",
      message: "Are you sure you want to delete this expense? This action cannot be undone.",
      showCancel: true,
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          // 1) remove the expense itself
          await remove(ref(db, `users/${user.uid}/expenses/${id}`));

          // 2) scan monthlyBudgets for any spend that links to this expense and remove it
          const mbRef = ref(db, `users/${user.uid}/monthlyBudgets`);
          const handler = onValue(mbRef, (snap) => {
            const data = snap.val() || {};
            Object.entries(data).forEach(([monthKey, monthObj]) => {
              const spends = monthObj?.spends || {};
              Object.entries(spends).forEach(([spendId, spendObj]) => {
                if (spendObj && spendObj.linkedExpenseId === id) {
                  // remove the spend node that linked to this expense
                  remove(ref(db, `users/${user.uid}/monthlyBudgets/${monthKey}/spends/${spendId}`))
                    .catch((err) => {
                      // log but continue
                      console.error("Failed to remove linked monthly spend:", err);
                    });
                }
              });
            });

            // detach the one-time listener
            off(mbRef, "value", handler);
          });

          closeModal();
        } catch (err) {
          console.error(err);
          closeModal();
          // replace alert with modal
          openModal({
            title: "Delete failed",
            message: "Failed to delete expense. See console for details.",
            showCancel: false,
            confirmText: "OK",
          });
        }
      },
    });
  };

  /* ================= STYLES ================= */
  const input = {
    padding: "6px 10px",
    borderRadius: "6px",
    border: "1px solid #9ca3af",
    fontSize: "13px",
  };

  const card = {
    background: "#e6f7ef", // darker card
    padding: "22px",
    borderRadius: "12px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.1)",
  };

  const tableHeader = {
    padding: "10px",
    color: "#065f46",
    fontWeight: 700,
    fontSize: "14px",
    borderBottom: "2px solid #86efac",
  };

  const tableCell = {
    padding: "10px",
    fontSize: "13px",
    textAlign: "center",
    borderBottom: "1px solid #86efac",
  };

  /* ================= JSX ================= */
  return (
    <div style={card}>
      {/* HEADER + FILTER */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "16px",
        }}
      >
        <h3 style={{ color: "#065f46" }}>Expenses</h3>

        {/* HIDE all filter controls in export/print mode */}
        {!printMode && (
          <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
            <select
              style={input}
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setCategory("");
                setPaymentMode("");
                setFromDate("");
                setToDate("");
                setMinAmount("");
                setMaxAmount("");
              }}
            >
              <option value="all">All</option>
              <option value="category">Category</option>
              <option value="payment">Payment Mode</option>
              <option value="date">Date</option>
              <option value="amount">Amount</option>
            </select>

            {filterType === "category" && (
              <select
                style={input}
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">Select</option>
                <option>Food</option>
                <option>Transport</option>
                <option>Shopping</option>
                <option>Bills</option>
                <option>Entertainment</option>
                <option>Other</option>
              </select>
            )}

            {filterType === "payment" && (
              <select
                style={input}
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value)}
              >
                <option value="">Select</option>
                <option>Cash</option>
                <option>UPI</option>
                <option>Card</option>
                <option>Net Banking</option>
              </select>
            )}

            {filterType === "date" && (
              <>
                <input
                  type="date"
                  style={input}
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                />
                <input
                  type="date"
                  style={input}
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                />
              </>
            )}

            {filterType === "amount" && (
              <>
                <input
                  type="number"
                  placeholder="From"
                  style={input}
                  value={minAmount}
                  onChange={(e) => setMinAmount(e.target.value)}
                />
                <input
                  type="number"
                  placeholder="To"
                  style={input}
                  value={maxAmount}
                  onChange={(e) => setMaxAmount(e.target.value)}
                />
              </>
            )}
          </div>
        )}
      </div>

      {/* TABLE */}
      <table width="100%" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#bbf7d0" }}>
            <th style={tableHeader}>S.No</th>
            <th style={tableHeader}>Category</th>
            <th style={tableHeader}>Date</th>
            <th style={tableHeader}>Payment</th>
            <th style={tableHeader}>Note</th>
            <th style={tableHeader}>Amount</th>
            <th style={tableHeader}>Action</th>
          </tr>
        </thead>

        <tbody>
          {filteredExpenses.length === 0 ? (
            <tr>
              <td colSpan="7" style={{ padding: "16px", textAlign: "center" }}>
                No expenses found
              </td>
            </tr>
          ) : (
            filteredExpenses.map((exp, i) => (
              <tr key={exp.id}>
                <td style={tableCell}>{i + 1}</td>
                <td style={tableCell}>{exp.category}</td>
                <td style={tableCell}>{formatDisplayDate(exp.date || exp.dateDMY || exp.dateISO)}</td>
                <td style={tableCell}>{exp.paymentMode || "-"}</td>
                <td style={tableCell}>{exp.note || "-"}</td>
                <td
                  style={{
                    ...tableCell,
                    color: "#b91c1c",
                    fontWeight: 700,
                  }}
                >
                  ₹{exp.amount}
                </td>

                {/* ACTION */}
                <td style={tableCell}>
                  <span
                    onClick={() => handleDelete(exp.id)}
                    style={{
                      padding: "6px 12px",
                      background: "#fecaca",
                      color: "#7f1d1d",
                      borderRadius: "6px",
                      fontWeight: 700,
                      cursor: "pointer",
                      border: "1px solid #f87171",
                      display: "inline-block",
                      transition: "all 0.2s ease",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#fca5a5";
                      e.currentTarget.style.color = "#7f1d1d";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "#fecaca";
                      e.currentTarget.style.color = "#7f1d1d";
                    }}
                  >
                    Delete
                  </span>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

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
