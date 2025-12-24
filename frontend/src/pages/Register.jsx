import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { ref, set } from "firebase/database";
import { auth, db } from "../firebase";

export default function Register() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [mobile, setMobile] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");

  const navigate = useNavigate();

  const handleRegister = async (e) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      setMessage("Passwords do not match!");
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );

      const user = userCredential.user;

      await updateProfile(user, {
        displayName: name,
      });

      await set(ref(db, "users/" + user.uid), {
        name,
        email,
        mobile,
        createdAt: new Date().toISOString(),
      });

      navigate("/dashboard");
    } catch (error) {
      if (error.code === "auth/email-already-in-use") {
        setMessage("User already exists!");
      } else if (error.code === "auth/weak-password") {
        setMessage("Password must be at least 6 characters.");
      } else if (error.code === "auth/invalid-email") {
        setMessage("Invalid email address.");
      } else {
        setMessage("Registration failed.");
      }
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Create Account</h2>
        <p style={subtitleStyle}>Smart budgeting starts here</p>

        <form onSubmit={handleRegister}>
          <Field label="Name">
            <input value={name} onChange={(e) => setName(e.target.value)} required style={inputStyle} />
          </Field>

          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required style={inputStyle} />
          </Field>

          <Field label="Mobile Number">
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} required style={inputStyle} />
          </Field>

          <Field label="Password">
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required style={inputStyle} />
          </Field>

          <Field label="Confirm Password">
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </Field>

          <button type="submit" style={buttonStyle}>
            Create Account
          </button>
        </form>

        {message && <p style={messageStyle}>{message}</p>}

        <p style={footerText}>
          Already have an account?{" "}
          <Link to="/" style={loginLinkStyle}>
            Login
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ---------- Reusable Field ---------- */
const Field = ({ label, children }) => (
  <div style={{ marginBottom: "16px" }}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

/* ---------- STYLES ---------- */

const pageStyle = {
  height: "100vh",
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  background: "linear-gradient(135deg, #eef2ff, #ecfeff)",
};

const cardStyle = {
  width: "420px",
  padding: "38px",
  borderRadius: "20px",
  background: "linear-gradient(180deg, #ffffff, #f8fafc)",
  boxShadow: "0 25px 60px rgba(79,70,229,0.25)",
};

const titleStyle = {
  textAlign: "center",
  fontSize: "28px",
  fontWeight: "800",
  background: "linear-gradient(90deg, #6366f1, #22d3ee)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
};

const subtitleStyle = {
  textAlign: "center",
  fontSize: "14px",
  color: "#475569",
  marginTop: "6px",
  marginBottom: "26px",
};

const labelStyle = {
  fontSize: "15px",
  fontWeight: "700",
  color: "#4338ca",
};

const inputStyle = {
  width: "95%",
  padding: "12px",
  marginTop: "6px",
  borderRadius: "12px",
  border: "1px solid #c7d2fe",
  fontSize: "15px",
  background: "#f8fafc",
  outline: "none",
};

const buttonStyle = {
  width: "100%",
  padding: "14px",
  marginTop: "12px",
  borderRadius: "14px",
  border: "none",
  background: "linear-gradient(135deg, #6366f1, #22d3ee)",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "700",
  cursor: "pointer",
  boxShadow: "0 10px 24px rgba(99,102,241,0.45)",
};

const messageStyle = {
  marginTop: "14px",
  textAlign: "center",
  fontSize: "14px",
  fontWeight: "600",
  color: "#dc2626",
};

const footerText = {
  marginTop: "24px",
  textAlign: "center",
  fontSize: "14px",
  color: "#334155",
};

const loginLinkStyle = {
  color: "#0ea5e9",
  fontWeight: "700",
  textDecoration: "none",
};
