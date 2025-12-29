import React, { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, onValue, off } from "firebase/database";
import { FileText, BarChart2, TrendingUp } from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // <<< added

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export default function Analytics({
  forcedMonth = null,
  forcedYear = null,
  printMode = false,
}) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  /* ================= STATES ================= */
  const [categories, setCategories] = useState([]);
  const [expenses, setExpenses] = useState([]);

  const currentYear = new Date().getFullYear();

  // keep the page's own range selectors (user can use them normally)
  const [fromMonth, setFromMonth] = useState("");
  const [fromYear, setFromYear] = useState(currentYear);
  const [toMonth, setToMonth] = useState("");
  const [toYear, setToYear] = useState(currentYear);

  // hook to obtain forced month/year from parent (Export page)
  // It will default to current month/year when not forced.
  const [hookMonth, , hookYear] = useForcedPeriod(forcedMonth, forcedYear);

  /* ================ When in printMode, set the page filters to the forced period ================ */
  useEffect(() => {
    if (printMode) {
      // set to the forced month/year (as strings for select value compatibility)
      setFromMonth(String(hookMonth));
      setFromYear(Number(hookYear));
      setToMonth(String(hookMonth));
      setToYear(Number(hookYear));
    }
    // when not in printMode, do not override user selection
  }, [printMode, hookMonth, hookYear]);

  /* ================= FETCH ================= */
  useEffect(() => {
    if (!user) return;

    const catRef = ref(db, `users/${user.uid}/categories`);
    const expRef = ref(db, `users/${user.uid}/expenses`);

    const catHandler = onValue(catRef, (snap) => {
      const data = snap.val() || {};
      setCategories(Object.entries(data).map(([id, v]) => ({ id, ...v })));
    });

    const expHandler = onValue(expRef, (snap) => {
      const data = snap.val() || {};
      setExpenses(Object.entries(data).map(([id, v]) => ({ id, ...v })));
    });

    return () => {
      off(catRef, "value", catHandler);
      off(expRef, "value", expHandler);
    };
  }, [db, user]);

  /* ================= FILTER EXPENSES ================= */
  const filteredExpenses = useMemo(() => {
    if (fromMonth === "" || toMonth === "") return [];

    const from = new Date(Number(fromYear), Number(fromMonth), 1);
    const to = new Date(Number(toYear), Number(toMonth) + 1, 0, 23, 59, 59);

    return expenses.filter((e) => {
      if (!e.date) return false;
      const [d, m, y] = e.date.split("/");
      const dt = new Date(+y, +m - 1, +d);
      return dt >= from && dt <= to;
    });
  }, [expenses, fromMonth, fromYear, toMonth, toYear]);

  /* ================= CATEGORY TOTALS ================= */
  const categoryTotals = useMemo(() => {
    const map = {};
    let other = 0;

    filteredExpenses.forEach((e) => {
      const amt = Number(e.amount) || 0;
      if (!e.category) return (other += amt);

      const exists = categories.find((c) => c.name === e.category && c.type === "expense");

      if (exists) {
        map[e.category] = (map[e.category] || 0) + amt;
      } else {
        other += amt;
      }
    });

    if (other > 0) map.Other = other;
    return map;
  }, [filteredExpenses, categories]);

  const totalExpense = Object.values(categoryTotals).reduce((a, b) => a + b, 0);
  const topCategory = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1])[0];

  /* ================= MONTH-AWARE CATEGORIES ================= */
  const visibleCategories = useMemo(() => {
    if (fromMonth === "" || toMonth === "") return [];

    return categories.filter((c) => {
      if (c.type !== "expense") return false;

      const catDate = new Date(Number(c.year), Number(c.month) - 1, 1);
      const from = new Date(Number(fromYear), Number(fromMonth), 1);
      const to = new Date(Number(toYear), Number(toMonth) + 1, 0);

      return catDate >= from && catDate <= to;
    });
  }, [categories, fromMonth, toMonth, fromYear, toYear]);

  const hasRealOtherCategory = categories.some((c) => c.name === "Other");

  /* ================= STYLES (UNCHANGED) ================= */
  const page = {
    background: "linear-gradient(135deg,#ecfdf5,#f0fdfa)",
    padding: "26px",
    borderRadius: "18px",
    boxShadow: "0 12px 30px rgba(0,0,0,0.12)",
  };

  const glass = {
    background: "rgba(255,255,255,0.9)",
    borderRadius: "16px",
    padding: "20px",
    boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
  };

  const input = {
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid #9ca3af",
    fontSize: "13px",
  };

  // small helper to render lucide icons robustly (same pattern used on Reports)
  function renderIcon(IconComp, size = 16, style = { marginRight: 8, verticalAlign: "middle" }) {
    try {
      if (!IconComp) return null;
      return React.createElement(IconComp, { size, style });
    } catch (e) {
      return null;
    }
  }

  /* ================= JSX ================= */
  return (
    <div style={page}>
      <h2 style={{ fontWeight: 900, marginBottom: 18, display: "flex", alignItems: "center", gap: 10 }}>
        {renderIcon(FileText, 18)}
        Smart Analytics
      </h2>

      {/* FILTERS — hidden in export (printMode) */}
      {!printMode && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
          <select style={input} value={fromMonth} onChange={(e) => setFromMonth(e.target.value)}>
            <option value="">From Month</option>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>

          <input type="number" style={input} value={fromYear} onChange={(e) => setFromYear(e.target.value)} />

          <select style={input} value={toMonth} onChange={(e) => setToMonth(e.target.value)}>
            <option value="">To Month</option>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>

          <input type="number" style={input} value={toYear} onChange={(e) => setToYear(e.target.value)} />
        </div>
      )}

      {/* 🔒 THESE 3 CARDS ARE UNTOUCHED */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginBottom: 28 }}>
        <div style={{ ...glass, background: "linear-gradient(135deg,#fee2e2,#fecaca)" }}>
          <div style={{ fontWeight: 800 ,color: "#bd2f2fff"}}>Total Expense</div>
          <div style={{ fontSize: 26, fontWeight: 900,color: "#bd2f2fff" }}>₹{totalExpense}</div>
        </div>

        <div style={{ ...glass, background: "linear-gradient(135deg,#e0e7ff,#c7d2fe)" }}>
          <div style={{ fontWeight: 800,color: "#0369a1" }}>Top Category</div>
          <div style={{ fontWeight: 900, color: "#0369a1" }}>{topCategory?.[0] || "—"}</div>
          <div style={{ color: "#0369a1" }}>₹{topCategory?.[1] || 0}</div>
        </div>

        <div style={{ ...glass, background: "linear-gradient(135deg,#d1fae5,#a7f3d0)" }}>
          <div style={{ fontWeight: 800,color: "#064e3b" }}>Categories Used</div>
          <div style={{ fontSize: 26, fontWeight: 900,color: "#064e3b" }}>{Object.keys(categoryTotals).length}</div>
        </div>
      </div>

      {/* ✅ UPDATED LOGIC HERE */}
      <div style={glass}>
        <div style={{ fontWeight: 900, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
          {renderIcon(TrendingUp, 16)}
          Category Spend Intensity
        </div>

        {visibleCategories.map((cat) => {
          const spent = categoryTotals[cat.name] || 0;
          const limit = cat.monthlyLimit;
          const percent = limit
            ? Math.min((spent / limit) * 100, 100)
            : totalExpense
              ? (spent / totalExpense) * 100
              : 0;

          return (
            <div key={cat.id} style={{ marginBottom: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
                <span>{cat.name}</span>
                <span>₹{spent} / {limit ? `₹${limit}` : "∞"}</span>
              </div>
              <div style={{ height: 10, background: "#e5e7eb", borderRadius: 999 }}>
                <div
                  style={{
                    width: `${percent}%`,
                    height: "100%",
                    background: cat.color,
                    borderRadius: 999,
                  }}
                />
              </div>
            </div>
          );
        })}

        {categoryTotals.Other && !hasRealOtherCategory && (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800 }}>
              <span>Other</span>
              <span>₹{categoryTotals.Other}</span>
            </div>
            <div style={{ height: 10, background: "#e5e7eb", borderRadius: 999 }}>
              <div
                style={{
                  width: `${(categoryTotals.Other / (totalExpense || 1)) * 100}%`,
                  height: "100%",
                  background: "#64748b",
                  borderRadius: 999,
                }}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
