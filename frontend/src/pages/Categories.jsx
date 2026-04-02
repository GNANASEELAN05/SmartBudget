import { useEffect, useMemo, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, push, onValue, remove } from "firebase/database";

export default function Categories({
  forcedMonth = null,
  forcedYear = null,
  printMode = false,
}) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  /* ================= STATES ================= */
  const [categories, setCategories] = useState([]);

  const [name, setName] = useState("");
  const [type, setType] = useState("expense");
  const [limit, setLimit] = useState("");
  const [color, setColor] = useState("#16a34a");

  /* ===== CREATE MONTH / YEAR ===== */
  const now = new Date();
  const [createMonth, setCreateMonth] = useState(now.getMonth() + 1);
  const [createYear, setCreateYear] = useState(now.getFullYear());

  /* ===== FILTER STATES ===== */
  const [filterMonth, setFilterMonth] = useState("");
  const [filterYear, setFilterYear] = useState("");

  /* ================= CONFIRM MODAL STATE ================= */
  const [modal, setModal] = useState({
    open: false,
    title: "",
    message: "",
    showCancel: true,
    confirmText: "OK",
    cancelText: "Cancel",
    onConfirm: null,
  });

  const openModal = ({ title = "", message = "", showCancel = true, confirmText = "OK", cancelText = "Cancel", onConfirm = null }) => {
    setModal({ open: true, title, message, showCancel, confirmText, cancelText, onConfirm });
  };

  const closeModal = () => setModal((m) => ({ ...m, open: false }));

  /* ================= When in printMode, sync filters to forced period ================= */
  useEffect(() => {
    if (printMode) {
      // forcedMonth is expected as 0..11; convert to stored month 1..12
      if (forcedMonth !== null && forcedMonth !== undefined) {
        setFilterMonth(String(Number(forcedMonth) + 1));
      } else {
        setFilterMonth("");
      }
      if (forcedYear !== null && forcedYear !== undefined) {
        setFilterYear(String(forcedYear));
      } else {
        setFilterYear("");
      }
    }
    // when not in printMode, do not override user filters
  }, [printMode, forcedMonth, forcedYear]);

  /* ================= FETCH ================= */
  useEffect(() => {
    if (!user) return;

    const catRef = ref(db, `users/${user.uid}/categories`);
    onValue(catRef, (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data).map(([id, val]) => ({
        id,
        ...val,
      }));
      setCategories(list);
    });
  }, [db, user]);

  /* ================= ADD ================= */
  const handleAdd = async () => {
    if (!name) {
      openModal({
        title: "Missing category",
        message: "Please select a category before adding.",
        showCancel: false,
        confirmText: "OK",
      });
      return;
    }

    const exists = categories.some(
      (c) =>
        c.name === name &&
        c.month === createMonth &&
        c.year === createYear
    );
    if (exists) {
      openModal({
        title: "Category exists",
        message: "Category already exists for this month/year.",
        showCancel: false,
        confirmText: "OK",
      });
      return;
    }

    await push(ref(db, `users/${user.uid}/categories`), {
      name,
      type,
      monthlyLimit: type === "expense" ? Number(limit) || null : null,
      color,
      month: createMonth,
      year: createYear,
      createdAt: Date.now(),
    });

    setName("");
    setLimit("");
    setColor("#16a34a");
    setType("expense");
  };

  /* ================= DELETE ================= */
  const handleDelete = async (id) => {
    openModal({
      title: "Delete category",
      message: "Are you sure you want to delete this category? This action cannot be undone.",
      showCancel: true,
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        await remove(ref(db, `users/${user.uid}/categories/${id}`));
        closeModal();
      },
    });
  };

  /* ================= FILTER ================= */
  const filteredCategories = useMemo(() => {
    return categories.filter((cat) => {
      if (!filterMonth && !filterYear) return true;
      if (filterMonth && Number(filterMonth) !== cat.month) return false;
      if (filterYear && Number(filterYear) !== cat.year) return false;
      return true;
    });
  }, [categories, filterMonth, filterYear]);

  /* ================= STYLES ================= */
  const card = {
    background: "#e6f7ef",
    padding: "22px",
    borderRadius: "12px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.1)",
  };

  const input = {
    padding: "8px 10px",
    borderRadius: "6px",
    border: "1px solid #9ca3af",
    fontSize: "13px",
  };

  const button = {
    padding: "8px 16px",
    background: "#0f9960",
    color: "white",
    borderRadius: "6px",
    fontWeight: 700,
    cursor: "pointer",
    border: "none",
  };

  /* ================= JSX ================= */
  return (
    <div style={card}>
      {/* ===== INSTRUCTION CARD ===== */}
      <div
        style={{
          background: "#cffafe",
          border: "1px solid #06b6d4",
          padding: "14px 18px",
          borderRadius: "10px",
          marginBottom: "18px",
          color: "#0e7490",
          fontSize: "13px",
          lineHeight: "1.6",
        }}
      >
        <strong>How to use Categories:</strong>
        <ul style={{ paddingLeft: "18px", marginTop: "6px" }}>
          <li>Create categories to organize your income and expenses.</li>
          <li>
            <strong>Expense categories</strong> can have monthly limits for
            budgeting.
          </li>
          <li>
            Category colors are used in <strong>Analytics & Reports</strong>.
          </li>
          <li>Categories automatically appear when adding new expenses.</li>
        </ul>
      </div>

      {/* FILTER — hide during export (printMode) */}
      {!printMode && (
        <div style={{ display: "flex", gap: "10px", marginBottom: "18px" }}>
          <select
            style={input}
            value={filterMonth}
            onChange={(e) => setFilterMonth(e.target.value)}
          >
            <option value="">All Months</option>
            {Array.from({ length: 12 }).map((_, i) => (
              <option key={i} value={i + 1}>
                {new Date(0, i).toLocaleString("default", { month: "long" })}
              </option>
            ))}
          </select>

          <input
            type="number"
            placeholder="Year"
            style={input}
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          />
        </div>
      )}

      <h3 style={{ color: "#065f46", marginBottom: "16px" }}>Categories</h3>

      {/* ADD CATEGORY */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))",
          gap: "10px",
          marginBottom: "22px",
          alignItems: "center",
        }}
      >
        {/* CATEGORY NAME AS OPTIONS */}
        <select
          style={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
        >
          <option value="">Select</option>
          <option>Food</option>
          <option>Transport</option>
          <option>Shopping</option>
          <option>Bills</option>
          <option>Entertainment</option>
          <option>Other</option>
        </select>

        <select
          style={input}
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </select>

        <input
          type="number"
          style={input}
          placeholder="Monthly limit"
          disabled={type === "income"}
          value={limit}
          onChange={(e) => setLimit(e.target.value)}
        />

        <select
          style={input}
          value={createMonth}
          onChange={(e) => setCreateMonth(Number(e.target.value))}
        >
          {Array.from({ length: 12 }).map((_, i) => (
            <option key={i} value={i + 1}>
              {new Date(0, i).toLocaleString("default", { month: "long" })}
            </option>
          ))}
        </select>

        <input
          type="number"
          style={input}
          value={createYear}
          onChange={(e) => setCreateYear(Number(e.target.value))}
        />

        <input
          type="color"
          style={{ height: "36px", border: "none", cursor: "pointer" }}
          value={color}
          onChange={(e) => setColor(e.target.value)}
        />

        <button style={button} onClick={handleAdd}>
          Add
        </button>
      </div>

      {/* GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
          gap: "14px",
        }}
      >
        {filteredCategories.map((cat) => (
          <div
            key={cat.id}
            style={{
              background: "#ffffff",
              padding: "16px",
              borderRadius: "12px",
              borderLeft: `6px solid ${cat.color}`,
              boxShadow: "0 6px 14px rgba(0,0,0,0.12)",
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                top: "12px",
                right: "12px",
                background: "#dcfce7",
                color: "#166534",
                padding: "4px 10px",
                borderRadius: "999px",
                fontSize: "12px",
                fontWeight: 700,
              }}
            >
              ₹{cat.monthlyLimit ?? "—"}
            </div>

            <div
              style={{
                fontWeight: 700,
                fontSize: "15px",
                marginBottom: "6px",
                color: "#064e3b",
              }}
            >
              {cat.name}
            </div>

            <div style={{ fontSize: "13px", color: "#4338ca" }}>
              Type: {cat.type.charAt(0).toUpperCase() + cat.type.slice(1)}
            </div>

            <div style={{ fontSize: "12px", color: "#0f766e" }}>
              Month: {" "}
              {new Date(0, cat.month - 1).toLocaleString("default", {
                month: "long",
              })}{" "}
              {cat.year}
            </div>

            <div
              onClick={() => handleDelete(cat.id)}
              style={{
                marginTop: "14px",
                padding: "7px",
                textAlign: "center",
                background: "#fecaca",
                color: "#7f1d1d",
                borderRadius: "6px",
                fontWeight: 700,
                cursor: "pointer",
                border: "1px solid #f87171",
              }}
            >
              Delete
            </div>
          </div>
        ))}
      </div>

      {/* ======= MODAL ======= */}
      {modal.open && (
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
          }}
        >
          <div
            onClick={closeModal}
            style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.4)" }}
          />

          <div
            style={{
              background: "#ffffff",
              padding: "20px",
              borderRadius: "10px",
              width: "420px",
              boxShadow: "0 12px 40px rgba(2,6,23,0.2)",
              position: "relative",
              zIndex: 10000,
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: "8px", color: "#0f172a" }}>{modal.title}</div>
            <div style={{ fontSize: "14px", color: "#334155", marginBottom: "18px" }}>{modal.message}</div>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              {modal.showCancel && (
                <button
                  onClick={closeModal}
                  style={{
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #cbd5e1",
                    background: "white",
                    cursor: "pointer",
                    fontWeight: 700,
                  }}
                >
                  {modal.cancelText}
                </button>
              )}

              <button
                onClick={async () => {
                  if (typeof modal.onConfirm === "function") {
                    await modal.onConfirm();
                  } else {
                    closeModal();
                  }
                }}
                style={{
                  padding: "8px 14px",
                  borderRadius: "6px",
                  border: "none",
                  background: modal.confirmText === "Delete" ? "#dc2626" : "#0f9960",
                  color: "white",
                  cursor: "pointer",
                  fontWeight: 800,
                }}
              >
                {modal.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
