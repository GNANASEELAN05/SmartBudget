import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../firebase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  const navigate = useNavigate();

  const handleLogin = async (e) => {
    e.preventDefault();

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );

      const token = await userCredential.user.getIdToken();
      localStorage.setItem("token", token);

      navigate("/dashboard");
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        setMessage("User not found. Please register.");
      } else if (error.code === "auth/wrong-password") {
        setMessage("Incorrect password.");
      } else if (error.code === "auth/invalid-email") {
        setMessage("Invalid email format.");
      } else {
        setMessage("Invalid email or password.");
      }
    }
  };

  // New: send password reset email to entered email
  const handleForgotPassword = async () => {
    setMessage("");
    if (!email) {
      setMessage("Enter your registered email to receive the reset link.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setMessage("Password reset link sent. Check your inbox and spam folder.");
    } catch (error) {
      if (error.code === "auth/user-not-found") {
        setMessage("No user found with this email.");
      } else if (error.code === "auth/invalid-email") {
        setMessage("Invalid email format.");
      } else {
        setMessage("Failed to send reset link. Try again later.");
      }
    }
  };

  return (
    <div style={pageStyle}>
      <div style={cardStyle}>
        <h2 style={titleStyle}>Welcome Back</h2>
        <p style={subtitleStyle}>Login to manage your budget</p>

        <form onSubmit={handleLogin}>
          <Field label="Email">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              style={inputStyle}
            />
          </Field>

          <Field label="Password">
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={inputStyle}
            />
          </Field>

          {/* Forgot password link aligned right under password */}
          <div style={{ textAlign: "right", marginTop: -12, marginBottom: 12 }}>
            <button
              type="button"
              onClick={handleForgotPassword}
              style={{
                background: "none",
                border: "none",
                padding: 0,
                cursor: "pointer",
                color: registerLinkStyle.color,
                fontWeight: 700,
                textDecoration: "none",
                fontSize: "13px",
              }}
            >
              Forgot password?
            </button>
          </div>

          <button type="submit" style={buttonStyle}>
            Login
          </button>
        </form>

        {message && <p style={messageStyle}>{message}</p>}

        <p style={footerText}>
          Don&apos;t have an account?{" "}
          <Link to="/register" style={registerLinkStyle}>
            Register
          </Link>
        </p>
      </div>
    </div>
  );
}

/* ---------- Reusable Field ---------- */
const Field = ({ label, children }) => (
  <div style={{ marginBottom: "18px" }}>
    <label style={labelStyle}>{label}</label>
    {children}
  </div>
);

/* ---------- STYLES (MATCHES REGISTER) ---------- */

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
  marginBottom: "28px",
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
  marginTop: "14px",
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
  marginTop: "26px",
  textAlign: "center",
  fontSize: "14px",
  color: "#334155",
};

const registerLinkStyle = {
  color: "#6366f1",
  fontWeight: "700",
  textDecoration: "none",
};
