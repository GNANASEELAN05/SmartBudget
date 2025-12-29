import React, { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, onValue, off } from "firebase/database";
import { Target, CreditCard, Wallet } from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // <-- added

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export default function BudgetsOverview({
  forcedMonth = null,
  forcedYear = null,
  printMode = false,
}) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  // Use forcedPeriod hook so Export page can control the period while
  // keeping the page behavior identical otherwise.
  const [month, setMonth, year, setYear] = useForcedPeriod(forcedMonth, forcedYear);

  const [monthlyBudget, setMonthlyBudget] = useState(null);

  // categories (user-defined) to get color and monthlyLimit
  const [categories, setCategories] = useState([]);

  // externalSpends holds expenses coming from /users/{uid}/expenses (AddExpense page)
  const [externalSpends, setExternalSpends] = useState([]);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  /* ================= FIREBASE: monthly budget ================= */
  useEffect(() => {
    if (!user) return;

    const refPath = ref(db, `users/${user.uid}/monthlyBudgets/${monthKey}`);
    const handler = onValue(refPath, (snap) => {
      setMonthlyBudget(snap.val() || null);
    });

    return () => off(refPath, "value", handler);
  }, [db, user, monthKey]);

  /* ================= FIREBASE: external expenses (AddExpense page) =================
     We listen to /users/{uid}/expenses and pick items that belong to the currently
     selected month/year and were created via AddExpense (source !== "monthly").
     This ensures BudgetsOverview picks up expenses that were added from AddExpense
     even if monthlyBudgets wasn't updated for some reason.
  */
  useEffect(() => {
    if (!user) return;
    const expensesRef = ref(db, `users/${user.uid}/expenses`);

    const handler = onValue(expensesRef, (snap) => {
      const data = snap.val() || {};

      const list = Object.entries(data)
        .map(([id, v]) => {
          // Normalize date: prefer dateISO (yyyy-mm-dd) then date (dd/mm/yyyy)
          let y = null;
          let m = null;
          if (v.dateISO) {
            const d = new Date(v.dateISO);
            if (!isNaN(d)) {
              y = d.getFullYear();
              m = d.getMonth() + 1;
            }
          } else if (v.date && typeof v.date === "string" && v.date.includes("/")) {
            // dd/mm/yyyy
            const parts = v.date.split("/");
            if (parts.length === 3) {
              const [dd, mm, yy] = parts;
              y = Number(yy);
              m = Number(mm);
            }
          }
          return {
            id,
            ...v,
            _year: y,
            _month: m,
          };
        })
        // keep only items that have a year/month and match selected month/year
        .filter((e) => e._year === Number(year) && e._month === month + 1)
        // keep only items that are NOT the monthly-page spends (i.e. source !== "monthly")
        .filter((e) => (e.source || "") !== "monthly")
        // map so shape matches monthlyBudgets entries as much as possible
        .map((e) => ({
          id: e.id,
          name: e.category || e.name || "Other",
          category: e.category || e.name || "Other",
          amount: Number(e.amount || 0),
          date: e.date || (e.dateISO ? (() => {
            const d = new Date(e.dateISO);
            const dd = String(d.getDate()).padStart(2, "0");
            const mm = String(d.getMonth() + 1).padStart(2, "0");
            const yy = d.getFullYear();
            return `${dd}/${mm}/${yy}`;
          })() : ""),
          source: e.source || "expense",
        }));

      setExternalSpends(list);
    });

    return () => off(expensesRef, "value", handler);
  }, [db, user, month, year]);

  /* ================= FIREBASE: categories (to fetch color & limits) ================= */
  useEffect(() => {
    if (!user) return;

    const catRef = ref(db, `users/${user.uid}/categories`);
    const catHandler = onValue(catRef, (snap) => {
      const data = snap.val() || {};
      // convert to array with id
      const list = Object.entries(data).map(([id, v]) => ({ id, ...v }));
      setCategories(list);
    });

    return () => off(catRef, "value", catHandler);
  }, [db, user]);

  /* ================= DATA ================= */
  // raw spends stored under monthlyBudgets/{monthKey}/spends
  // Merge monthlyBudget.spends with externalSpends; dedupe by id / linkedExpenseId
  const spends = useMemo(() => {
    const base = Object.values(monthlyBudget?.spends || {}).map((s) => {
      // normalize: ensure amount is number, preserve id/linkage
      return {
        id: s.id || s.linkedExpenseId || null,
        name: s.name || s.category || "Other",
        category: s.category || s.name || s.name || "Other",
        amount: Number(s.amount || 0),
        date: s.date || s.dateDMY || s.dateISO || "",
        linkedExpenseId: s.linkedExpenseId || null,
        source: "monthly",
      };
    });

    // build set of ids already present (prefer id then linkedExpenseId)
    const present = new Set();
    base.forEach((b) => {
      if (b.id) present.add(b.id);
      if (b.linkedExpenseId) present.add(b.linkedExpenseId);
    });

    // include externalSpends only if not already present
    const extras = (externalSpends || [])
      .filter((e) => {
        // e.id is the /expenses key
        if (!e.id) return true;
        return !present.has(e.id);
      })
      .map((e) => ({
        id: e.id || null,
        name: e.name || e.category || "Other",
        category: e.category || e.name || "Other",
        amount: Number(e.amount || 0),
        date: e.date || "",
        source: e.source || "expense",
      }));

    return [...base, ...extras];
  }, [monthlyBudget, externalSpends]);

  const totalAllocated = Number(monthlyBudget?.amount || 0);
  const totalSpent = useMemo(
    () => spends.reduce((s, e) => s + Number(e.amount || 0), 0),
    [spends]
  );

  const remaining = Math.max(totalAllocated - totalSpent, 0);
  const percentUsed = totalAllocated
    ? Math.min(Math.round((totalSpent / totalAllocated) * 100), 100)
    : 0;

  const status =
    percentUsed < 70 ? "Healthy" : percentUsed < 90 ? "At Risk" : "Exceeded";

  /* ================ categoryTotals (group spends by category name) ================ */
  const categoryTotals = useMemo(() => {
    const map = {};
    spends.forEach((s) => {
      // prefer category first (s.category/name)
      const name = s.category || s.name || "Other";
      map[name] = (map[name] || 0) + Number(s.amount || 0);
    });
    return map; // { 'Food': 1234, 'Bills': 2000, ... }
  }, [spends]);

  /* Build display list for category cards:
     - Try to find user-defined category for this name limited to this month/year (month-aware categories)
     - If found, take color & monthlyLimit. If not found, fallback color & no allocated.
  */
  const categoryDisplay = useMemo(() => {
    const list = [];
    Object.entries(categoryTotals).forEach(([name, spentAmount]) => {
      // find category entry for this month/year with matching name and type expense
      const found = categories.find(
        (c) =>
          c.name === name &&
          c.type === "expense" &&
          Number(c.month) === month + 1 &&
          Number(c.year) === Number(year)
      );

      const allocated = found?.monthlyLimit ? Number(found.monthlyLimit) : null;
      const color = found?.color || "#64748b"; // fallback gray
      const percent = allocated
        ? Math.min(Math.round((spentAmount / allocated) * 100), 100)
        : totalAllocated
        ? Math.min(Math.round((spentAmount / totalAllocated) * 100), 100)
        : 0;

      const status =
        percent < 80 ? "Healthy" : percent < 100 ? "At Risk" : "Exceeded";

      list.push({
        name,
        spent: spentAmount,
        allocated,
        color,
        percent,
        status,
      });
    });

    return list;
  }, [categoryTotals, categories, month, year, totalAllocated]);

  /* ================= UI ================= */
  return (
    <div
      style={{
        padding: 28,
        borderRadius: 22,
        background: "linear-gradient(135deg,#f0fdfa,#ecfeff)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: 20 }}>
        <h2
          style={{
            fontWeight: 900,
            fontSize: 26,
            color: "#065f46",
          }}
        >
          🥧 Budgets Overview
        </h2>

        <p
          style={{
            opacity: 0.75,
            fontWeight: 600,
            color: "#064e3b",
          }}
        >
          Budget performance for <b>{MONTHS[month]} {year}</b>
        </p>
      </div>

      {/* MONTH / YEAR */}
      {!printMode && (
        <div
          style={{
            display: "flex",
            gap: 14,
            marginBottom: 26,
            flexWrap: "wrap",
          }}
        >
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            style={{
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 700,
            }}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>
                {m}
              </option>
            ))}
          </select>

          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{
              width: 120,
              padding: "10px 14px",
              borderRadius: 12,
              fontWeight: 700,
            }}
          />

          <div
            style={{
              padding: "10px 16px",
              borderRadius: 999,
              background: "#dcfce7",
              color: "#166534",
              fontWeight: 800,
            }}
          >
            {status}
          </div>
        </div>
      )}

      {/* SUMMARY CARDS */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))",
          gap: 18,
          marginBottom: 26,
        }}
      >
        <Card label="Total Budget" value={`₹${totalAllocated}`} icon={Target} />
        <Card label="Spent" value={`₹${totalSpent}`} icon={CreditCard} />
        <Card label="Remaining" value={`₹${remaining}`} icon={Wallet} />
      </div>

      {/* PROGRESS */}
      <div
        style={{
          padding: 20,
          borderRadius: 18,
          background: "rgba(255,255,255,0.95)",
          boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
          marginBottom: 26,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 8,
            fontWeight: 800,
          }}
        >
          <span>Budget Usage</span>
          <span>{percentUsed}%</span>
        </div>

        <div
          style={{
            height: 12,
            borderRadius: 999,
            background: "#e5e7eb",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              width: `${percentUsed}%`,
              height: "100%",
              background:
                status === "Healthy"
                  ? "#22c55e"
                  : status === "At Risk"
                  ? "#f59e0b"
                  : "#ef4444",
            }}
          />
        </div>
      </div>

      {/* ================= UPDATED: CATEGORY CARDS (Monthly Spends rendered as category budget cards) ================= */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: 18,
          marginBottom: 26,
        }}
      >
        {categoryDisplay.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: 18,
              borderRadius: 12,
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
              fontWeight: 700,
              opacity: 0.8,
            }}
          >
            No category spends recorded for this month
          </div>
        )}

        {categoryDisplay.map((b) => (
          <div
            key={b.name}
            style={{
              padding: 18,
              borderRadius: 18,
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
              borderLeft: `6px solid ${b.color}`,
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginBottom: 6,
              }}
            >
              <div style={{ fontWeight: 900, color: "#064e3b" }}>{b.name}</div>

              <span
                style={{
                  fontSize: 12,
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontWeight: 800,
                  background:
                    b.status === "Healthy"
                      ? "#dcfce7"
                      : b.status === "At Risk"
                      ? "#fef3c7"
                      : "#fee2e2",
                  color:
                    b.status === "Healthy"
                      ? "#166534"
                      : b.status === "At Risk"
                      ? "#92400e"
                      : "#7f1d1d",
                }}
              >
                {b.status}
              </span>
            </div>

            <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }}>
              {b.allocated ? `₹${b.spent} spent of ₹${b.allocated}` : `₹${b.spent} spent`}
            </div>

            <div
              style={{
                marginTop: 10,
                height: 10,
                borderRadius: 999,
                background: "#e5e7eb",
                overflow: "hidden",
              }}
            >
              <div
                style={{
                  width: `${b.percent}%`,
                  height: "100%",
                  background: b.color,
                  borderRadius: 999,
                }}
              />
            </div>

            <div
              style={{
                fontSize: 12,
                opacity: 0.65,
                marginTop: 6,
                fontWeight: 700,
              }}
            >
              {b.percent}% used
            </div>
          </div>
        ))}
      </div>

      {/* FOOTER */}
      <div
        style={{
          marginTop: 30,
          padding: 18,
          borderRadius: 16,
          background: "rgba(255,255,255,0.95)",
          boxShadow: "0 8px 22px rgba(0,0,0,0.12)",
          fontWeight: 700,
          textAlign: "center",
          color: "#064e3b",
        }}
      >
        📌 Tip: Reducing overspent categories early helps maintain savings goals
      </div>
    </div>
  );
}

/* ================= SMALL CARD ================= */
function Card({ label, value, icon }) {
  // default resolver (lucide icons) based on label keywords
  function getDefaultIconByLabel(lbl) {
    const l = (lbl || "").toLowerCase();
    if (l.includes("budget") || l.includes("total") || l.includes("target")) return Target;
    if (l.includes("spent") || l.includes("expense") || l.includes("used")) return CreditCard;
    if (l.includes("remaining") || l.includes("left") || l.includes("savings")) return Wallet;
    return Target;
  }

  let iconNode = null;

  // If a Lucide component was passed (function), render it
  if (typeof icon === "function") {
    const IconComp = icon;
    iconNode = <IconComp size={22} />;
  } else if (React.isValidElement(icon)) {
    iconNode = icon;
  } else {
    const DefaultIcon = getDefaultIconByLabel(label);
    iconNode = <DefaultIcon size={22} />;
  }

  return (
    <div
      style={{
        padding: 20,
        borderRadius: 18,
        background: "rgba(255,255,255,0.95)",
        boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
      }}
    >
      <div style={{ fontSize: 22 }}>{iconNode}</div>
      <div style={{ fontSize: 24, fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 700 }}>
        {label}
      </div>
    </div>
  );
}
