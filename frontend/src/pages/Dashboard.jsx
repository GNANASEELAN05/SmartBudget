// frontend/src/pages/DashboardFixed.jsx
import React, { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, onValue, off } from "firebase/database";
import {
  Wallet,
  TrendingUp,
  BarChart2,
  Calendar,
  Shield,
  Tag,
  ShoppingCart,
  Home,
  Truck,
  Heart,
  Coffee
} from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // <-- added

/**
 * DashboardFixed.jsx
 * - Slightly lighter card gradients (user requested "reduce a little bit").
 * - Added lighter backgrounds for the two small summary cards (Avg / day, Potential savings).
 * - Adjusted Budget Health text color and progress bar track/fill for better visibility.
 * - No other logic/layout changed — icons, data, and behavior preserved exactly.
 */

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

const box = {
  background: "#ffffff",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 10px 30px rgba(16,24,40,0.07)",
  border: "1px solid rgba(15,23,42,0.05)"
};

// color tokens (base)
const COLORS = {
  pageBg: "linear-gradient(135deg,#eef2ff,#ecfeff)", // container background
  heading: "#0f172a",     // strong headings (kept slightly darker)
  muted: "#6b7280",       // muted text
  indigoA: "#3730a3",
  indigoB: "#312e81",
};

function moneyINR(n) {
  if (n == null) return "₹0";
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",").replace(/^/, "₹");
}

/* tiny sparkline generator for numeric array -> points string */
function sparklinePoints(data, width = 240, height = 40) {
  if (!data || !data.length) return "";
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  return data.map((v, i) => {
    const x = (i / (data.length - 1 || 1)) * width;
    const y = height - ((v - min) / range) * height;
    return `${x},${y}`;
  }).join(" ");
}

/* safe icon rendering: tries lucide icon then falls back to emoji */
function renderIcon(IconComp, size = 22, color = "#fff", fallback = "🔷") {
  try {
    if (IconComp) return React.createElement(IconComp, { size, style: { color, verticalAlign: "middle" } });
  } catch (e) {
    // fall through to emoji
  }
  return <span style={{ fontSize: size }}>{fallback}</span>;
}

/* map category name -> icon component and color */
function getIconForCategory(name) {
  if (!name) return { Icon: Tag, color: "#374151", emoji: "🏷️" };
  const k = String(name).toLowerCase();
  // health / medical
  if (k.includes("health") || k.includes("medical") || k.includes("hospital") || k.includes("medicine")) {
    return { Icon: Shield, color: "#065f46", emoji: "🛡️" }; // green
  }
  // groceries / food
  if (k.includes("grocery") || k.includes("groceries") || k.includes("food") || k.includes("supermarket")) {
    return { Icon: ShoppingCart, color: "#b45309", emoji: "🛒" }; // amber
  }
  // rent / home
  if (k.includes("rent") || k.includes("home") || k.includes("house")) {
    return { Icon: Home, color: "#0f766e", emoji: "🏠" }; // teal
  }
  // transport / fuel
  if (k.includes("transport") || k.includes("taxi") || k.includes("uber") || k.includes("fuel") || k.includes("bus") || k.includes("train")) {
    return { Icon: Truck, color: "#0ea5e9", emoji: "🚚" }; // sky
  }
  // entertainment / leisure / coffee
  if (k.includes("coffee") || k.includes("cafe") || k.includes("entertainment") || k.includes("movie")) {
    return { Icon: Coffee, color: "#7c2d12", emoji: "☕" }; // brown
  }
  // health-ish like fitness
  if (k.includes("gym") || k.includes("fitness") || k.includes("sport")) {
    return { Icon: Heart, color: "#dc2626", emoji: "❤️" }; // red
  }
  // default
  return { Icon: Tag, color: "#4338ca", emoji: "🏷️" };
}

export default function DashboardFixed({
  forcedMonth = null,
  forcedYear = null,
  printMode = false,
}) {
  const auth = (() => {
    try { return getAuth(); } catch (e) { console.error("getAuth() error:", e); return null; }
  })();
  const db = (() => {
    try { return getDatabase(); } catch (e) { console.error("getDatabase() error:", e); return null; }
  })();

  const [user, setUser] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [categories, setCategories] = useState([]);
  const [profile, setProfile] = useState({ name: "User" });

  // Use the forced period hook so Export page can control month/year.
  // Defaults to current month/year when not forced.
  const [month, setMonth, year, setYear] = useForcedPeriod(forcedMonth, forcedYear);

  // auth listener
  useEffect(() => {
    if (!auth) {
      console.warn("Firebase Auth not available. Make sure Firebase is initialized.");
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsub();
  }, [auth]);

  // DB listeners
  useEffect(() => {
    if (!user || !db) return;

    const expRef = ref(db, `users/${user.uid}/expenses`);
    const catRef = ref(db, `users/${user.uid}/categories`);
    const profileRef = ref(db, `users/${user.uid}/profile`);

    const expHandler = onValue(expRef, (snap) => {
      const data = snap.val() || {};
      const arr = Object.entries(data).map(([id, val]) => ({ id, ...val }));
      arr.forEach(a => a.amount = Number(a.amount || 0));
      setExpenses(arr);
    }, (err) => {
      console.error("expenses listener error:", err);
    });

    const catHandler = onValue(catRef, (snap) => {
      const data = snap.val() || {};
      const arr = Object.entries(data).map(([id, val]) => ({ id, ...val }));
      setCategories(arr);
    }, (err) => {
      console.error("categories listener error:", err);
    });

    const profileHandler = onValue(profileRef, (snap) => {
      const data = snap.val();
      if (data) setProfile(data);
      else if (user?.displayName) setProfile({ name: user.displayName });
    }, (err) => {
      console.error("profile listener error:", err);
    });

    return () => {
      try { off(expRef, "value", expHandler); } catch(e) {}
      try { off(catRef, "value", catHandler); } catch(e) {}
      try { off(profileRef, "value", profileHandler); } catch(e) {}
    };
  }, [user, db]);

  // filter expenses to selected month/year (date is dd/mm/yyyy)
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      if (!e.date) return false;
      const parts = String(e.date).split("/");
      if (parts.length < 3) return false;
      const m = Number(parts[1]) - 1;
      const y = Number(parts[2]);
      return m === Number(month) && y === Number(year);
    });
  }, [expenses, month, year]);

  // SEARCH BAR REMOVED: show filteredExpenses directly
  const searchedExpenses = filteredExpenses;

  const totalSpent = useMemo(() => filteredExpenses.reduce((s, e) => s + Number(e.amount || 0), 0), [filteredExpenses]);

  const daysInMonth = new Date(year, Number(month) + 1, 0).getDate();
  const avgPerDay = Math.round(totalSpent / Math.max(daysInMonth, 1));

  const highestExpense = useMemo(() => {
    if (!filteredExpenses.length) return null;
    return [...filteredExpenses].sort((a,b) => Number(b.amount) - Number(a.amount))[0];
  }, [filteredExpenses]);

  const categoryTotals = useMemo(() => {
    const map = {};
    filteredExpenses.forEach(e => {
      map[e.category] = (map[e.category] || 0) + Number(e.amount || 0);
    });
    return map;
  }, [filteredExpenses]);

  const topCategory = useMemo(() => {
    const arr = Object.entries(categoryTotals).sort((a,b) => b[1] - a[1]);
    return arr[0] || null;
  }, [categoryTotals]);

  const budgetHealth = useMemo(() => {
    let used = 0, limit = 0;
    categories.forEach(c => {
      if (c.type === "expense" && c.monthlyLimit) {
        limit += Number(c.monthlyLimit || 0);
        used += categoryTotals[c.name] || 0;
      }
    });
    if (!limit) return { label: "Neutral", percent: 0 };
    const percent = Math.min(100, Math.round((used / limit) * 100));
    let label = "Healthy";
    if (percent >= 90) label = "Critical";
    else if (percent >= 70) label = "Warning";
    return { label, percent };
  }, [categories, categoryTotals]);

  // chart data: daily totals
  const chartData = useMemo(() => {
    const arr = Array.from({length: daysInMonth}, (_, i) => 0);
    filteredExpenses.forEach(e => {
      const parts = (e.date || "").split("/");
      if (parts.length >= 3) {
        const d = Number(parts[0]);
        if (!isNaN(d) && d >= 1 && d <= daysInMonth) arr[d-1] += Number(e.amount || 0);
      }
    });
    return arr;
  }, [filteredExpenses, daysInMonth]);

  // helpful render when auth/db missing
  if (!auth || !db) {
    return (
      <div style={{ padding: 28 }}>
        <div style={{ ...box, maxWidth: 920, margin: "0 auto", background: "#fff" }}>
          <h2 style={{ marginTop: 0, color: COLORS.indigoA }}>Dashboard</h2>
          <p style={{ color: COLORS.muted }}>
            Firebase not detected. Please ensure Firebase is initialized and you have imported <code>getAuth()</code> and <code>getDatabase()</code> from Firebase.
          </p>
          <p style={{ color: COLORS.muted, fontSize: 13 }}>
            Console: check for errors from getAuth/getDatabase. If you already initialized Firebase, reload the page.
          </p>
        </div>
      </div>
    );
  }

  // per-card styles (lightened a bit) + improved health track/fill
  const CARD_STYLES = {
    monthly: {
      // lighter indigo gradient
      background: "linear-gradient(135deg,#6366f1,#a78bfa)",
      textColor: "#ffffff",
      iconColor: "#eef2ff"
    },
    highest: {
      // lighter orange/pink gradient
      background: "linear-gradient(135deg,#fb923c,#ffd7c2)",
      textColor: "#4b2b0a",
      iconColor: "#fff1e6"
    },
    topcat: {
      // lighter violet
      background: "linear-gradient(135deg,#7c3aed,#c4b5fd)",
      textColor: "#fff9ff",
      iconColor: "#f3e8ff"
    },
    health: {
      // lighter green card but with clearer text + track/fill values for the progress bar
      background: "linear-gradient(135deg,#16a34a,#86efac)",
      textColor: "#042f2a", // slightly darker for contrast
      iconColor: "#ecfdf5",
      // new: track and fill for clearer progress visibility
      trackColor: "rgba(2,44,34,0.12)", // subtle dark-green track for contrast
      fillGradient: "linear-gradient(90deg,#fde68a,#34d399)" // high-contrast yellow->green fill
    },
    // small mini-card backgrounds (distinct but subtle)
    mini1: {
      background: "linear-gradient(135deg,#f1f5ff,#ffffff)",
      textColor: COLORS.indigoA
    },
    mini2: {
      background: "linear-gradient(135deg,#fffaf0,#fff9f2)",
      textColor: COLORS.indigoA
    }
  };

  return (
    <div style={{ padding: 28, fontFamily: "system-ui, -apple-system, Roboto, 'Segoe UI', 'Helvetica Neue', Arial", background: COLORS.pageBg, borderRadius: 22 }}>
      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, color: COLORS.indigoA }}>👋 Hi, <span style={{ color: "#0b5cff" }}>{profile.name || "User"}</span></h1>
            <div style={{ color: COLORS.indigoB, fontSize: 14, marginTop: 6 }}>
              Financial overview — <strong style={{ color: COLORS.indigoA }}>{MONTHS[month]} {year}</strong>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "center", background: "#fff", padding: 8, borderRadius: 10, boxShadow: "0 6px 18px rgba(16,24,40,0.04)" }}>
              {!printMode && (
                <>
                  <select
                    value={month}
                    onChange={e => setMonth(Number(e.target.value))}
                    style={{ border: "none", background: "transparent", fontSize: 14, color: COLORS.indigoA }}
                  >
                    {MONTHS.map((m,i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                  <input
                    value={year}
                    onChange={e => setYear(Number(e.target.value))}
                    type="number"
                    style={{ width: 84, border: "none", background: "transparent", fontSize: 14, color: COLORS.indigoA }}
                  />
                </>
              )}
            </div>

            {/* SEARCH BAR REMOVED - kept layout size unaffected */}
            <div style={{ width: 0 }} />
          </div>
        </div>

        {/* KPI Row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 18 }}>
          {/* Monthly Spend (lighter indigo) */}
          <div style={{ ...box, background: CARD_STYLES.monthly.background, color: CARD_STYLES.monthly.textColor }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ color: CARD_STYLES.monthly.textColor, opacity: 0.9, fontSize: 13, fontWeight: 700 }}>Monthly Spend</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: CARD_STYLES.monthly.textColor }}>{moneyINR(totalSpent)}</div>
                <div style={{ color: CARD_STYLES.monthly.textColor, opacity: 0.85, fontSize: 12 }}>Avg / day {moneyINR(avgPerDay)}</div>
              </div>
              <div style={{ fontSize: 28 }}>
                {renderIcon(Wallet, 28, CARD_STYLES.monthly.iconColor, "💼")}
              </div>
            </div>

            <div style={{ marginTop: 10 }}>
              {/* small sparkline (stroke uses a lighter color on card) */}
              <svg width="100%" height="40" viewBox="0 0 240 40" preserveAspectRatio="none">
                <polyline
                  fill="none"
                  stroke={CARD_STYLES.monthly.iconColor}
                  strokeWidth="2"
                  points={sparklinePoints(chartData, 240, 40)}
                />
              </svg>
            </div>
          </div>

          {/* Highest Expense (lighter orange) */}
          <div style={{ ...box, background: CARD_STYLES.highest.background, color: CARD_STYLES.highest.textColor }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: CARD_STYLES.highest.textColor, opacity: 0.95, fontSize: 13, fontWeight: 700 }}>Highest Expense</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: CARD_STYLES.highest.textColor }}>{highestExpense ? `${highestExpense.category} • ${moneyINR(highestExpense.amount)}` : "—"}</div>
                <div style={{ color: CARD_STYLES.highest.textColor, opacity: 0.9, fontSize: 12 }}>{highestExpense?.note || "No description"}</div>
              </div>
              <div style={{ fontSize: 24 }}>
                {renderIcon(TrendingUp, 24, CARD_STYLES.highest.iconColor, "📈")}
              </div>
            </div>
          </div>

          {/* Top Category (lighter violet) */}
          <div style={{ ...box, background: CARD_STYLES.topcat.background, color: CARD_STYLES.topcat.textColor }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <div>
                <div style={{ color: CARD_STYLES.topcat.textColor, opacity: 0.95, fontSize: 13, fontWeight: 700 }}>Top Category</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: CARD_STYLES.topcat.textColor }}>{topCategory ? topCategory[0] : "—"}</div>
                <div style={{ color: CARD_STYLES.topcat.textColor, opacity: 0.9, fontSize: 12 }}>{topCategory ? moneyINR(topCategory[1]) : ""}</div>
              </div>
              <div style={{ fontSize: 24 }}>
                {/* tag icon for categories */}
                {renderIcon(Tag, 24, CARD_STYLES.topcat.iconColor, "🏷️")}
              </div>
            </div>
          </div>

          {/* Budget Health (lighter green) */}
          <div style={{ ...box, background: CARD_STYLES.health.background, color: CARD_STYLES.health.textColor }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div style={{ color: CARD_STYLES.health.textColor, opacity: 0.95, fontSize: 13, fontWeight: 700 }}>Budget Health</div>
                <div style={{ fontSize: 16, fontWeight: 800, color: CARD_STYLES.health.textColor }}>{budgetHealth.label}</div>
                <div style={{ color: CARD_STYLES.health.textColor, opacity: 0.9, fontSize: 12 }}>{budgetHealth.percent}% used</div>
              </div>
              <div style={{ fontSize: 24 }}>
                {renderIcon(Shield, 24, CARD_STYLES.health.iconColor, "🛡️")}
              </div>
            </div>

            {/* improved track + fill for higher contrast and clearer visibility */}
            <div style={{ marginTop: 12, background: CARD_STYLES.health.trackColor, borderRadius: 8, height: 10, overflow: "hidden" }}>
              <div style={{ width: `${budgetHealth.percent}%`, background: CARD_STYLES.health.fillGradient, height: "100%", transition: "width 360ms ease" }} />
            </div>
          </div>
        </div>

        {/* main: left chart / right categories */}
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <div style={{ ...box }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: COLORS.indigoA }}>Spends overview</div>
              <div style={{ color: COLORS.muted }}>{filteredExpenses.length} items</div>
            </div>

            <div style={{ height: 220, marginBottom: 12 }}>
              {/* larger sparkline area (simple line + shaded area) */}
              <svg width="100%" height="100%" viewBox="0 0 720 220" preserveAspectRatio="none" style={{ background: "linear-gradient(180deg,#ffffff,#f9fbff)", borderRadius: 8 }}>
                <defs>
                  <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7c3aed" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="#7c3aed" stopOpacity="0" />
                  </linearGradient>
                </defs>
                <polyline
                  fill="url(#gA)"
                  stroke="none"
                  strokeWidth="0"
                  points={
                    (() => {
                      const pts = chartData.map((v, i) => {
                        const x = (i / Math.max(1, chartData.length - 1)) * 680 + 20;
                        const max = Math.max(...chartData, 1);
                        const min = Math.min(...chartData, 0);
                        const range = max - min || 1;
                        const y = 200 - ((v - min) / range) * 180 + 10;
                        return `${x},${y}`;
                      });
                      return `20,210 ${pts.join(" ")} 700,210`;
                    })()
                  }
                />
                <polyline
                  fill="none"
                  stroke="#7c3aed"
                  strokeWidth="2.5"
                  points={chartData.map((v, i) => {
                    const x = (i / Math.max(1, chartData.length - 1)) * 680 + 20;
                    const max = Math.max(...chartData, 1);
                    const min = Math.min(...chartData, 0);
                    const range = max - min || 1;
                    const y = 200 - ((v - min) / range) * 180 + 10;
                    return `${x},${y}`;
                  }).join(" ")}
                />
              </svg>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ flex: 1, padding: 10, background: CARD_STYLES.mini1.background, borderRadius: 8 }}>
                <div style={{ color: COLORS.muted, fontSize: 13 }}>Avg / day</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.indigoA }}>{moneyINR(avgPerDay)}</div>
                <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 6 }}>Projected: {moneyINR(avgPerDay * daysInMonth)}</div>
              </div>

              <div style={{ flex: 1, padding: 10, background: CARD_STYLES.mini2.background, borderRadius: 8 }}>
                <div style={{ color: COLORS.muted, fontSize: 13 }}>Potential savings</div>
                <div style={{ fontWeight: 800, fontSize: 18, color: COLORS.indigoA }}>
                  {moneyINR(Math.max(0, (categories.reduce((s, c) => s + (Number(c.monthlyLimit || 0)), 0) - totalSpent)))}
                </div>
                <div style={{ color: COLORS.muted, fontSize: 12, marginTop: 6 }}>Based on category limits</div>
              </div>
            </div>
          </div>

          <div style={{ ...box }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8, color: COLORS.indigoA }}>Category distribution</div>

            <div style={{ display: "flex", gap: 10 }}>
              <div style={{ flex: 1 }}>
                {Object.keys(categoryTotals).length === 0 && <div style={{ color: COLORS.muted }}>No category data</div>}
                <ul style={{ paddingLeft: 18 }}>
                  {Object.entries(categoryTotals).map(([k,v], idx) => {
                    const { Icon, color, emoji } = getIconForCategory(k);
                    return (
                      <li key={k} style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                          <div style={{ width: 12, height: 12, borderRadius: 3, background: color }} />
                          <div style={{ fontWeight: 600, color: COLORS.indigoA, display: "flex", alignItems: "center", gap: 8 }}>
                            {/* icon for category */}
                            <span style={{ display: "inline-flex", alignItems: "center" }}>
                              {renderIcon(Icon, 14, color, emoji)}
                            </span>
                            <span>{k}</span>
                          </div>
                        </div>
                        <div style={{ color: COLORS.indigoB }}>{moneyINR(v)}</div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>

            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.indigoA }}>Smart tips</div>
              <ol style={{ marginTop: 8, color: COLORS.muted, paddingLeft: 18 }}>
                <li>Top spending category: <strong style={{ color: COLORS.indigoB }}>{topCategory ? topCategory[0] : "—"}</strong></li>
                <li>Keep an eye on categories approaching their limits ({budgetHealth.percent}% used)</li>
                <li>Reduce spikes on days shown in the chart</li>
              </ol>
            </div>
          </div>
        </div>

        {/* recent transactions */}
        <div style={{ ...box, marginTop: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ fontWeight: 700, color: COLORS.indigoA }}>Recent transactions</div>
            <div style={{ color: COLORS.muted }}>Showing {searchedExpenses.length} items</div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ textAlign: "left", color: COLORS.muted }}>
                  <th style={{ padding: "8px 6px" }}>Date</th>
                  <th style={{ padding: "8px 6px" }}>Note</th>
                  <th style={{ padding: "8px 6px" }}>Category</th>
                  <th style={{ padding: "8px 6px" }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {searchedExpenses.map(e => {
                  const { Icon, color, emoji } = getIconForCategory(e.category);
                  return (
                    <tr key={e.id} style={{ borderTop: "1px solid rgba(15,23,42,0.04)" }}>
                      <td style={{ padding: 10, color: COLORS.indigoB }}>{e.date}</td>
                      <td style={{ padding: 10, color: COLORS.indigoA }}>{e.note || "—"}</td>
                      <td style={{ padding: 10, color: COLORS.indigoA, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ display: "inline-flex" }}>{renderIcon(Icon, 14, color, emoji)}</span>
                        <span>{e.category || "—"}</span>
                      </td>
                      <td style={{ padding: 10, fontWeight: 700, color: COLORS.indigoA }}>{moneyINR(Number(e.amount || 0))}</td>
                    </tr>
                  );
                })}

                {searchedExpenses.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ padding: 20, textAlign: "center", color: COLORS.muted }}>
                      No transactions for the selected month / search
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}
