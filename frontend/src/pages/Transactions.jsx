// src/pages/Transactions.jsx  (replace the original Transactions component)
import React, { useEffect, useMemo, useState } from "react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, onValue, off } from "firebase/database";
import { Wallet, List as ListIcon, Calendar } from "lucide-react";

import useForcedPeriod from "../hooks/useForcedPeriod"; // export-safe pattern

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export default function Transactions({ forcedMonth = null, forcedYear = null, printMode = false }) {
  const auth = getAuth();
  const db = getDatabase();

  /* ================= STATES ================= */
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [yearInput, setYearInput] = useState(String(now.getFullYear()));

  const [type, setType] = useState("all"); // all | expense | income
  const [search, setSearch] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [user, setUser] = useState(auth.currentUser || null);

  const [incomes, setIncomes] = useState([]);
  const [loadingIncomes, setLoadingIncomes] = useState(false);

  const [monthlySpends, setMonthlySpends] = useState([]);
  const [loadingSpends, setLoadingSpends] = useState(false);

  const [hookMonth, , hookYear] = useForcedPeriod(forcedMonth, forcedYear);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, [auth]);

  useEffect(() => {
    if (printMode) {
      setMonth(Number(hookMonth));
      setYear(Number(hookYear));
      setYearInput(String(hookYear));
    }
  }, [printMode, hookMonth, hookYear]);

  useEffect(() => {
    if (!user) {
      setExpenses([]);
      return;
    }

    const expRef = ref(db, `users/${user.uid}/expenses`);
    const handler = onValue(expRef, snap => {
      const data = snap.val() || {};
      setExpenses(Object.entries(data).map(([id, v]) => ({ id, ...v })));
    });

    return () => off(expRef, "value", handler);
  }, [db, user]);

  const monthKey = `${year}-${String(Number(month) + 1).padStart(2, "0")}`;

  useEffect(() => {
    if (!user) {
      setIncomes([]);
      return;
    }

    setLoadingIncomes(true);
    const incomesRef = ref(db, `users/${user.uid}/monthlyBudgets/${monthKey}/incomes`);
    const handler = onValue(incomesRef, (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, v]) => ({
        id,
        name: v.name || "Untitled",
        amount: Number(v.amount || 0),
        source: v.source || "",
        createdAt: v.createdAt || 0,
      }));
      list.sort((a, b) => b.createdAt - a.createdAt);
      setIncomes(list);
      setLoadingIncomes(false);
    });

    return () => off(incomesRef, "value", handler);
  }, [db, user, monthKey]);

  useEffect(() => {
    if (!user) {
      setMonthlySpends([]);
      return;
    }

    setLoadingSpends(true);
    const spendsRef = ref(db, `users/${user.uid}/monthlyBudgets/${monthKey}/spends`);
    const handler = onValue(spendsRef, (snap) => {
      const data = snap.val() || {};
      const list = Object.entries(data).map(([id, v]) => ({
        id,
        name: v.name || v.title || "Untitled",
        amount: Number(v.amount || 0),
        date: v.date || "",
        linkedExpenseId: v.linkedExpenseId || null,
        createdAt: v.createdAt || 0,
        source: "monthly",
      }));
      list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setMonthlySpends(list);
      setLoadingSpends(false);
    });

    return () => off(spendsRef, "value", handler);
  }, [db, user, monthKey]);

  /* ==================== Robust date parsing (unchanged) ==================== */
  function parseDateFlexible(input, fallbackTs = 0) {
    if (!input && !fallbackTs) return null;

    if (typeof input === "string" && /^\s*\d{1,2}\/\d{1,2}\/\d{4}\s*$/.test(input)) {
      const [ddS, mmS, yyyyS] = input.trim().split("/");
      const dd = Number(ddS);
      const mm = Number(mmS);
      const yyyy = Number(yyyyS);
      if (!isNaN(dd) && !isNaN(mm) && !isNaN(yyyy)) {
        const ts = new Date(yyyy, mm - 1, dd).getTime();
        return { dd, mm: mm - 1, yyyy, ts };
      }
    }

    if (typeof input === "string" && /^\s*\d{4}-\d{2}-\d{2}\s*$/.test(input)) {
      const [yyyyS, mmS, ddS] = input.trim().split("-");
      const dd = Number(ddS);
      const mm = Number(mmS);
      const yyyy = Number(yyyyS);
      if (!isNaN(dd) && !isNaN(mm) && !isNaN(yyyy)) {
        const ts = new Date(yyyy, mm - 1, dd).getTime();
        return { dd, mm: mm - 1, yyyy, ts };
      }
    }

    const maybeNum = Number(input);
    if (!isNaN(maybeNum) && maybeNum > 1000000000) {
      const d = new Date(maybeNum);
      if (!isNaN(d.getTime())) {
        return { dd: d.getDate(), mm: d.getMonth(), yyyy: d.getFullYear(), ts: d.getTime() };
      }
    }

    if (fallbackTs) {
      const d = new Date(fallbackTs);
      if (!isNaN(d.getTime())) {
        return { dd: d.getDate(), mm: d.getMonth(), yyyy: d.getFullYear(), ts: d.getTime() };
      }
    }

    return null;
  }

  /* ================= FILTER (expenses) ================= */
  const filteredExpenses = useMemo(() => {
    return expenses.filter(e => {
      const parsed = parseDateFlexible(e.date, e.createdAt || 0);
      if (!parsed) return false;

      if (parsed.yyyy !== Number(year)) return false;
      if (parsed.mm !== Number(month)) return false;

      if (type !== "all" && e.type !== type) return false;

      if (search && !e.note?.toLowerCase().includes(search.toLowerCase())) return false;

      return true;
    });
  }, [expenses, month, year, type, search]);

  /* ================= Combine expenses + incomes + monthlySpends for display ================= */
  function parseDateToTs(dStr, fallbackCreatedAt = 0) {
    const parsed = parseDateFlexible(dStr, fallbackCreatedAt);
    return parsed?.ts || fallbackCreatedAt || 0;
  }

  const combinedList = useMemo(() => {
    const list = [];
    const expenseIdsInMonth = new Set(filteredExpenses.map(e => e.id));

    filteredExpenses.forEach(e => {
      list.push({
        id: e.id,
        type: e.type || "expense",
        note: e.note || e.category || e.name || "Expense",
        amount: Number(e.amount || 0),
        date: e.date,
        ts: parseDateToTs(e.date, e.createdAt || 0),
        raw: e,
      });
    });

    (incomes || []).forEach(i => {
      const p = parseDateFlexible(undefined, i.createdAt || 0);
      if (p && p.yyyy === Number(year) && p.mm === Number(month)) {
        list.push({
          id: `inc-${i.id}`,
          type: "income",
          note: i.name,
          amount: Number(i.amount || 0),
          date: new Date(i.createdAt || Date.now()).toLocaleString(),
          ts: Number(i.createdAt || Date.now()),
          raw: i,
        });
      }
    });

    (monthlySpends || []).forEach(ms => {
      // avoid duplication when the monthlySpend links to an expense already present
      if (ms.linkedExpenseId && expenseIdsInMonth.has(ms.linkedExpenseId)) return;
      const ts = ms.date ? parseDateToTs(ms.date, ms.createdAt || 0) : (ms.createdAt || 0);
      const parsed = parseDateFlexible(ms.date, ms.createdAt || 0);
      if (!parsed) return;
      if (parsed.yyyy !== Number(year) || parsed.mm !== Number(month)) return;
      list.push({
        id: `ms-${ms.id}`,
        type: "expense",
        note: ms.name,
        amount: Number(ms.amount || 0),
        date: ms.date || new Date(ms.createdAt || Date.now()).toLocaleString(),
        ts,
        raw: ms,
      });
    });

    list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    return list;
  }, [filteredExpenses, incomes, monthlySpends, month, year]);

  /* ================= TOTALS (use combinedList to avoid double exclusions) ================= */
  const totalIncome = useMemo(() => incomes.reduce((s, it) => s + Number(it.amount || 0), 0), [incomes]);

  const totalExpense = useMemo(() => {
    return combinedList
      .filter(item => item.type === "expense")
      .reduce((s, it) => s + Number(it.amount || 0), 0);
  }, [combinedList]);

  const totals = useMemo(() => ({ income: totalIncome, expense: totalExpense, balance: totalIncome - totalExpense }), [totalIncome, totalExpense]);

  /* ================= EXCEEDED LOGIC (use combinedList ordered by ts) ================= */
  const exceededExpenseIds = useMemo(() => {
    const seq = combinedList
      .filter(it => it.type === "expense")
      .map(it => ({ id: it.id, amount: Number(it.amount || 0), dateTs: it.ts || 0 }));

    seq.sort((a, b) => (a.dateTs || 0) - (b.dateTs || 0));

    const exceeded = new Set();
    let cum = 0;
    for (const item of seq) {
      cum += Number(item.amount || 0);
      if (cum > totalIncome) exceeded.add(item.id);
    }

    return exceeded;
  }, [combinedList, totalIncome]);

  /* ================= STYLES / UI (unchanged except date display / isExceeded check) ================= */
  const page = { background: "linear-gradient(135deg,#f0fdfa,#ecfeff)", padding: 26, borderRadius: 18, boxShadow: "0 14px 32px rgba(0,0,0,0.12)" };
  const glass = { background: "rgba(255,255,255,0.95)", borderRadius: 16, padding: 18, boxShadow: "0 8px 20px rgba(0,0,0,0.12)" };
  const input = { padding: "8px 10px", borderRadius: 6, border: "1px solid #9ca3af", fontSize: 13 };

  function commitYearFromInput() {
    const parsed = parseInt((yearInput || "").replace(/\D/g, ""), 10);
    if (!Number.isNaN(parsed) && parsed > 1900 && parsed < 3000) {
      setYear(parsed);
      setYearInput(String(parsed));
    } else {
      setYearInput(String(year));
    }
  }

  return (
    <div style={page}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {React.createElement(Wallet, { size: 22, style: { color: "#4f46e5" } })}
          <h2 style={{ fontWeight: 900, margin: 0, color: "#071033" }}>Transactions</h2>
        </div>
      </div>

      {!printMode && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))", gap: 12, marginBottom: 24 }}>
          <select style={input} value={month} onChange={(e) => setMonth(Number(e.target.value))}>
            {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
          </select>

          <input
            type="text"
            style={input}
            value={yearInput}
            onChange={(e) => setYearInput(e.target.value)}
            onBlur={commitYearFromInput}
            onKeyDown={(e) => { if (e.key === "Enter") { commitYearFromInput(); e.currentTarget.blur(); } }}
          />
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(220px,1fr))", gap: 18, marginBottom: 12 }}>
        <InfoCard label="Income" value={`₹${Math.round(totals.income).toLocaleString()}`} icon={Wallet} variant="income" />
        <InfoCard label="Expense" value={`₹${Math.round(totals.expense).toLocaleString()}`} icon={ListIcon} variant="expense" />
        <InfoCard label="Balance" value={`₹${Math.round(totals.balance).toLocaleString()}`} icon={Calendar} variant="balance" balance={totals.balance} />
      </div>

      <div style={{ marginBottom: 26 }}>
        <BalanceStatusCard balance={totals.balance} />
      </div>

      <div style={glass}>
        {combinedList.length === 0 && <div style={{ opacity: 0.6, textAlign: "center" }}>No transactions found</div>}

        {combinedList.map(t => {
          const isIncome = t.type === "income";
          const isExceeded = exceededExpenseIds.has(t.id);
          let displayText = "";
          let color = isIncome ? "#165e37" : "#071033";
          if (isIncome) {
            displayText = `+₹${t.amount}`;
            color = "#165e37";
          } else {
            if (isExceeded) {
              displayText = `-₹${t.amount}`;
              color = "#7f1d1d";
            } else {
              displayText = `₹${t.amount}`;
              color = "#071033";
            }
          }

          // Robust date display
          const displayDate = t.date
            ? (typeof t.date === "number" ? new Date(t.date).toLocaleString() : String(t.date))
            : (t.ts ? new Date(t.ts).toLocaleString() : "");

          return (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid #e5e7eb", fontWeight: 600 }}>
              <div>
                <div style={{ color: isIncome ? "#064e3b" : "#071033" }}>{t.note}</div>
                <div style={{ fontSize: 12, opacity: 0.6 }}>{displayDate}</div>
              </div>

              <div style={{ color, fontWeight: 900 }}>{displayText}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* BalanceStatusCard and InfoCard components kept unchanged from your file */
function BalanceStatusCard({ balance }) {
  const positive = balance > 0;
  const negative = balance < 0;
  const neutral = balance === 0;

  const bg = positive ? "linear-gradient(135deg,#dcfce7,#bbf7d0)" : negative ? "linear-gradient(135deg,#fee2e2,#fecaca)" : "linear-gradient(135deg,#f3f4f6,#e5e7eb)";
  const border = positive ? "1px solid rgba(16,185,129,0.08)" : negative ? "1px solid rgba(239,68,68,0.08)" : "1px solid rgba(107,114,128,0.06)";
  const text = positive ? "You are in a positive position this month." : negative ? "Your expenses have exceeded income this month." : "Your income and expenses are even.";

  return (
    <div style={{ padding: 14, borderRadius: 12, background: bg, border, boxShadow: "0 10px 26px rgba(0,0,0,0.06)", fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <div style={{ fontSize: 15 }}>{text}</div>
      <div style={{ fontSize: 15, fontWeight: 900 }}>{`₹${Math.round(balance).toLocaleString()}`}</div>
    </div>
  );
}

function InfoCard({ label, value, icon, variant = "income", balance = null }) {
  function getDefaultIconByLabel(lbl) {
    const l = (lbl || "").toLowerCase();
    if (l.includes("income")) return Wallet;
    if (l.includes("expense")) return ListIcon;
    if (l.includes("balance")) return Calendar;
    return Wallet;
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

  const variants = {
    income: { gradient: "linear-gradient(135deg,#dcfce7,#bbf7d0)", valueColor: "#166534", labelColor: "#14532d", iconColor: "#16a34a", border: "1px solid rgba(16,185,129,0.08)" },
    expense: { gradient: "linear-gradient(135deg,#fee2e2,#fecaca)", valueColor: "#7f1d1d", labelColor: "#5b0f0f", iconColor: "#ef4444", border: "1px solid rgba(239,68,68,0.08)" },
    balance: { gradient: "linear-gradient(135deg,#e0f2fe,#bae6fd)", valueColor: "#075985", labelColor: "#044e6a", iconColor: "#0ea5e9", border: "1px solid rgba(3,105,161,0.08)" },
  };

  const s = variants[variant] || variants.income;

  const accentForBalance = (() => {
    if (variant !== "balance" || balance == null) return null;
    const bal = Number(balance || 0);
    if (bal > 0) return "linear-gradient(135deg,#16a34a,#86efac)";
    if (bal < 0) return "linear-gradient(135deg,#ef4444,#fecaca)";
    return "linear-gradient(135deg,#9ca3af,#e5e7eb)";
  })();

  const wrapperStyle = { display: "flex", alignItems: "stretch", borderRadius: 14, overflow: "hidden", boxShadow: "0 10px 26px rgba(2,6,23,0.06)", border: s.border, background: s.gradient };
  const accentStyle = accentForBalance ? { width: 8, minWidth: 8, background: accentForBalance } : null;
  const contentStyle = { padding: 18, display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flex: 1 };

  return (
    <div style={wrapperStyle}>
      {accentForBalance ? <div style={accentStyle} /> : null}
      <div style={contentStyle}>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 16, opacity: 1, color: s.labelColor, fontWeight: 900, marginBottom: 8 }}>{label}</div>
          <div style={{ fontSize: 14, fontWeight: 900, color: s.valueColor }}>{value}</div>
        </div>
        <div style={{ fontSize: 22, color: s.iconColor }}>{iconNode}</div>
      </div>
    </div>
  );
}
