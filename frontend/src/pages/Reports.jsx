import React, { useEffect, useMemo, useRef, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, onValue, off } from "firebase/database";
import { FileText, Calendar, BarChart2 } from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // <- follow export-safe pattern

const MONTHS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

const CATEGORY_COLORS = {
  Food: "#f97316",
  Transport: "#3b82f6",
  Shopping: "#a855f7",
  Bills: "#22c55e",
  Entertainment: "#ec4899",
  Other: "#64748b",
};

export default function Reports({ forcedMonth = null, forcedYear = null, printMode = false }) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;
  const printRef = useRef();

  // forced-period hook (follows your Analytics/Recurring pattern)
  const [hookMonth, , hookYear] = useForcedPeriod(forcedMonth, forcedYear);

  const [expenses, setExpenses] = useState([]);
  const [monthlySpends, setMonthlySpends] = useState([]); // <-- spends stored under monthlyBudgets/{key}/spends
  const [filterType, setFilterType] = useState("month");
  const [month, setMonth] = useState(new Date().getMonth());
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthlyBudget, setMonthlyBudget] = useState(0);

  // When in export/print mode, set the page month/year to forced values
  useEffect(() => {
    if (printMode) {
      setMonth(Number(hookMonth));
      setYear(Number(hookYear));
    }
  }, [printMode, hookMonth, hookYear]);

  useEffect(() => {
    if (!user) return;
    const r = ref(db, `users/${user.uid}/expenses`);
    const h = onValue(r, snap => {
      const data = snap.val() || {};
      setExpenses(Object.values(data));
    });
    return () => off(r, "value", h);
  }, [db, user]);

  useEffect(() => {
    if (!user || filterType !== "month") {
      setMonthlyBudget(0);
      setMonthlySpends([]);
      return;
    }
    const key = `${year}-${String(Number(month) + 1).padStart(2, "0")}`;
    const budgetRef = ref(db, `users/${user.uid}/monthlyBudgets/${key}`);
    const h = onValue(budgetRef, snap => {
      const d = snap.val() || {};
      setMonthlyBudget(Number(d.amount || 0));
      // map spends to consistent shape (category, amount, source)
      setMonthlySpends(
        d.spends
          ? Object.values(d.spends).map(v => ({
              ...v,
              category: v.name || v.category || "Other",
              amount: Number(v.amount || 0),
              source: "monthly",
            }))
          : []
      );
    });
    return () => off(budgetRef, "value", h);
  }, [db, user, year, month, filterType]);

  // Robust date parser to handle strings like "dd/mm/yyyy", ISO strings, numeric timestamps, Date objects.
  function safeParseDate(raw) {
    if (!raw && raw !== 0) return null;

    // If it's already a Date
    if (raw instanceof Date) {
      if (!isNaN(raw)) return raw;
      return null;
    }

    // If it's a number (timestamp)
    if (typeof raw === "number") {
      // if it's likely seconds (10 digits) convert to ms
      if (raw < 1e12) return new Date(raw * 1000);
      return new Date(raw);
    }

    // If it's a string
    if (typeof raw === "string") {
      const s = raw.trim();

      // dd/mm/yyyy or d/m/yyyy
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

      // Try numeric string (timestamp)
      const asNum = Number(s);
      if (!Number.isNaN(asNum)) {
        if (asNum < 1e12) return new Date(asNum * 1000);
        return new Date(asNum);
      }

      // Try ISO / Date parser
      const iso = new Date(s);
      if (!isNaN(iso)) return iso;
    }

    // Unknown format
    return null;
  }

  const filteredExpenses = useMemo(() => {
    try {
      return expenses.filter(e => {
        if (!e || e.source === "monthly") return false; // exclude monthly-sourced entries
        if (!e.date && e.date !== 0) return false;

        const parsed = safeParseDate(e.date);
        if (!parsed) return false;

        if (filterType === "month") {
          return parsed.getMonth() === Number(month) && parsed.getFullYear() === Number(year);
        }
        return parsed.getFullYear() === Number(year);
      });
    } catch (err) {
      // In case of any unexpected structure, avoid crashing the component.
      console.error("Reports: error filtering expenses", err);
      return [];
    }
  }, [expenses, filterType, month, year]);

  // combine monthlySpends (from monthlyBudgets/{key}/spends) with filtered regular expenses
  const allSpends = useMemo(() => {
    return [...monthlySpends, ...filteredExpenses];
  }, [monthlySpends, filteredExpenses]);

  const totalExpense = useMemo(
    () => allSpends.reduce((a, b) => a + Number(b.amount || 0), 0),
    [allSpends]
  );

  const usedPercent =
    monthlyBudget > 0 ? Math.min((totalExpense / monthlyBudget) * 100, 100) : 0;

  const remainingBudget = Math.max(monthlyBudget - totalExpense, 0);

  const categoryTotals = useMemo(() => {
    const map = {};
    allSpends.forEach(e => {
      const key = e.category || e.name || "Other";
      map[key] = (map[key] || 0) + Number(e.amount || 0);
    });
    return map;
  }, [allSpends]);

  const pieData = Object.entries(categoryTotals);

  const handlePrint = () => {
    // keep the existing simple print behavior but only enable when not in printMode
    const original = document.body.innerHTML;
    document.body.innerHTML = printRef.current.innerHTML;
    window.print();
    document.body.innerHTML = original;
    window.location.reload();
  };

  const page = {
    padding: 28,
    borderRadius: 20,
    background: "linear-gradient(135deg,#ecfeff,#f0fdf4)",
    boxShadow: "0 14px 40px rgba(0,0,0,0.12)",
  };

  const glass = {
    background: "rgba(255,255,255,0.92)",
    borderRadius: 16,
    padding: 20,
    boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
  };

  const input = {
    padding: "8px 10px",
    borderRadius: 6,
    border: "1px solid #9ca3af",
  };

  let cumulative = 0;
  const gap = 0.012;

  // small helper to robustly render icons like the reference code
  function renderIcon(IconComp, size = 16, style = { marginRight: 8, verticalAlign: "middle" }) {
    try {
      if (!IconComp) return null;
      return React.createElement(IconComp, { size, style });
    } catch (e) {
      return null;
    }
  }

  return (
    <div style={page}>

      {/* ===== INSTRUCTION CARD ===== */}
      <div
        style={{
          background: "#cffafe",
          border: "1px solid #06b6d4",
          padding: "14px 18px",
          borderRadius: "12px",
          marginBottom: "22px",
          color: "#0e7490",
          fontSize: "13px",
          lineHeight: "1.6",
        }}
      >
        <strong>How Reports work:</strong>
        <ul style={{ paddingLeft: "18px", marginTop: "6px" }}>
          <li>Select <strong>Month</strong> or <strong>Year</strong> to filter expenses.</li>
          <li>Only expenses from the selected period are included.</li>
          <li>
            Monthly budget progress appears <strong>only in Month view</strong>.
          </li>
          <li>
            Categories are grouped automatically from your added expenses.
          </li>
          <li>
            Colors match the category colors used across Analytics & Reports.
          </li>
          <li>
            Use <strong>Print / Download PDF</strong> to export this report.
          </li>
        </ul>
      </div>

      {/* CONTROLS - hide interactive controls in printMode */}
      {!printMode && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22, alignItems: "center" }}>
          <select style={{ ...input, height: 36, fontSize: 13, flex: "0 0 auto" }} value={filterType} onChange={e => setFilterType(e.target.value)}>
            <option value="month">Month</option>
            <option value="year">Year</option>
          </select>

          {filterType === "month" && (
            <select
              style={{ ...input, height: 36, fontSize: 13, flex: "0 0 auto" }}
              value={month}
              onChange={e => setMonth(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={i} value={i}>{m}</option>
              ))}
            </select>
          )}

          <input
            type="number"
            style={{ ...input, height: 18, fontSize: 13, width: 80, flex: "0 0 auto" }}
            value={year}
            onChange={e => setYear(Number(e.target.value))}
          />

          <div
            onClick={handlePrint}
            style={{
              marginLeft: "auto",
              padding: "6px 12px",
              height: 36,
              textAlign: "center",
              background: "#e0f2fe",
              color: "#075985",
              borderRadius: "6px",
              fontWeight: 700,
              cursor: "pointer",
              border: "1px solid #38bdf8",
              display: "flex",
              alignItems: "center",
              gap: "6px",
              fontSize: 13,
              whiteSpace: "nowrap",
              flex: "0 0 auto",
            }}
          >
            {renderIcon(FileText, 16)}
            Print / Download PDF
          </div>
        </div>
      )}

      <div ref={printRef}>
        <h2 style={{ fontWeight: 900, marginBottom: 22, display: "flex", alignItems: "center", gap: 10 }}>
          {renderIcon(FileText, 18)}
          Smart Reports
        </h2>

        {/* SUMMARY CARDS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18 }}>
          <div style={{ ...glass, color: "#bd2f2fff",background: "linear-gradient(135deg,#fee2e2,#fecaca)" }}>
            <div style={{ fontWeight: 900 }}>Total Expense</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>₹{totalExpense}</div>
          </div>

          {filterType === "month" && (
            <div style={{ ...glass, color: "#0369a1",background: "linear-gradient(135deg,#e0f2fe,#bae6fd)" }}>
              <div style={{ fontWeight: 900 }}>Monthly Budget</div>
              <div style={{ fontSize: 26, fontWeight: 900 }}>₹{monthlyBudget}</div>
              <div>Used {usedPercent.toFixed(1)}% • Remaining ₹{remainingBudget}</div>
              <div style={{ height: 8, background: "#e5e7eb", borderRadius: 999, marginTop: 8 }}>
                <div
                  style={{
                    width: `${usedPercent}%`,
                    height: "100%",
                    background: usedPercent > 90 ? "#ef4444" : "#22c55e",
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          )}

          {/* CARD 3 FIXED COLOR + BLACK DOTS */}
          <div style={{ ...glass, color: "#064e3b",background: "linear-gradient(135deg,#dcfce7,#bbf7d0)" }}>
            <div style={{ fontWeight: 900 }}>Categories Used</div>
            <div style={{ fontSize: 14, display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
              {pieData.map(([cat]) => (
                <span key={cat} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: "50%",
                      background: "#000",
                    }}
                  />
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* DONUT + DETAILS */}
        <div style={{ ...glass, marginTop: 30 }}>
          <div style={{ fontWeight: 900, marginBottom: 14, display: "flex", alignItems: "center", gap: 8 }}>
            {renderIcon(BarChart2, 16)}
            Expense Distribution
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 24 }}>
            {/* LEFT CATEGORY (BIGGER) -> ALWAYS SHOW ALL CATEGORIES */}
            <div style={{ flex: "0 0 auto" }}>
              <div style={{ fontWeight: 900, marginBottom: 14, fontSize: 16 }}>
                Overall Category
              </div>
              {Object.keys(CATEGORY_COLORS).map((cat) => (
                <div
                  key={cat}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 8,
                    fontSize: 15,
                    fontWeight: 600,
                  }}
                >
                  <span
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: "50%",
                      background: CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other,
                    }}
                  />
                  {cat}
                </div>
              ))}
            </div>

            {/* DONUT */}
            <div style={{ flex: "0 0 auto", display: "flex", justifyContent: "center" }}>
              <svg viewBox="0 0 36 36" width="160" height="160">
                {(() => {
                  cumulative = 0;
                  return pieData.map(([cat, val]) => {
                    const percent = totalExpense ? val / totalExpense : 0;
                    const adjusted = Math.max(percent - gap, 0);
                    const dash = `${adjusted * 100} ${100 - adjusted * 100}`;
                    const offset = cumulative * 100;
                    cumulative += percent;

                    return (
                      <circle
                        key={cat}
                        cx="18"
                        cy="18"
                        r="15"
                        fill="none"
                        strokeWidth="5"
                        strokeDasharray={dash}
                        strokeDashoffset={-offset}
                        stroke={CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other}
                      />
                    );
                  });
                })()}
              </svg>
            </div>

            {/* RIGHT DETAILS -> USED ONLY */}
            <div style={{ flex: "1 1 160px", minWidth: 140 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, marginBottom: 8 }}>
                <span style={{ color: "#2563eb" }}>CATEGORY</span>
                <span style={{ color: "#16a34a" }}>TOTAL</span>
              </div>

              {pieData.map(([cat, val]) => (
                <div
                  key={cat}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginTop: 8,
                    fontSize: 13,
                    color: "#111827",
                  }}
                >
                  <span>{cat}</span>
                  <span>₹{val}</span>
                </div>
              ))}
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
