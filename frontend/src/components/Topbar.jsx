// frontend/src/components/Topbar.jsx
import { useEffect, useState, useRef } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { ref, get } from "firebase/database";
import { auth, database } from "../firebase";
import { Search, Mail, X, FileText } from "lucide-react";

export default function Topbar() {
  const [username, setUsername] = useState("User");
  const [user, setUser] = useState(null); // keep current user for ticket fetches

  // tickets UI state
  const [mailOpen, setMailOpen] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [viewTicket, setViewTicket] = useState({
    open: false,
    ticket: null,
    index: null,
  });

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u || null);

      if (!u) {
        setUsername("User");
        return;
      }

      try {
        let name = null;

        // Try realtime database if available
        if (database) {
          try {
            const snapshot = await get(ref(database, `users/${u.uid}`));
            if (snapshot.exists()) {
              const val = snapshot.val();

              // handle multiple possible shapes:
              if (typeof val === "string") {
                name = val;
              } else if (val && typeof val === "object") {
                name =
                  val.name ||
                  val.displayName ||
                  (val.profile && (val.profile.name || val.profile.displayName)) ||
                  null;
              }
            }
          } catch (dbErr) {
            // DB read failed — continue to fallback below
            console.error("RTDB read error in Topbar:", dbErr);
          }
        }

        // Fallbacks if DB didn't provide a name
        if (!name) {
          name = u.displayName || (u.email ? u.email.split("@")[0] : null);
        }

        if (!name || name.trim() === "") {
          name = "User";
        }

        setUsername(name);
      } catch (error) {
        console.error("Error fetching user name:", error);
        const fallback =
          auth.currentUser?.displayName ||
          (auth.currentUser?.email ? auth.currentUser.email.split("@")[0] : "User");
        setUsername(fallback);
      }
    });

    return unsubscribe;
  }, [auth, database]);

  const initial = username && username.length ? username.charAt(0).toUpperCase() : "U";

  // Fetch tickets once when mailOpen opens (or when user changes)
  async function fetchTickets() {
    try {
      const uid = user?.uid || auth?.currentUser?.uid;
      if (!database || !uid) {
        setTickets([]);
        return;
      }
      const snap = await get(ref(database, `users/${uid}/support/requests`));
      if (!snap.exists()) {
        setTickets([]);
        return;
      }
      const val = snap.val();
      const arr = Object.entries(val)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setTickets(arr);
    } catch (e) {
      console.error("Failed to load tickets:", e);
      setTickets([]);
    }
  }

  function toggleMail() {
    const next = !mailOpen;
    setMailOpen(next);
    if (next) {
      fetchTickets();
    }
  }

  function renderTicketsPopup() {
    if (!mailOpen) return null;
    return (
      <div
        style={{
          position: "fixed",
          top: 72,
          right: 8,
          width: "min(360px, calc(100vw - 16px))",
          maxHeight: 420,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 10px 30px rgba(2,6,23,0.12)",
          border: "1px solid rgba(15,23,42,0.06)",
          overflow: "hidden",
          zIndex: 9999,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: 12,
            borderBottom: "1px solid #eef2ff",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div style={{ fontWeight: 700 }}>Support tickets</div>
          <button
            onClick={() => setMailOpen(false)}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 6,
            }}
          >
            <X size={16} />
          </button>
        </div>

        <div style={{ maxHeight: 340, overflowY: "auto", padding: 12, display: "grid", gap: 8 }}>
          {tickets.length === 0 ? (
            <div style={{ color: "#6b7280", padding: 12 }}>No tickets</div>
          ) : (
            tickets.map((t, idx) => (
              <div
                key={t.id}
                style={{
                  padding: 10,
                  borderRadius: 8,
                  background: "#fbfdff",
                  border: "1px solid #eef2ff",
                  display: "flex",
                  flexDirection: "column",
                  gap: 8,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
                  <div
                    style={{
                      fontWeight: 700,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      maxWidth: 220,
                    }}
                    title={t.subject}
                  >
                    {idx + 1}. {t.subject || "(no subject)"}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => {
                        setViewTicket({ open: true, ticket: t, index: idx });
                      }}
                      style={{
                        padding: "6px 8px",
                        borderRadius: 8,
                        border: "1px solid #e6eef6",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                    >
                      View
                    </button>
                  </div>
                </div>

                <div style={{ fontSize: 12, color: "#6b7280" }}>
                  {new Date(t.createdAt || Date.now()).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: "#6b7280" }}>Status: {t.status || "unknown"}</div>
              </div>
            ))
          )}
        </div>

        <div style={{ padding: 10, borderTop: "1px solid #eef2ff", textAlign: "center", fontSize: 13, color: "#475569" }}>
          Showing {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
        </div>
      </div>
    );
  }

  // Small view modal (compact) — similar data displayed in Help.jsx but compact
  function renderViewTicketModal() {
    if (!viewTicket.open || !viewTicket.ticket) return null;
    const t = viewTicket.ticket;
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(2,6,23,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 10000,
        }}
        onClick={(e) => e.target === e.currentTarget && setViewTicket({ open: false, ticket: null, index: null })}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 720,
            borderRadius: 12,
            background: "#fff",
            padding: 16,
            boxShadow: "0 30px 80px rgba(2,6,23,0.35)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FileText size={20} style={{ color: "#06b6d4" }} />
              <div>
                <div style={{ fontWeight: 700 }}>Ticket #{(viewTicket.index || 0) + 1}</div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>View ticket details</div>
              </div>
            </div>
            <button
              onClick={() => setViewTicket({ open: false, ticket: null, index: null })}
              style={{ borderRadius: 8, padding: 8, border: "1px solid #e6eef6", background: "#fff" }}
            >
              <X size={16} />
            </button>
          </div>

          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <div style={{ padding: 8 }}>
              <h4 style={{ margin: "6px 0 4px" }}>Type</h4>
              <div style={{ color: "#334155" }}>{t.type || "-"}</div>

              <h4 style={{ margin: "10px 0 4px" }}>Submitted on</h4>
              <div style={{ color: "#334155" }}>{t.submittedOn || new Date(t.createdAt || Date.now()).toLocaleDateString()}</div>

              <h4 style={{ margin: "10px 0 4px" }}>Subject</h4>
              <div style={{ color: "#334155" }}>{t.subject || "-"}</div>

              <h4 style={{ margin: "10px 0 4px" }}>Message</h4>
              <div style={{ color: "#334155", whiteSpace: "pre-wrap" }}>{t.message || "-"}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Close mail popup when clicking anywhere else
  useEffect(() => {
    function onDocClick() {
      setMailOpen(false);
    }
    if (mailOpen) {
      document.addEventListener("click", onDocClick);
    }
    return () => document.removeEventListener("click", onDocClick);
  }, [mailOpen]);

return (
    <div
      style={{
        height: "72px",
        background: "#ffffff",
        borderBottom: "1px solid #e5e7eb",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 16px",
      }}
    >
      {/* Left area */}
      <div style={{ width: 40 }} />

      {/* Right: Icons + Profile */}
      <div style={{ display: "flex", alignItems: "center", gap: "22px", position: "relative" }}>
        {/* Mail icon - toggles tickets popup */}
        <div style={{ position: "relative" }}>
          <div onClick={(e) => { e.stopPropagation(); toggleMail(); }} style={{ cursor: "pointer" }}>
            <Mail size={20} color="#475569" />
          </div>

          {/* tickets popup */}
          {renderTicketsPopup()}
        </div>

        {/* Profile */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            padding: "6px 12px",
            borderRadius: "999px",
            background: "#ecfdf5",
          }}
        >
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: "#0f9960ff",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: "600",
              fontSize: "14px",
              flexShrink: 0,
            }}
          >
            {initial}
          </div>

          <div style={{ lineHeight: 1.2, display: "none" }} className="topbar-username">
            <div style={{ fontSize: "14px", fontWeight: 600 }}>{username}</div>
            <div style={{ fontSize: "12px", color: "#64748b" }}>Active</div>
          </div>
        </div>
        <style>{`
          @media (min-width: 480px) { .topbar-username { display: block !important; } }
        `}</style>

        {/* view ticket modal (outside popup so it covers full screen) */}
        {renderViewTicketModal()}
      </div>
    </div>
  );
}
