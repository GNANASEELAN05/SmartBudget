import React, { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, onValue, off } from "firebase/database";
import { TrendingUp, Calendar, BarChart2 } from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // export-safe pattern

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export default function Trends({ forcedMonth = null, forcedYear = null, printMode = false }) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  const now = new Date();
  // keep year as a string so the input can be edited freely (partial typing allowed)
  const [year, setYear] = useState(String(now.getFullYear()));
  const [monthlyBudgets, setMonthlyBudgets] = useState({});

  // hook to receive forced period from Export page (keeps parity with other pages)
  const [hookMonth, , hookYear] = useForcedPeriod(forcedMonth, forcedYear);

  /* ================= FIREBASE: READ ALL MONTHS ================= */
  useEffect(() => {
    if (!user) return;

    const rootRef = ref(db, `users/${user.uid}/monthlyBudgets`);
    const handler = onValue(rootRef, (snap) => {
      setMonthlyBudgets(snap.val() || {});
    });

    return () => off(rootRef, "value", handler);
  }, [db, user]);

  /* ================ When in printMode, set the selected year to forced year ================ */
  useEffect(() => {
    if (printMode) {
      if (hookYear) setYear(String(hookYear));
    }
    // when not in printMode, do not override user input
  }, [printMode, hookYear]);

  /* ================= BUILD TREND DATA FOR SELECTED YEAR =================
     - Always show all 12 months for the selected year
     - Months that have spending (total > 0) are placed first (so available months come on top)
     - Months with no spending still render but will have no filled progress bar
  ======================================================================== */
  const trendData = useMemo(() => {
    // build an entry for each month of the selected year
    const allMonths = Array.from({ length: 12 }).map((_, i) => {
      const mm = String(i + 1).padStart(2, "0");
      const key = `${year}-${mm}`;
      const bucket = monthlyBudgets[key] || null;
      const total = Object.values(bucket?.spends || {}).reduce(
        (s, x) => s + Number(x.amount || 0),
        0
      );

      return {
        key,
        year: Number(year),
        month: i, // 0-indexed
        label: `${MONTHS[i].slice(0, 3)} ${year}`,
        total,
      };
    });

    // separate months with spending and months without
    const withSpending = allMonths.filter((m) => m.total > 0);
    const withoutSpending = allMonths.filter((m) => m.total === 0);

    // place available months on top. Sort available months with most recent month first
    withSpending.sort((a, b) => b.month - a.month);

    // keep months without spending in natural chronological order (Jan -> Dec)
    withoutSpending.sort((a, b) => a.month - b.month);

    // final order: available months first, then the rest
    return [...withSpending, ...withoutSpending];
  }, [monthlyBudgets, year]);

  const availableMonths = trendData.filter((t) => t.total > 0);
  const maxSpend =
    availableMonths.length > 0
      ? Math.max(...availableMonths.map((t) => t.total))
      : 1;

  const avgSpend =
    availableMonths.reduce((s, t) => s + t.total, 0) /
    (availableMonths.length || 1);

  /* ================= UI ================= */
  return (
    <div
      style={{
        padding: "16px",
        borderRadius: 22,
        background: "linear-gradient(135deg,#eef2ff,#ecfeff)",
        boxShadow: "0 18px 40px rgba(0,0,0,0.12)",
      }}
    >
      {/* HEADER */}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }}>
        <div>
          <h2 style={{ fontWeight: 900, fontSize: 26, color: "#3730a3", margin: 0 }}>
            <TrendingUp size={20} style={{ marginRight: 8 }} />
            Spending Trends
          </h2>

          <p style={{ opacity: 0.75, marginBottom: 0, color: "#312e81" }}>
            Based on your actual monthly expenses — showing all months for the selected year
          </p>
        </div>

        {/* YEAR INPUT: hidden in printMode (export pages supply forced year) */}
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <label style={{ fontWeight: 800, color: "#3730a3" }}>Year</label>
          {!printMode ? (
            <input
              type="text"
              value={year}
              onChange={(e) => {
                const s = e.target.value;
                if (s === "" || /^\d{0,4}$/.test(s)) {
                  setYear(s);
                }
              }}
              onBlur={() => {
                const v = Number(year);
                if (Number.isNaN(v)) {
                  setYear(String(now.getFullYear()));
                } else if (v < 1900) {
                  setYear(String(1900));
                } else if (v > 3000) {
                  setYear(String(3000));
                } else {
                  setYear(String(v));
                }
              }}
              style={{ width: 120, padding: "10px 14px", borderRadius: 12, fontWeight: 800 }}
            />
          ) : (
            <div style={{ fontWeight: 900, padding: "6px 10px" }}>{year}</div>
          )}
        </div>
      </div>

      {/* NOTICE WHEN NO SPENDING AT ALL IN YEAR */}
      {availableMonths.length === 0 && (
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: "rgba(255,255,255,0.95)",
            boxShadow: "0 10px 26px rgba(0,0,0,0.06)",
            fontWeight: 700,
            opacity: 0.9,
            marginBottom: 18,
          }}
        >
          No spending recorded for <b>{year}</b>. All months are shown below (no progress bars when there is no data).
        </div>
      )}

      {/* SUMMARY */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginBottom: 22 }}>
        <Summary label="Average Monthly Spend (months with data)" value={availableMonths.length ? `₹${Math.round(avgSpend)}` : "₹0"} icon={BarChart2} />
        <Summary label="Months with Spend" value={availableMonths.length} icon={Calendar} />
      </div>

      {/* TREND BARS (all months shown; months with spending appear first) */}
      <div style={{ display: "grid", gap: 12 }}>
        {trendData.map((t) => (
          <div
            key={t.key}
            style={{
              padding: 14,
              borderRadius: 14,
              background: "rgba(255,255,255,0.95)",
              boxShadow: "0 10px 26px rgba(0,0,0,0.08)",
              opacity: t.total > 0 ? 1 : 0.85,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, marginBottom: 8, color: "#312e81" }}>
              <span>{t.label}</span>
              <span>{t.total > 0 ? `₹${t.total}` : "—"}</span>
            </div>

            <div style={{ height: 10, borderRadius: 8, background: "#e0e7ff", position: "relative", overflow: "hidden" }}>
              {t.total > 0 ? (
                <div style={{ height: "100%", width: `${Math.round((t.total / maxSpend) * 100)}%`, background: "linear-gradient(90deg,#6366f1,#22d3ee)", borderRadius: 8, transition: "width 360ms ease" }} />
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ================= SUMMARY CARD ================= */
function Summary({ label, value, icon }) {
  function getDefaultIconByLabel(lbl) {
    const l = (lbl || "").toLowerCase();
    if (l.includes("average") || l.includes("avg") || l.includes("spend")) return BarChart2;
    if (l.includes("month") || l.includes("months")) return Calendar;
    if (l.includes("trend") || l.includes("spend")) return TrendingUp;
    return BarChart2;
  }

  let iconNode = null;
  try {
    if (React.isValidElement(icon)) {
      iconNode = icon;
    } else if (icon) {
      iconNode = React.createElement(icon, { size: 22 });
    } else {
      const DefaultIcon = getDefaultIconByLabel(label);
      iconNode = React.createElement(DefaultIcon, { size: 22 });
    }
  } catch (e) {
    const DefaultIcon = getDefaultIconByLabel(label);
    iconNode = React.createElement(DefaultIcon, { size: 22 });
  }

  return (
    <div style={{ padding: 18, borderRadius: 18, background: "rgba(255,255,255,0.95)", boxShadow: "0 10px 26px rgba(0,0,0,0.12)" }}>
      <div style={{ fontSize: 20 }}>{iconNode}</div>
      <div style={{ fontSize: 22, fontWeight: 900 }}>{value}</div>
      <div style={{ fontSize: 13, opacity: 0.65, fontWeight: 700 }}>{label}</div>
    </div>
  );
}