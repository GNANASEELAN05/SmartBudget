import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  getDatabase,
  ref,
  push,
  set,
  onValue,
  off,
  get, // <--- ADDED
} from "firebase/database";

export default function AddExpense() {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState(""); // ISO for <input type="date"> (yyyy-mm-dd)
  const [note, setNote] = useState("");
  const [paymentMode, setPaymentMode] = useState("");
  const [expenses, setExpenses] = useState([]);
  const [editingId, setEditingId] = useState(null);

  const [userName, setUserName] = useState("");
  const [mobile, setMobile] = useState("");

  // Popup state (replaces alert)
  const [popup, setPopup] = useState({
    visible: false,
    title: "",
    message: "",
  });

  const showPopup = (title, message) => {
    setPopup({ visible: true, title, message });
  };

  const closePopup = () => {
    setPopup({ visible: false, title: "", message: "" });
  };

  /* ================= DATE HELPERS ================= */
  const formatDateToDMY = (isoOrDate) => {
    // Accepts yyyy-mm-dd or any Date-parsable string
    if (!isoOrDate) return "";
    const d = new Date(isoOrDate);
    if (isNaN(d)) return ""; // fallback
    const day = String(d.getDate()).padStart(2, "0");
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const year = d.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const isoFromDMY = (dmy) => {
    // Convert dd/mm/yyyy -> yyyy-mm-dd
    if (!dmy || !dmy.includes("/")) return "";
    const parts = dmy.split("/");
    if (parts.length !== 3) return "";
    const [dd, mm, yyyy] = parts;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  };

  /* ================= FETCH USER PROFILE ================= */
  useEffect(() => {
    if (!user) return;
    get(ref(db, `users/${user.uid}/profile`)).then((snap) => {
      if (snap.exists()) {
        setUserName(snap.val().name || "");
        setMobile(snap.val().mobile || "");
      }
    });
  }, [db, user]);

  /* ================= SAVE / UPDATE ================= */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!amount || !category || !date) {
      showPopup("Missing fields", "Please fill all required fields");
      return;
    }

    // guard against future year (same as your earlier logic)
    const selectedYear = new Date(date).getFullYear();
    const currentYear = new Date().getFullYear();
    if (selectedYear > currentYear) {
      showPopup("Invalid date", "Future year expenses are not allowed");
      return;
    }

    if (!user) {
      showPopup("Not signed in", "Please sign in to add an expense");
      return;
    }

    try {
      const expenseRef = editingId
        ? ref(db, `users/${user.uid}/expenses/${editingId}`)
        : push(ref(db, `users/${user.uid}/expenses`));

      // Save both iso (for input/edit) and DMY (for display).
      // Also write `date` as dd/mm/yyyy so other pages that read `exp.date` get dd/mm/yyyy.
      await set(expenseRef, {
        name: userName,
        mobile,
        amount: Number(amount),
        category,
        dateISO: date, // yyyy-mm-dd
        dateDMY: formatDateToDMY(date), // dd/mm/yyyy
        date: formatDateToDMY(date), // <-- added: dd/mm/yyyy for compatibility with other pages
        paymentMode,
        note,
        createdAt: Date.now(),
        source: "addExpensePage",
      });

      // show success popup
      showPopup(
        editingId ? "Expense updated" : "Expense added",
        editingId ? "Expense updated successfully." : "Expense added successfully."
      );

      resetForm();
    } catch (err) {
      console.error("Failed to save expense:", err);
      showPopup("Save failed", "There was an error saving the expense. Please try again.");
    }
  };

  const resetForm = () => {
    setAmount("");
    setCategory("");
    setDate("");
    setNote("");
    setPaymentMode("");
    setEditingId(null);
  };

  /* ================= FETCH EXPENSES (ONLY FROM THIS PAGE) ================= */
  useEffect(() => {
    if (!user) return;
    const expensesRef = ref(db, `users/${user.uid}/expenses`);

    const listener = onValue(expensesRef, (snapshot) => {
      const data = snapshot.val() || {};
      const now = Date.now();

      const list = Object.entries(data)
        .map(([id, val]) => {
          // normalize fields for older records and ensure `.date` contains dd/mm/yyyy
          const item = {
            id,
            ...val,
            // handle legacy date stored as `date` in dd/mm/yyyy
            dateDMY:
              val.dateDMY ||
              (val.date && typeof val.date === "string" && val.date.includes("/") ? val.date : null) ||
              (val.dateISO ? formatDateToDMY(val.dateISO) : ""),
            dateISO:
              val.dateISO ||
              (val.date && typeof val.date === "string" && val.date.includes("/") ? isoFromDMY(val.date) : null) ||
              null,
            // ensure `date` is present as dd/mm/yyyy for compatibility
            date:
              val.date ||
              (val.dateDMY ? val.dateDMY : (val.dateISO ? formatDateToDMY(val.dateISO) : "")),
            createdAt: val.createdAt || 0,
            source: val.source || null,
          };
          return item;
        })
        // FIRST filter: only show items created via this AddExpense page
        .filter((exp) => exp.source === "addExpensePage")
        // SECOND filter: only show items created in last 24 hours (as before)
        .filter((exp) => now - (exp.createdAt || 0) < 24 * 60 * 60 * 1000)
        // sort by createdAt desc (most recent first)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      setExpenses(list);
    });

    return () => {
      off(expensesRef, "value", listener);
    };
  }, [db, user]);

  /* ================= ACTIONS ================= */
  const handleEdit = (exp) => {
    setEditingId(exp.id);
    setAmount(String(exp.amount ?? ""));
    setCategory(exp.category ?? "");
    // prefer ISO for the date input; convert DMY to ISO if needed
    if (exp.dateISO) setDate(exp.dateISO);
    else if (exp.dateDMY) setDate(isoFromDMY(exp.dateDMY));
    else if (exp.date) {
      // if exp.date is dd/mm/yyyy convert to ISO
      setDate(isoFromDMY(exp.date));
    } else setDate(""); // fallback
    setPaymentMode(exp.paymentMode || "");
    setNote(exp.note || "");
  };

  /* ================= STYLES ================= */
  const input = {
    width: "100%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #9ca3af",
    fontSize: "14px",
    marginBottom: "14px",
  };

  const inputSmall = {
    width: "94%",
    padding: "8px 12px",
    borderRadius: "6px",
    border: "1px solid #9ca3af",
    fontSize: "14px",
    marginBottom: "14px",
  };

  const label = {
    fontWeight: 600,
    color: "#065f46",
    marginBottom: "4px",
    display: "block",
  };

  const card = {
    background: "#e6f7ef",
    padding: "22px",
    borderRadius: "12px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.1)",
  };

  const btnPrimary = {
    width: "100%",
    padding: "10px",
    background: "#0f9960",
    color: "#fff",
    border: "none",
    borderRadius: "8px",
    fontSize: "16px",
    fontWeight: 600,
    cursor: "pointer",
  };

  const btnCancel = {
    width: "100%",
    padding: "10px",
    marginTop: "8px",
    background: "#d1d5db",
    border: "none",
    borderRadius: "8px",
    fontWeight: 600,
    cursor: "pointer",
  };

  const tableHeader = {
    padding: "10px",
    color: "#065f46",
    fontWeight: 700,
    borderBottom: "2px solid #86efac",
  };

  const tableCell = {
    padding: "10px",
    fontSize: "13px",
    color: "#064e3b",
    textAlign: "center",
  };

  /* ================= JSX ================= */
  return (
    <div style={{ padding: "0 24px 24px" }}>
      <h2 style={{ color: "#065f46" }}>Add Expense</h2>
      <p style={{ color: "#475569" }}>Track your daily expenses</p>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1.4fr",
          gap: "24px",
          marginTop: "12px",
        }}
      >
        {/* LEFT FORM */}
        <div style={card}>
          <form onSubmit={handleSubmit}>
            <label style={label}>Amount</label>
            <input
              style={inputSmall}
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />

            <label style={label}>Category</label>
            <select
              style={input}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">Select</option>
              <option>Food</option>
              <option>Transport</option>
              <option>Shopping</option>
              <option>Bills</option>
              <option>Entertainment</option>
              <option>Other</option>
            </select>

            <label style={label}>Date</label>
            <input
              style={inputSmall}
              type="date"
              value={date}
              max={new Date().toISOString().split("T")[0]}
              onChange={(e) => setDate(e.target.value)}
            />

            <label style={label}>Payment Mode</label>
            <select
              style={input}
              value={paymentMode}
              onChange={(e) => setPaymentMode(e.target.value)}
            >
              <option value="">Select</option>
              <option>Cash</option>
              <option>UPI</option>
              <option>Card</option>
              <option>Net Banking</option>
            </select>

            <label style={label}>Note</label>
            <textarea
              style={{ ...inputSmall, height: "80px" }}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />

            <button type="submit" style={btnPrimary}>
              {editingId ? "Update Expense" : "Add Expense"}
            </button>

            {(amount || editingId) && (
              <button type="button" style={btnCancel} onClick={resetForm}>
                Cancel
              </button>
            )}
          </form>
        </div>

        {/* RIGHT TABLE */}
        <div style={card}>
          <h3 style={{ color: "#065f46", marginBottom: "12px" }}>
            Recent Expenses (Disappears After 24 Hours)
          </h3>

          <table width="100%" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ background: "#bbf7d0" }}>
                <th style={tableHeader}>S.No</th>
                <th style={tableHeader}>Category</th>
                <th style={tableHeader}>Date</th>
                <th style={tableHeader}>Payment</th>
                <th style={tableHeader}>Note</th>
                <th style={tableHeader}>Amount</th>
                <th style={tableHeader}>Action</th>
              </tr>
            </thead>

            <tbody>
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={7} style={{ ...tableCell, padding: "20px" }}>
                    No recent expenses from this page
                  </td>
                </tr>
              )}

              {expenses.map((exp, i) => (
                <tr key={exp.id}>
                  <td style={tableCell}>{i + 1}</td>
                  <td style={tableCell}>{exp.category}</td>
                  <td style={tableCell}>
                    {exp.date || exp.dateDMY || formatDateToDMY(exp.dateISO) || "-"}
                  </td>
                  <td style={tableCell}>{exp.paymentMode || "-"}</td>
                  <td style={tableCell}>{exp.note || "-"}</td>
                  <td
                    style={{
                      ...tableCell,
                      color: "#b91c1c",
                      fontWeight: 700,
                    }}
                  >
                    ₹{exp.amount}
                  </td>
                  <td style={tableCell}>
                    <span
                      onClick={() => handleEdit(exp)}
                      style={{
                        padding: "6px 12px",
                        background: "#bfdbfe",
                        color: "#1e40af",
                        borderRadius: "6px",
                        fontWeight: 700,
                        cursor: "pointer",
                        border: "1px solid #93c5fd",
                        marginRight: "8px",
                        display: "inline-block",
                      }}
                    >
                      Edit
                    </span>
                    {/* Delete button removed as requested */}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Popup modal (replaces alert) */}
      {popup.visible && (
        <div
          role="dialog"
          aria-modal="true"
          style={{
            position: "fixed",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            background: "rgba(0,0,0,0.35)",
            padding: "20px",
          }}
          onClick={closePopup}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "100%",
              maxWidth: "420px",
              background: "#fff",
              borderRadius: "12px",
              padding: "20px",
              boxShadow: "0 8px 30px rgba(2,6,23,0.2)",
            }}
          >
            <h3 style={{ margin: 0, color: "#064e3b" }}>{popup.title}</h3>
            <p style={{ color: "#475569", marginTop: "8px" }}>{popup.message}</p>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
              <button
                onClick={closePopup}
                style={{
                  padding: "8px 14px",
                  borderRadius: "8px",
                  border: "none",
                  background: "#0f9960",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
