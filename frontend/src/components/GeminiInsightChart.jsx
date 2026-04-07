import { useEffect, useState, useCallback } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, get } from "firebase/database";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell
} from "recharts";
import { Sparkles, RefreshCw } from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "";
const COLORS = ["#6366f1","#22d3ee","#f59e0b","#10b981","#ef4444","#8b5cf6","#f43f5e"];

async function callGeminiDirect(promptText, idToken) {
  const res = await fetch(`${API_BASE}/api/gemini/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(idToken ? { Authorization: `Bearer ${idToken}` } : {}),
    },
    body: JSON.stringify({ prompt: promptText, data: {} }),
  });
  if (!res.ok) throw new Error("Gemini API error: " + res.status);
  const data = await res.json();
  if (data.error) throw new Error(data.error);
  return data.result;
}

export default function GeminiInsightChart({ pageContext = "dashboard" }) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  const [loading, setLoading] = useState(false);
  const [chartData, setChartData] = useState(null);
  const [explanation, setExplanation] = useState("");
  const [error, setError] = useState("");

  const fetchAndGenerate = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    setChartData(null);
    setExplanation("");

    try {
      const idToken = await user.getIdToken();
      // Fetch all user financial data
      const snap = await get(ref(db, `users/${user.uid}`));
      const userData = snap.exists() ? snap.val() : {};

      // Build a concise summary for Gemini
      const expenses = userData.expenses ? Object.values(userData.expenses) : [];
      const income = userData.income ? Object.values(userData.income) : [];
      const savings = userData.savings ? Object.values(userData.savings) : [];
      const assets = userData.assets ? Object.values(userData.assets) : [];
      const liabilities = userData.liabilities ? Object.values(userData.liabilities) : [];

      const summaryData = {
        context: pageContext,
        totalExpenses: expenses.reduce((s, e) => s + (Number(e.amount) || 0), 0),
        totalIncome: income.reduce((s, i) => s + (Number(i.amount) || 0), 0),
        expensesByCategory: expenses.reduce((acc, e) => {
          if (e.category) acc[e.category] = (acc[e.category] || 0) + (Number(e.amount) || 0);
          return acc;
        }, {}),
        monthlyExpenses: expenses.reduce((acc, e) => {
          const d = e.dateISO || e.date || "";
          const month = d.length >= 7 ? d.substring(0, 7) : "unknown";
          acc[month] = (acc[month] || 0) + (Number(e.amount) || 0);
          return acc;
        }, {}),
        monthlyIncome: income.reduce((acc, i) => {
          const d = i.date || i.dateISO || "";
          const month = d.length >= 7 ? d.substring(0, 7) : "unknown";
          acc[month] = (acc[month] || 0) + (Number(i.amount) || 0);
          return acc;
        }, {}),
        savingsGoals: savings.map(s => ({ name: s.name, target: s.target, saved: s.saved })),
        netWorthAssets: assets.reduce((s, a) => s + (Number(a.value) || 0), 0),
        netWorthLiabilities: liabilities.reduce((s, l) => s + (Number(l.value) || 0), 0),
      };

      const pageLabel = pageContext === "networth" ? "Net Worth" : "Dashboard";
      const prompt = `You are a financial data analyst. Given the user's financial data below, generate a meaningful insight chart for the "${pageLabel}" page.

Return ONLY valid JSON (no markdown, no explanation outside JSON) with this exact structure:
{
  "chartType": "bar" | "line" | "pie",
  "title": "Short descriptive title",
  "labels": ["label1", "label2", ...],
  "values": [number1, number2, ...],
  "explanation": "2-3 sentence plain English insight about what the chart shows and what the user should know."
}

Rules:
- For dashboard: show monthly expense vs income trend as a bar or line chart (use months as labels).
- For networth: show assets vs liabilities breakdown as a pie or bar chart.
- All values must be real numbers from the data. Do not invent data.
- labels and values arrays must have same length.
- If data is insufficient, return a simple category breakdown of expenses.

Financial data:
${JSON.stringify(summaryData, null, 2)}`;

      const rawText = await callGeminiDirect(prompt, idToken);

      // Clean and parse JSON
      const cleaned = rawText.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(cleaned);

      // Build recharts-compatible data
      const chartPoints = parsed.labels.map((label, i) => ({
        name: label,
        value: parsed.values[i] || 0,
      }));

      setChartData({ ...parsed, points: chartPoints });
      setExplanation(parsed.explanation || "");
    } catch (err) {
      console.error("GeminiInsightChart error:", err);
      setError("Could not generate AI chart. " + (err.message || ""));
    } finally {
      setLoading(false);
    }
  }, [user, db, pageContext]);

  useEffect(() => {
    fetchAndGenerate();
  }, [fetchAndGenerate]);

  const renderChart = () => {
    if (!chartData) return null;
    const { chartType, points } = chartData;

    if (chartType === "pie") {
      return (
        <ResponsiveContainer width="100%" height={260}>
          <PieChart>
            <Pie data={points} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
              {points.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      );
    }

    if (chartType === "line") {
      return (
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={points}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
            <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
            <Legend />
            <Line type="monotone" dataKey="value" stroke="#6366f1" strokeWidth={2} dot={{ r: 4 }} />
          </LineChart>
        </ResponsiveContainer>
      );
    }

    // default: bar
    return (
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={points}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tickFormatter={(v) => `₹${(v/1000).toFixed(0)}k`} />
          <Tooltip formatter={(v) => `₹${v.toLocaleString()}`} />
          <Legend />
          <Bar dataKey="value" radius={[6, 6, 0, 0]}>
            {chartData.points.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div style={{
      marginTop: 28,
      borderRadius: 18,
      background: "linear-gradient(135deg, #f0f4ff 0%, #fafffe 100%)",
      boxShadow: "0 8px 28px rgba(99,102,241,0.10)",
      padding: "22px 24px",
      border: "1.5px solid rgba(99,102,241,0.12)",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Sparkles size={20} color="#6366f1" />
          <span style={{ fontWeight: 800, fontSize: 16, color: "#312e81" }}>
            {chartData?.title || "AI Insight Chart"}
          </span>
          <span style={{
            fontSize: 11, fontWeight: 700, background: "linear-gradient(90deg,#6366f1,#22d3ee)",
            color: "#fff", borderRadius: 99, padding: "2px 10px"
          }}>Powered by Gemini AI</span>
        </div>
        <button
          onClick={fetchAndGenerate}
          disabled={loading}
          style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: "7px 14px", borderRadius: 99, border: "1.5px solid #6366f1",
            background: "#fff", color: "#6366f1", fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer", fontSize: 13,
          }}
        >
          <RefreshCw size={14} style={{ animation: loading ? "spin 1s linear infinite" : "none" }} />
          {loading ? "Generating…" : "Refresh"}
        </button>
      </div>

      {/* Content */}
      {loading && (
        <div style={{ textAlign: "center", padding: "40px 0", color: "#6366f1", fontWeight: 700 }}>
          🤖 Gemini AI is analysing your data…
        </div>
      )}
      {error && (
        <div style={{ color: "#ef4444", padding: "12px 0", fontWeight: 600 }}>{error}</div>
      )}
      {!loading && chartData && (
        <>
          {renderChart()}
          {explanation && (
            <div style={{
              marginTop: 16, padding: "14px 18px", borderRadius: 12,
              background: "rgba(99,102,241,0.07)", border: "1px solid rgba(99,102,241,0.12)",
              color: "#312e81", fontSize: 14, lineHeight: 1.6,
            }}>
              <strong>AI Insight:</strong> {explanation}
            </div>
          )}
        </>
      )}

      <style>{`@keyframes spin { from { transform:rotate(0deg); } to { transform:rotate(360deg); } }`}</style>
    </div>
  );
}