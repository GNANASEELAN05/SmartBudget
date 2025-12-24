import React, { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { getDatabase, ref, onValue, update, off } from "firebase/database";
import { User, Info, Shield, Lightbulb, Lock } from "lucide-react";

export default function Profile() {
  const auth = getAuth();
  const db = getDatabase();
  const user = auth.currentUser;

  const [name, setName] = useState("");
  const [mobile, setMobile] = useState("");
  const [email, setEmail] = useState("");
  const [saved, setSaved] = useState(false);

  /* ================= FETCH EXISTING USER DATA ================= */
  useEffect(() => {
    if (!user) return;

    setEmail(user.email || "");

    const userRef = ref(db, `users/${user.uid}`);
    const handler = onValue(userRef, snap => {
      const data = snap.val();
      if (!data) return;

      setName(data.name || "");
      setMobile(data.mobile || "");
    });

    return () => off(userRef, "value", handler);
  }, [db, user]);

  /* ================= UPDATE EXISTING DATA ================= */
  const updateProfile = async () => {
    if (!user) return;

    await update(ref(db, `users/${user.uid}`), {
      name,
      mobile,
    });

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  /* ================= STYLES ================= */
  const page = {
    background: "linear-gradient(135deg,#eef2ff,#ecfeff)",
    padding: "28px",
    borderRadius: "20px",
  };

  const grid = {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 22,
  };

  const baseCard = {
    borderRadius: "20px",
    padding: "22px",
    boxShadow: "0 18px 40px rgba(0,0,0,0.15)",
    color: "#0f172a",
  };

  const profileCard = {
    ...baseCard,
    background: "linear-gradient(135deg,#e0e7ff,#c7d2fe)",
  };

  const infoCard = {
    ...baseCard,
    background: "linear-gradient(135deg,#ccfbf1,#99f6e4)",
  };

  const securityCard = {
    ...baseCard,
    background: "linear-gradient(135deg,#ffedd5,#fed7aa)",
  };

  const tipsCard = {
    ...baseCard,
    background: "linear-gradient(135deg,#dcfce7,#bbf7d0)",
  };

  const label = {
    fontSize: 13,
    fontWeight: 800,
    color: "#1e293b",
    marginBottom: 6,
  };

  const input = {
    width: "95%",
    padding: "10px 12px",
    borderRadius: "10px",
    border: "1px solid #94a3b8",
    fontSize: 14,
    marginBottom: 14,
    outline: "none",
  };

  const disabledInput = {
    ...input,
    background: "#f1f5f9",
    cursor: "not-allowed",
  };

  const button = {
    width: "100%",
    padding: "12px",
    borderRadius: "14px",
    border: "none",
    fontWeight: 900,
    fontSize: 15,
    cursor: "pointer",
    background: "linear-gradient(135deg,#4f46e5,#06b6d4)",
    color: "white",
    marginTop: 10,
    boxShadow: "0 10px 20px rgba(0,0,0,0.25)",
  };

  const infoTitle = {
    fontWeight: 900,
    marginBottom: 10,
  };

  const infoItem = {
    fontSize: 14,
    marginBottom: 8,
  };

  // small helper to robustly render lucide icons (same pattern used in other files)
  function renderIcon(IconComp, size = 16, style = { marginRight: 8, verticalAlign: "middle" }) {
    try {
      if (!IconComp) return null;
      return React.createElement(IconComp, { size, style });
    } catch (e) {
      return null;
    }
  }

  /* ================= JSX ================= */
  return (
    <div style={page}>
      <h2 style={{ fontWeight: 900, marginBottom: 22, display: "flex", alignItems: "center", gap: 10 }}>
        {renderIcon(User, 20)}
        Profile Settings
      </h2>

      <div style={grid}>
        {/* ===== LEFT: PROFILE FORM ===== */}
        <div style={profileCard}>
          <div>
            <div style={label}>Username</div>
            <input
              style={input}
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </div>

          <div>
            <div style={label}>
              Email (locked) {renderIcon(Lock, 14, { marginLeft: 8, verticalAlign: "middle" })}
            </div>
            <input style={disabledInput} value={email} disabled />
          </div>

          <div>
            <div style={label}>Mobile Number</div>
            <input
              style={input}
              value={mobile}
              onChange={e => setMobile(e.target.value)}
            />
          </div>

          <button style={button} onClick={updateProfile}>
            Update Profile
          </button>

          {saved && (
            <div
              style={{
                marginTop: 14,
                fontWeight: 900,
                color: "#166534",
                textAlign: "center",
              }}
            >
              Profile updated successfully
            </div>
          )}
        </div>

        {/* ===== RIGHT: INFO ===== */}
        <div style={{ display: "grid", gap: 18 }}>
          <div style={infoCard}>
            <div style={{ ...infoTitle, display: "flex", alignItems: "center", gap: 8 }}>
              {renderIcon(Info, 16)}
              Account Info
            </div>
            <div style={infoItem}>Account Type: Personal</div>
            <div style={infoItem}>Login Provider: Email & Password</div>
            <div style={infoItem}>Status: Active</div>
          </div>

          <div style={securityCard}>
            <div style={{ ...infoTitle, display: "flex", alignItems: "center", gap: 8 }}>
              {renderIcon(Shield, 16)}
              Security
            </div>
            <div style={infoItem}>Email Verified: ✅</div>
            <div style={infoItem}>Password Protected</div>
            <div style={infoItem}>No suspicious activity</div>
          </div>

          <div style={tipsCard}>
            <div style={{ ...infoTitle, display: "flex", alignItems: "center", gap: 8 }}>
              {renderIcon(Lightbulb, 16)}
              Tips
            </div>
            <div style={infoItem}>• Keep mobile number updated</div>
            <div style={infoItem}>• Email cannot be changed</div>
            <div style={infoItem}>• Data is securely stored</div>
          </div>
        </div>
      </div>
    </div>
  );
}
