import React, { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, onValue, off } from "firebase/database";
import { Repeat, Calendar, CreditCard } from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // added to follow export pattern

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export default function Recurring({ forcedMonth = null, forcedYear = null, printMode = false }) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  // hook to resolve forced period (follows Analytics pattern)
  const [hookMonth, , hookYear] = useForcedPeriod(forcedMonth, forcedYear);

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [monthlyBudget, setMonthlyBudget] = useState(null);

  // NEW: fallback spends from /users/{uid}/expenses (used when monthlyBudgets entry missing)
  const [fallbackSpends, setFallbackSpends] = useState([]);

  // when in export/print mode, set the page month/year to forced values
  useEffect(() => {
    if (printMode) {
      setMonth(Number(hookMonth));
      setYear(Number(hookYear));
    }
    // when not printMode, user selection remains untouched
  }, [printMode, hookMonth, hookYear]);

  const monthKey = `${year}-${String(month + 1).padStart(2, "0")}`;

  /* ================= FIREBASE: SAME AS BUDGETS OVERVIEW ================= */
  useEffect(() => {
    if (!user) return;

    const refPath = ref(db, `users/${user.uid}/monthlyBudgets/${monthKey}`);
    const handler = (snap) => {
      setMonthlyBudget(snap.val() || null);
    };

    onValue(refPath, handler, (err) => {
      console.error("monthlyBudgets listen err", err);
    });

    return () => {
      try { off(refPath, "value", handler); } catch (e) {}
    };
  }, [db, user, monthKey]);

  /* ================= FALLBACK: READ RAW /expenses FOR SELECTED MONTH ================= */
  // helper: convert ISO (yyyy-mm-dd) -> "YYYY-MM"
  const getMonthKeyFromISO = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (isNaN(d)) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
  };

  // helper: convert dd/mm/yyyy -> "YYYY-MM" (used for legacy date fields)
  const getMonthKeyFromDMY = (dmy) => {
    if (!dmy || typeof dmy !== "string") return null;
    const parts = dmy.split("/");
    if (parts.length !== 3) return null;
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!user) return;

    const expensesRef = ref(db, `users/${user.uid}/expenses`);

    const listener = onValue(
      expensesRef,
      (snap) => {
        const data = snap.val() || {};
        const list = Object.entries(data).map(([id, val]) => {
          // normalize fields similar to AddExpense page
          const dateISO = val.dateISO || (val.date && val.date.includes("/") ? (() => {
            // convert dd/mm/yyyy -> yyyy-mm-dd for safe ISO parsing
            const parts = val.date.split("/");
            if (parts.length !== 3) return null;
            const [dd, mm, yyyy] = parts;
            return `${yyyy}-${mm.padStart(2,"0")}-${dd.padStart(2,"0")}`;
          })() : null) || null;

          const dateDMY =
            val.dateDMY ||
            (val.date && typeof val.date === "string" && val.date.includes("/") ? val.date : null) ||
            (dateISO ? (() => {
              const d = new Date(dateISO);
              if (isNaN(d)) return "";
              const day = String(d.getDate()).padStart(2, "0");
              const monthN = String(d.getMonth() + 1).padStart(2, "0");
              const yearN = d.getFullYear();
              return `${day}/${monthN}/${yearN}`;
            })() : "");

          return {
            id,
            ...val,
            dateISO,
            dateDMY,
            date: val.date || dateDMY || "",
            amount: Number(val.amount || 0),
            category: val.category || "Other",
            name: val.name || val.merchant || val.note || "Unnamed",
            createdAt: val.createdAt || 0,
            source: val.source || null,
          };
        })
        // filter to selected month
        .filter((s) => {
          // Prefer explicit date fields; fall back to createdAt timestamp if date fields missing.
          const keyFromISO = s.dateISO ? getMonthKeyFromISO(s.dateISO) : null;
          const keyFromDMY = s.date ? getMonthKeyFromDMY(s.date) : null;

          // NEW: if neither dateISO nor date (DMY) present, fall back to createdAt to derive month.
          const keyFromCreatedAt = s.createdAt
            ? (() => {
                const d = new Date(s.createdAt);
                if (isNaN(d)) return null;
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, "0");
                return `${y}-${m}`;
              })()
            : null;

          const k = keyFromISO || keyFromDMY || keyFromCreatedAt;
          return k === monthKey;
        });

        setFallbackSpends(list);
      },
      (err) => console.error("expenses listen err", err)
    );

    return () => {
      try { off(expensesRef, "value", listener); } catch (e) {}
    };
  }, [db, user, monthKey]);

  /* ================= RAW MONTHLY SPENDS ================= */
  // Merge canonical monthlyBudgets data with raw expenses; dedupe so we don't double-count
  const spends = useMemo(() => {
    const monthlyObj = monthlyBudget?.spends || {};
    // normalize monthly spends into an array with predictable shape
    const monthlyList = Object.entries(monthlyObj).map(([id, v]) => ({
      id,
      name: v.name || v.category || v.title || "Unnamed",
      category: v.category || v.name || "Other",
      amount: Number(v.amount || 0),
      date: v.date || "",
      linkedExpenseId: v.linkedExpenseId || null,
      source: "monthly",
    }));

    // Build set of represented expense ids (prefer linkedExpenseId, else monthly id)
    const representedExpenseIds = new Set(
      monthlyList
        .map((m) => (m.linkedExpenseId ? m.linkedExpenseId : m.id))
        .filter(Boolean)
    );

    // include fallback expenses that aren't represented by monthly entries
    const extraFromExpenses = fallbackSpends.filter((e) => !representedExpenseIds.has(e.id));

    // combine monthly entries first, then the extra raw expenses
    return [...monthlyList, ...extraFromExpenses];
  }, [monthlyBudget, fallbackSpends]);

  /* ================= RECURRING DETECTION (MONTH-BASED) ================= */
  const recurringItems = useMemo(() => {
    const map = {};

    // GROUP BY CANONICAL CATEGORY (normalise category/name differences)
    spends.forEach((s) => {
      // derive a canonical category value from available fields
      const rawCategory = (s.category || s.name || "Other");
      const key = String(rawCategory).trim().toLowerCase(); // grouping key
      const display = String(rawCategory).trim(); // display label (preserve case as-is)

      if (!map[key]) {
        map[key] = {
          name: display,
          category: display,
          amount: 0,
          count: 0,
          date: s.date,
        };
      }

      map[key].amount += Number(s.amount || 0);
      map[key].count += 1;
    });

    // recurring = appears more than once in the month
    return Object.values(map).filter((r) => r.count >= 2);
  }, [spends]);

  /* ================= SUMMARY ================= */
  const activeRecurring = recurringItems.length;
  const monthlyImpact = recurringItems.reduce(
    (s, r) => s + r.amount,
    0
  );

  /* ================= UI (UNCHANGED except icons + printMode gating) ================= */
  return (
    <div
      style={{
        padding: 28,
        borderRadius: 22,
        background: "linear-gradient(135deg,#ecfeff,#f0fdfa)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
      }}
    >
      {/* HEADER */}
      <div style={{ marginBottom: 26 }}>
        <h2
          style={{
            fontWeight: 900,
            fontSize: 26,
            color: "#065f46",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Repeat size={20} />
          Recurring Payments
        </h2>

        <p
          style={{
            opacity: 0.75,
            maxWidth: 600,
            marginTop: 6,
            color: "#064e3b",
            lineHeight: 1.6,
            fontWeight: 600,
          }}
        >
          Automatically detected recurring expenses for{" "}
          <b>{MONTHS[month]} {year}</b>
        </p>
      </div>

      {/* MONTH / YEAR - HIDE SELECTORS IN PRINT MODE */}
      {!printMode && (
        <div style={{ display: "flex", gap: 14, marginBottom: 26 }}>
          <select
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
            style={{ padding: "10px 14px", borderRadius: 12, fontWeight: 700 }}
          >
            {MONTHS.map((m, i) => (
              <option key={i} value={i}>{m}</option>
            ))}
          </select>

          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ width: 120, padding: "10px 14px", borderRadius: 12, fontWeight: 700 }}
          />
        </div>
      )}

      {/* SUMMARY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: 18,
          marginBottom: 30,
        }}
      >
        <Summary label="Active Recurring" value={activeRecurring} icon={Repeat} />
        <Summary label="Monthly Impact" value={`₹${monthlyImpact}`} icon={CreditCard} />
      </div>

      {/* LIST */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 18,
        }}
      >
        {recurringItems.length === 0 && (
          <div
            style={{
              gridColumn: "1 / -1",
              padding: 18,
              borderRadius: 14,
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
              fontWeight: 700,
              opacity: 0.75,
            }}
          >
            No recurring expenses detected for this month
          </div>
        )}

        {recurringItems.map((item) => (
          <div
            key={item.name}
            style={{
              padding: 18,
              borderRadius: 18,
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.12)",
              borderLeft: "6px solid #16a34a",
            }}
          >
            <div style={{ fontWeight: 900, color: "#064e3b" }}>
              {item.name}
            </div>

            <div style={{ fontSize: 13, opacity: 0.75, fontWeight: 600 }}>
              Category: {item.category}
            </div>

            <div style={{ marginTop: 8, fontWeight: 800 }}>
              ₹{item.amount} / Month
            </div>

            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
              Detected {item.count} times this month
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
        🤖 Recurring detection uses your actual monthly spending data
      </div>
    </div>
  );
}

/* ================= SMALL CARD ================= */
function Summary({ label, value, icon }) {
  // default resolver (lucide icons) based on label keywords
  function getDefaultIconByLabel(lbl) {
    const l = (lbl || "").toLowerCase();
    if (l.includes("recurr") || l.includes("active")) return Repeat;
    if (l.includes("impact") || l.includes("amount") || l.includes("monthly")) return CreditCard;
    if (l.includes("date") || l.includes("month")) return Calendar;
    return Repeat;
  }

  let iconNode = null;

  // If a Lucide component was passed (function), render it
  if (typeof icon === "function") {
    const IconComp = icon;
    iconNode = <IconComp size={22} />;
  } else if (React.isValidElement(icon)) {
    // if caller passed a React element
    iconNode = icon;
  } else {
    // fallback to sensible lucide icon
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
      <div style={{ fontSize: 24, fontWeight: 900, color: "#065f46" }}>
        {value}
      </div>
      <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 700 }}>
        {label}
      </div>
    </div>
  );
}
