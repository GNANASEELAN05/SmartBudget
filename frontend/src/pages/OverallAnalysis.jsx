import { useState, useRef } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, get } from "firebase/database";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";
import { Sparkles, Download, RefreshCw, Calendar } from "lucide-react";

const GEMINI_KEY = import.meta.env.VITE_GEMINI_API_KEY;
const COLORS = ["#6366f1","#22d3ee","#f59e0b","#10b981","#ef4444","#8b5cf6","#f43f5e","#0ea5e9"];

async function callGemini(promptText) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: promptText }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      }),
    }
  );
  if (!res.ok) throw new Error("Gemini API error: " + res.status);
  const data = await res.json();
  return data.candidates[0].content.parts[0].text;
}

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December"
];

export default function OverallAnalysis() {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;
  const reportRef = useRef(null);

  // Filter state
  const [filterMode, setFilterMode] = useState("month"); // "month" | "range"
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // Result state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState(null);

  // ── Fetch data and call Gemini ────────────────────────────────
  const handleGenerate = async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    setAnalysis(null);

    try {
      const snap = await get(ref(db, `users/${user.uid}`));
      const userData = snap.exists() ? snap.val() : {};

      const expenses = userData.expenses ? Object.values(userData.expenses) : [];
      const income   = userData.income   ? Object.values(userData.income)   : [];
      const savings  = userData.savings  ? Object.values(userData.savings)  : [];
      const assets   = userData.assets   ? Object.values(userData.assets)   : [];
      const liabilities = userData.liabilities ? Object.values(userData.liabilities) : [];

      // ── Filter helper ─────────────────────────────────────────
      function inRange(item) {
        const iso = item.dateISO || item.date || "";
        if (!iso) return true;
        const d = iso.includes("/")
          ? iso.split("/").reverse().join("-") // dd/mm/yyyy → yyyy-mm-dd
          : iso.substring(0, 10);

        if (filterMode === "month") {
          const mm = String(selectedMonth).padStart(2, "0");
          return d.startsWith(`${selectedYear}-${mm}`);
        } else {
          const from = fromDate || "0000-01-01";
          const to   = toDate   || "9999-12-31";
          return d >= from && d <= to;
        }
      }

      const filteredExpenses = expenses.filter(inRange);
      const filteredIncome   = income.filter(inRange);

      // ── Aggregations ──────────────────────────────────────────
      const totalExp = filteredExpenses.reduce((s, e) => s + (Number(e.amount) || 0), 0);
      const totalInc = filteredIncome.reduce((s, i) => s + (Number(i.amount) || 0), 0);
      const savings_amount = totalInc - totalExp;

      const byCategory = filteredExpenses.reduce((acc, e) => {
        if (e.category) acc[e.category] = (acc[e.category] || 0) + (Number(e.amount) || 0);
        return acc;
      }, {});

      const byMonth = filteredExpenses.reduce((acc, e) => {
        const d = e.dateISO || e.date || "";
        const m = d.length >= 7 ? d.substring(0, 7) : "unknown";
        acc[m] = (acc[m] || 0) + (Number(e.amount) || 0);
        return acc;
      }, {});

      const incomeByMonth = filteredIncome.reduce((acc, i) => {
        const d = i.date || i.dateISO || "";
        const m = d.length >= 7 ? d.substring(0, 7) : "unknown";
        acc[m] = (acc[m] || 0) + (Number(i.amount) || 0);
        return acc;
      }, {});

      const netWorthAssets = assets.reduce((s, a) => s + (Number(a.value) || 0), 0);
      const netWorthLiabilities = liabilities.reduce((s, l) => s + (Number(l.value) || 0), 0);

      const filterDesc = filterMode === "month"
        ? `${MONTHS[selectedMonth - 1]} ${selectedYear}`
        : `${fromDate || "all"} to ${toDate || "today"}`;

      const summaryPayload = {
        period: filterDesc,
        totalIncome: totalInc,
        totalExpenses: totalExp,
        netSavings: savings_amount,
        expensesByCategory: byCategory,
        expensesByMonth: byMonth,
        incomeByMonth,
        netWorthAssets,
        netWorthLiabilities,
        savingsGoals: savings.map(s => ({ name: s.name, target: s.target, saved: s.saved })),
      };

      const prompt = `You are an expert personal finance analyst. Given the user's financial data for the period "${filterDesc}", generate a comprehensive financial analysis report.

Return ONLY valid JSON (no markdown fences, no text outside JSON) with exactly this structure:
{
  "summary": "3-4 sentence executive summary of the user's financial health for this period.",
  "incomeVsExpenseChart": {
    "type": "bar",
    "title": "Income vs Expenses by Month",
    "months": ["2024-01", "2024-02"],
    "income": [number, number],
    "expenses": [number, number]
  },
  "categoryChart": {
    "type": "pie",
    "title": "Spending by Category",
    "labels": ["Food", "Transport"],
    "values": [number, number]
  },
  "savingsChart": {
    "type": "bar",
    "title": "Net Savings Trend",
    "months": ["2024-01"],
    "savings": [number]
  },
  "insights": [
    "Insight 1 sentence.",
    "Insight 2 sentence.",
    "Insight 3 sentence.",
    "Insight 4 sentence.",
    "Insight 5 sentence."
  ],
  "recommendations": [
    "Recommendation 1.",
    "Recommendation 2.",
    "Recommendation 3."
  ],
  "riskFlag": "low" | "medium" | "high",
  "riskExplanation": "One sentence explaining the risk level."
}

Use real numbers only from the data. If no data for a month, skip it.

User financial data:
${JSON.stringify(summaryPayload, null, 2)}`;

      const rawText = await callGemini(prompt);
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      const parsed  = JSON.parse(cleaned);

      setAnalysis({ ...parsed, rawData: summaryPayload });
    } catch (err) {
      console.error("OverallAnalysis error:", err);
      setError("Failed to generate analysis: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
    }
  };

  // ── PDF Export ────────────────────────────────────────────────
  const handleExportPDF = () => {
    if (!reportRef.current) return;
    const printWindow = window.open("", "_blank");
    printWindow.document.write(`
      <html><head><title>Overall Financial Analysis</title>
      <style>
        body { font-family: Arial, sans-serif; color: #111; margin: 24px; }
        h1 { color: #312e81; } h2 { color: #4338ca; border-bottom: 1px solid #e0e7ff; padding-bottom: 6px; }
        .summary { background: #f0f4ff; border-radius: 8px; padding: 14px; margin-bottom: 18px; line-height: 1.6; }
        .insight { background: #fafffe; border-left: 4px solid #6366f1; padding: 8px 12px; margin: 6px 0; border-radius: 4px; }
        .rec { background: #f0fdf4; border-left: 4px solid #10b981; padding: 8px 12px; margin: 6px 0; border-radius: 4px; }
        .risk-low { color: #10b981; font-weight: 700; }
        .risk-medium { color: #f59e0b; font-weight: 700; }
        .risk-high { color: #ef4444; font-weight: 700; }
        table { width: 100%; border-collapse: collapse; margin: 12px 0; }
        th { background: #e0e7ff; padding: 8px; text-align: left; }
        td { padding: 8px; border-bottom: 1px solid #f1f5f9; }
        @media print { button { display: none; } }
      </style></head><body>
      <h1>📊 Overall Financial Analysis</h1>
      <p><strong>Period:</strong> ${analysis?.rawData?.period || ""}</p>
      ${reportRef.current.innerHTML}
      </body></html>
    `);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 600);
  };

  // ── Render helpers ────────────────────────────────────────────
  const renderIncomeVsExpense = () => {
    const c = analysis?.incomeVsExpenseChart;
    if (!c || !c.months?.length) return null;
    const data = c.months.map((m, i) => ({
      name: m, income: c.income[i] || 0, expenses: c.expenses[i] || 0
    }));
    return (
      <div style={chartBox}>
        <div style={chartTitle}>{c.title}</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={v => `₹${v.toLocaleString()}`} />
            <Legend />
            <Bar dataKey="income" fill="#10b981" radius={[4,4,0,0]} name="Income" />
            <Bar dataKey="expenses" fill="#ef4444" radius={[4,4,0,0]} name="Expenses" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderCategoryChart = () => {
    const c = analysis?.categoryChart;
    if (!c || !c.labels?.length) return null;
    const data = c.labels.map((l, i) => ({ name: l, value: c.values[i] || 0 }));
    return (
      <div style={chartBox}>
        <div style={chartTitle}>{c.title}</div>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={v => `₹${v.toLocaleString()}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const renderSavingsChart = () => {
    const c = analysis?.savingsChart;
    if (!c || !c.months?.length) return null;
    const data = c.months.map((m, i) => ({ name: m, savings: c.savings[i] || 0 }));
    return (
      <div style={chartBox}>
        <div style={chartTitle}>{c.title}</div>
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={v => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={v => `₹${v.toLocaleString()}`} />
            <Line type="monotone" dataKey="savings" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} name="Net Savings" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    );
  };

  const riskColor = { low: "#10b981", medium: "#f59e0b", high: "#ef4444" };

  // ── Styles ─────────────────────────────────────────────────────
  const chartBox = {
    background: "#fff", borderRadius: 16, padding: "18px 20px",
    boxShadow: "0 6px 20px rgba(0,0,0,0.07)", marginBottom: 20,
  };
  const chartTitle = {
    fontWeight: 800, fontSize: 15, color: "#312e81", marginBottom: 12,
  };

  return (
    <div style={{ padding: "0 24px 40px", maxWidth: 960, margin: "0 auto" }}>
      {/* Page Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <Sparkles size={26} color="#6366f1" />
        <div>
          <h2 style={{ margin: 0, color: "#312e81", fontWeight: 900 }}>Overall Financial Analysis</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>AI-powered deep analysis of your finances</p>
        </div>
      </div>

      {/* ── Filter Controls ── */}
      <div style={{
        background: "#f8faff", borderRadius: 16, padding: "18px 20px",
        boxShadow: "0 4px 14px rgba(99,102,241,0.08)", marginBottom: 24,
        border: "1.5px solid rgba(99,102,241,0.10)",
      }}>
        <div style={{ fontWeight: 700, color: "#312e81", marginBottom: 14, fontSize: 15 }}>
          <Calendar size={16} style={{ marginRight: 6, verticalAlign: "middle" }} />
          Select Period
        </div>

        {/* Mode Toggle */}
        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          {["month", "range"].map(mode => (
            <button key={mode} onClick={() => setFilterMode(mode)} style={{
              padding: "7px 18px", borderRadius: 99, border: "none", fontWeight: 700, fontSize: 13,
              background: filterMode === mode ? "#6366f1" : "#e0e7ff",
              color: filterMode === mode ? "#fff" : "#312e81", cursor: "pointer",
            }}>
              {mode === "month" ? "Month / Year" : "Date Range"}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" }}>
          {filterMode === "month" ? (
            <>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Month</label>
                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #c7d2fe", fontSize: 14, minWidth: 130 }}>
                  {MONTHS.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
                </select>
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Year</label>
                <input type="number" value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
                  min="2000" max="2100" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #c7d2fe", fontSize: 14, width: 100 }} />
              </div>
            </>
          ) : (
            <>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>From Date</label>
                <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #c7d2fe", fontSize: 14 }} />
              </div>
              <div>
                <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 4 }}>To Date</label>
                <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #c7d2fe", fontSize: 14 }} />
              </div>
            </>
          )}

          <button onClick={handleGenerate} disabled={loading} style={{
            padding: "10px 24px", borderRadius: 12, border: "none",
            background: "linear-gradient(135deg,#6366f1,#4338ca)", color: "#fff",
            fontWeight: 800, fontSize: 14, cursor: loading ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", gap: 8, opacity: loading ? 0.7 : 1,
          }}>
            <RefreshCw size={15} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
            {loading ? "Generating…" : "Generate Analysis"}
          </button>

          {analysis && (
            <button onClick={handleExportPDF} style={{
              padding: "10px 20px", borderRadius: 12, border: "1.5px solid #6366f1",
              background: "#fff", color: "#6366f1", fontWeight: 800, fontSize: 14,
              cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
            }}>
              <Download size={15} /> Export PDF
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 16, color: "#b91c1c", marginBottom: 20 }}>
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#6366f1", fontWeight: 800, fontSize: 18 }}>
          🤖 Gemini AI is deeply analysing your financial data…
          <div style={{ fontSize: 14, color: "#94a3b8", marginTop: 8, fontWeight: 400 }}>This may take a few seconds</div>
        </div>
      )}

      {/* ── Report Output ── */}
      {!loading && analysis && (
        <div ref={reportRef}>

          {/* Executive Summary */}
          <div style={{ ...chartBox, background: "linear-gradient(135deg,#f0f4ff,#fafffe)", border: "1.5px solid rgba(99,102,241,0.12)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Sparkles size={18} color="#6366f1" />
              <span style={{ fontWeight: 800, fontSize: 16, color: "#312e81" }}>Executive Summary</span>
              <span style={{ fontSize: 12, background: "#e0e7ff", color: "#4338ca", borderRadius: 99, padding: "2px 10px", fontWeight: 700 }}>
                {analysis.rawData.period}
              </span>
            </div>
            <p style={{ color: "#334155", lineHeight: 1.7, margin: 0 }}>{analysis.summary}</p>
          </div>

          {/* KPI Row */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px,1fr))", gap: 14, marginBottom: 20 }}>
            {[
              { label: "Total Income", value: analysis.rawData.totalIncome, color: "#10b981" },
              { label: "Total Expenses", value: analysis.rawData.totalExpenses, color: "#ef4444" },
              { label: "Net Savings", value: analysis.rawData.netSavings, color: analysis.rawData.netSavings >= 0 ? "#6366f1" : "#f59e0b" },
              { label: "Net Worth", value: analysis.rawData.netWorthAssets - analysis.rawData.netWorthLiabilities, color: "#0ea5e9" },
            ].map((k, i) => (
              <div key={i} style={{ background: "#fff", borderRadius: 14, padding: "18px", boxShadow: "0 4px 14px rgba(0,0,0,0.06)", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 900, color: k.color }}>₹{Number(k.value).toLocaleString()}</div>
                <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600, marginTop: 4 }}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Charts */}
          {renderIncomeVsExpense()}
          {renderCategoryChart()}
          {renderSavingsChart()}

          {/* Insights */}
          {analysis.insights?.length > 0 && (
            <div style={chartBox}>
              <div style={chartTitle}>📌 Key Insights</div>
              {analysis.insights.map((ins, i) => (
                <div key={i} style={{
                  background: "#f0f4ff", borderLeft: "4px solid #6366f1",
                  borderRadius: 8, padding: "10px 14px", marginBottom: 10,
                  color: "#1e293b", fontSize: 14, lineHeight: 1.6,
                }}>
                  {i + 1}. {ins}
                </div>
              ))}
            </div>
          )}

          {/* Recommendations */}
          {analysis.recommendations?.length > 0 && (
            <div style={chartBox}>
              <div style={chartTitle}>✅ Recommendations</div>
              {analysis.recommendations.map((rec, i) => (
                <div key={i} style={{
                  background: "#f0fdf4", borderLeft: "4px solid #10b981",
                  borderRadius: 8, padding: "10px 14px", marginBottom: 10,
                  color: "#1e293b", fontSize: 14, lineHeight: 1.6,
                }}>
                  {i + 1}. {rec}
                </div>
              ))}
            </div>
          )}

          {/* Risk Flag */}
          {analysis.riskFlag && (
            <div style={{ ...chartBox, border: `1.5px solid ${riskColor[analysis.riskFlag] || "#94a3b8"}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontWeight: 900, fontSize: 15, color: riskColor[analysis.riskFlag] || "#94a3b8" }}>
                  ⚠️ Financial Risk Level: {analysis.riskFlag?.toUpperCase()}
                </span>
              </div>
              <p style={{ color: "#334155", marginTop: 8, marginBottom: 0, fontSize: 14 }}>{analysis.riskExplanation}</p>
            </div>
          )}
        </div>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}