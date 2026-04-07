import { Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { useEffect, useState } from "react";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";

import AddExpense from "./pages/AddExpense";
import ExpenseList from "./pages/ExpenseList";
import Categories from "./pages/Categories";
import MonthlyBudget from "./pages/MonthlyBudget";
import Analytics from "./pages/Analytics";
import Savings from "./pages/Savings";
import Reports from "./pages/Reports";
import Profile from "./pages/Profile";

/* ================= NEW PAGES ================= */
import Transactions from "./pages/Transactions";
import Recurring from "./pages/Recurring";
import NetWorth from "./pages/NetWorth";
import BudgetsOverview from "./pages/BudgetsOverview";
import ScheduledBills from "./pages/ScheduledBills";
import Trends from "./pages/Trends";
import Income from "./pages/Income";
import ExportData from "./pages/ExportData";
import Settings from "./pages/Settings";
import Help from "./pages/Help";
import OverallAnalysis from "./pages/OverallAnalysis";
/* ============================================ */

import ProtectedRoute from "./components/ProtectedRoute";
import DashboardLayout from "./layouts/DashboardLayout";

// import your gate (named export)
import { AppPinGate } from "./components/PinGate"; // adjust path if different

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });
    return unsub;
  }, []);

  if (loading) return null;

  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Navigate to="/login" />} />

      <Route
        path="/login"
        element={user ? <Navigate to="/dashboard" /> : <Login />}
      />

      <Route
        path="/register"
        element={user ? <Navigate to="/dashboard" /> : <Register />}
      />

      {/* Protected Layout — wrapped with AppPinGate (reusing user state) */}
      <Route
        element={
          <ProtectedRoute>
            <AppPinGate user={user}>
              <DashboardLayout />
            </AppPinGate>
          </ProtectedRoute>
        }
      >
        {/* Existing */}
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/add-expense" element={<AddExpense />} />
        <Route path="/expenses" element={<ExpenseList />} />
        <Route path="/categories" element={<Categories />} />
        <Route path="/budget" element={<MonthlyBudget />} />
        <Route path="/analytics" element={<Analytics />} />
        <Route path="/savings" element={<Savings />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/profile" element={<Profile />} />

        {/* New */}
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/recurring" element={<Recurring />} />
        <Route path="/net-worth" element={<NetWorth />} />
        <Route path="/budgets-overview" element={<BudgetsOverview />} />
        <Route path="/scheduled-bills" element={<ScheduledBills />} />
        <Route path="/trends" element={<Trends />} />
        <Route path="/income" element={<Income />} />
        <Route path="/export" element={<ExportData />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/help" element={<Help />} />
        <Route path="/overall-analysis" element={<OverallAnalysis />} />
      </Route>
    </Routes>
  );
}
