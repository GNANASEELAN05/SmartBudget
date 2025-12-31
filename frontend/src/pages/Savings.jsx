import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import {
  getDatabase,
  ref,
  push,
  onValue,
  update,
  remove,
  off,
} from "firebase/database";

import useForcedPeriod from "../hooks/useForcedPeriod"; // added to follow export-safe pattern

export default function Savings({ forcedMonth = null, forcedYear = null, printMode = false }) {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  // keep API parity with other pages (the hook is harmless if not used)
  const [hookMonth, , hookYear] = useForcedPeriod(forcedMonth, forcedYear);

  /* ================= STATES ================= */
  const [goals, setGoals] = useState([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [periodType, setPeriodType] = useState("");
  const [periodValue, setPeriodValue] = useState("");
  const [addAmount, setAddAmount] = useState({});
  const [viewGoalId, setViewGoalId] = useState(null);

  /* ======== NEW: store measured heights for cards ======== */
  const [goalHeights, setGoalHeights] = useState({});

  /* ======= NEW: extra vertical space to add when viewing a card ======= */
  const VIEW_EXTRA_HEIGHT = 120; // px

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

  /* ================= FETCH GOALS ================= */
  useEffect(() => {
    if (!user) return;
    const goalRef = ref(db, `users/${user.uid}/savings`);
    const handler = (snapshot) => {
      const data = snapshot.val() || {};
      const list = Object.entries(data).map(([id, val]) => ({
        id,
        ...val,
        history: val?.history
          ? Object.entries(val.history).map(([hid, h]) => ({
              hid,
              ...h,
            }))
          : [],
      }));
      setGoals(list);
    };

    onValue(goalRef, handler, (err) => {
      console.error("savings listen err", err);
    });

    return () => {
      try { off(goalRef, "value", handler); } catch (e) {}
    };
  }, [db, user]);

  /* ================= CREATE GOAL ================= */
  const handleCreate = async () => {
    if (!user || !db) return alert("You must be signed in to create a goal");
    if (!name.trim()) return alert("Goal name required");
    if (!target || Number(target) <= 0) return alert("Enter valid target amount");
    if (!periodType || !periodValue) return alert("Select time period");

    const daysMap = {
      days: 1,
      weeks: 7,
      months: 30,
      years: 365,
    };

    const totalDays = Number(periodValue) * (daysMap[periodType] || 0);

    try {
      await push(ref(db, `users/${user.uid}/savings`), {
        name,
        target: Number(target),
        saved: 0,
        createdAt: Date.now(),
        periodType,
        periodValue: Number(periodValue),
        deadline: Date.now() + totalDays * 24 * 60 * 60 * 1000,
      });

      setName("");
      setTarget("");
      setPeriodType("");
      setPeriodValue("");
    } catch (e) {
      console.error("create goal err", e);
      alert("Failed to create goal. Check console.");
    }
  };

  /* ================= ADD SAVINGS ================= */
  const handleAddSavings = async (goal) => {
    if (!user || !db) return alert("You must be signed in to add savings");
    if (goal.saved >= goal.target) return;

    const amt = Number(addAmount[goal.id]);
    if (!amt || amt <= 0) return alert("Enter valid amount");

    try {
      await update(ref(db, `users/${user.uid}/savings/${goal.id}`), {
        saved: (Number(goal.saved || 0) + amt),
      });

      await push(ref(db, `users/${user.uid}/savings/${goal.id}/history`), {
        amount: amt,
        date: new Date().toLocaleDateString(),
      });

      setAddAmount((s) => ({ ...s, [goal.id]: "" }));
    } catch (e) {
      console.error("add savings err", e);
      alert("Failed to add savings. Check console.");
    }
  };

  /* ================= REMOVE HISTORY ================= */
  const handleRemoveHistory = async (goal, entry) => {
    if (!user || !db) return alert("You must be signed in to modify history");

    try {
      await remove(ref(db, `users/${user.uid}/savings/${goal.id}/history/${entry.hid}`));
      await update(ref(db, `users/${user.uid}/savings/${goal.id}`), {
        saved: Math.max(Number(goal.saved || 0) - Number(entry.amount || 0), 0),
      });
    } catch (e) {
      console.error("remove history err", e);
      alert("Failed to remove history entry. Check console.");
    }
  };

  /* ================= DELETE GOAL (now uses modal like Categories) ================= */
  const handleDelete = async (id) => {
    if (!user || !db) return alert("You must be signed in to delete a goal");

    openModal({
      title: "Delete savings goal",
      message: "Are you sure you want to delete this savings goal? This action cannot be undone.",
      showCancel: true,
      confirmText: "Delete",
      cancelText: "Cancel",
      onConfirm: async () => {
        try {
          await remove(ref(db, `users/${user.uid}/savings/${id}`));
        } catch (e) {
          console.error("delete goal err", e);
          alert("Failed to delete goal. Check console.");
        } finally {
          // close modal after operation
          closeModal();
        }
      },
    });
  };

  /* ================= TIME STATUS ================= */
  const getTimeStatus = (goal) => {
    const now = Date.now();
    const diffDays = Math.ceil((goal.deadline - now) / (24 * 60 * 60 * 1000));

    if (goal.saved >= goal.target) return { text: "Completed", color: "#16a34a" };

    if (diffDays < 0)
      return {
        text: `Exceeded by ${Math.abs(diffDays)} days`,
        color: "#dc2626",
      };

    return {
      text: `Remaining: ${diffDays} days`,
      color: "#334155",
    };
  };

  /* ================= STYLES ================= */
  const card = {
    background: "#ecfeff",
    padding: "24px",
    borderRadius: "14px",
    boxShadow: "0 6px 18px rgba(0,0,0,0.12)",
  };

  const input = {
    padding: "9px",
    borderRadius: "6px",
    border: "1px solid #9ca3af",
    fontSize: "14px",
  };

  const goalNameInput = {
    padding: "6px",
    borderRadius: "6px",
    border: "1px solid #9ca3af",
    fontSize: "13px",
  };

  const input1 = {
    padding: "7px",
    borderRadius: "6px",
    border: "1px solid #9ca3af",
    fontSize: "12px",
  };

  const button = {
    padding: "8px 16px",
    background: "#0284c7",
    color: "#fff",
    borderRadius: "6px",
    fontWeight: 700,
    border: "none",
    cursor: "pointer",
    flexShrink: 0,
  };

  const tableHeader = {
    padding: "8px",
    fontSize: "13px",
    textAlign: "left",
    color: "#065f46",
    borderBottom: "2px solid #a7f3d0",
  };

  const tableCell = {
    padding: "8px",
    fontSize: "13px",
    borderBottom: "1px solid #e5e7eb",
  };

  /* ======= NEW: measure card heights after render and on resize ======= */
  useEffect(() => {
    function measure() {
      const els = document.querySelectorAll(".goal-card");
      const map = {};
      els.forEach((el) => {
        const id = el.getAttribute("data-id");
        if (id) {
          map[id] = el.clientHeight;
        }
      });
      setGoalHeights(map);
    }
    // measure after a tick so content has rendered
    setTimeout(measure, 50);

    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [goals, viewGoalId]);

  /* ================= JSX ================= */
  return (
    <div style={card}>
      <style>{`
        .hidden-scroll {
          scrollbar-width: none; /* Firefox */
          -ms-overflow-style: none; /* IE 10+ */
        }
        .hidden-scroll::-webkit-scrollbar {
          display: none; /* Safari/WebKit */
        }
      `}</style>

      <h3 style={{ color: "#075985", marginBottom: "16px" }}>Savings Goals</h3>

      {/* CREATE GOAL - hidden in printMode */}
      {!printMode && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.5fr 1fr 1fr auto",
            gap: "10px",
            marginBottom: "22px",
          }}
        >
          <input
            style={goalNameInput}
            placeholder="Goal name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            type="number"
            style={input}
            placeholder="Target ₹"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
          <div style={{ display: "flex", gap: "6px" }}>
            <select
              style={input}
              value={periodType}
              onChange={(e) => setPeriodType(e.target.value)}
            >
              <option value="">Period</option>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
              <option value="years">Years</option>
            </select>
            {periodType && (
              <input
                type="number"
                style={input}
                placeholder="No."
                value={periodValue}
                onChange={(e) => setPeriodValue(e.target.value)}
              />
            )}
          </div>
          <button style={button} onClick={handleCreate}>
            Create
          </button>
        </div>
      )}

      {/* GOALS GRID */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
          gap: "16px",
        }}
      >
        {goals.map((goal) => {
          const percent = Math.min((Number(goal.saved || 0) / Number(goal.target || 1)) * 100, 100).toFixed(0);

          const progressColor =
            percent < 40 ? "#ef4444" : percent < 70 ? "#facc15" : "#22c55e";

          const timeStatus = getTimeStatus(goal);

          // viewed card
          if (viewGoalId === goal.id) {
            return (
              <div
                key={goal.id}
                className="goal-card"
                data-id={goal.id}
                style={{
                  background: "#ffffff",
                  padding: "16px",
                  borderRadius: "12px",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                  display: "flex",
                  flexDirection: "column",
                  height: "350px", // kept fixed for viewed card for consistent UX
                  boxSizing: "border-box",
                }}
              >
                {!printMode && (
                  <div
                    onClick={() => setViewGoalId(null)}
                    style={{
                      cursor: "pointer",
                      fontWeight: 700,
                      color: "#0369a1",
                      marginBottom: "12px",
                    }}
                  >
                    ← Back
                  </div>
                )}

                <h4 style={{ color: "#065f46", marginBottom: "12px" }}>
                  {goal.name} – Savings History
                </h4>

                <div style={{ flex: 1, overflowY: "auto" }} className="hidden-scroll">
                  <table width="100%" style={{ borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={tableHeader}>S.No</th>
                        <th style={tableHeader}>Date</th>
                        <th style={tableHeader}>Amount</th>
                        <th style={tableHeader}>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {goal.history.map((h, i) => (
                        <tr key={h.hid}>
                          <td style={tableCell}>{i + 1}</td>
                          <td style={tableCell}>{h.date}</td>
                          <td style={tableCell}>₹{h.amount}</td>
                          <td style={tableCell}>
                            {!printMode ? (
                              <span
                                onClick={() => handleRemoveHistory(goal, h)}
                                style={{
                                  color: "#dc2626",
                                  cursor: "pointer",
                                  fontWeight: 700,
                                }}
                              >
                                Remove
                              </span>
                            ) : (
                              <span style={{ opacity: 0.7 }}>—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <p style={{ marginTop: "10px", fontWeight: 700, color: timeStatus.color }}>
                  {timeStatus.text}
                </p>
              </div>
            );
          }

          // non-view card
          return (
            <div
              key={goal.id}
              className="goal-card"
              data-id={goal.id}
              style={{
                background: "#ffffff",
                padding: "16px",
                borderRadius: "12px",
                boxShadow: "0 4px 14px rgba(0,0,0,0.12)",
                boxSizing: "border-box",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <h4 style={{ margin: 0, color: "#075985" }}>{goal.name}</h4>
                {goal.saved >= goal.target && (
                  <div
                    style={{
                      marginLeft: "auto",
                      background: "#bbf7d0",
                      color: "#166534",
                      padding: "4px 10px",
                      borderRadius: "999px",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    Completed
                  </div>
                )}
              </div>

              <p style={{ color: "#334155", fontWeight: 600 }}>
                ₹{goal.saved} / ₹{goal.target}
              </p>

              <div style={{ marginTop: "8px" }}>
                <div
                  style={{
                    height: "14px",
                    background: "#e5e7eb",
                    borderRadius: "999px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      width: `${percent}%`,
                      height: "100%",
                      background: progressColor,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 700,
                    }}
                  >
                    {percent}%
                  </div>
                </div>
              </div>

              {/* ADD - hide add controls in printMode */}
              {!printMode ? (
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <input
                    type="number"
                    style={{ ...input1, flex: 1 }}
                    disabled={goal.saved >= goal.target}
                    placeholder="Add ₹"
                    value={addAmount[goal.id] || ""}
                    onChange={(e) =>
                      setAddAmount({
                        ...addAmount,
                        [goal.id]: e.target.value,
                      })
                    }
                  />
                  <button
                    style={{
                      ...button,
                      opacity: goal.saved >= goal.target ? 0.5 : 1,
                    }}
                    disabled={goal.saved >= goal.target}
                    onClick={() => handleAddSavings(goal)}
                  >
                    Add
                  </button>
                </div>
              ) : null}

              {/* VIEW + DELETE - hide in printMode */}
              {!printMode && (
                <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                  <div
                    onClick={() => setViewGoalId(goal.id)}
                    style={{
                      flex: 1,
                      padding: "6px",
                      textAlign: "center",
                      background: "#e0f2fe",
                      color: "#075985",
                      borderRadius: "6px",
                      fontWeight: 700,
                      cursor: "pointer",
                      border: "1px solid #38bdf8",
                    }}
                  >
                    View
                  </div>

                  <div
                    onClick={() => handleDelete(goal.id)}
                    style={{
                      flex: 1,
                      padding: "6px",
                      textAlign: "center",
                      background: "#fee2e2",
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
              )}
            </div>
          );
        })}
      </div>

      {/* ======= MODAL (category-style confirmation modal) ======= */}
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
