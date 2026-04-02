import React, { useEffect, useMemo, useState } from "react";
import {
  Search,
  MessageCircle,
  LifeBuoy,
  BookOpen,
  Bug,
  Star,
  CheckCircle,
  X,
  Send,
  FileText,
} from "lucide-react";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { getDatabase, ref, push, onValue, off } from "firebase/database";
import emailjs from "@emailjs/browser";

// EmailJS env vars (Vite)
const EMAILJS_SERVICE_ID = import.meta.env.VITE_EMAILJS_SERVICE_ID;
const EMAILJS_TEMPLATE_ID = import.meta.env.VITE_EMAILJS_TEMPLATE_ID;
const EMAILJS_PUBLIC_KEY = import.meta.env.VITE_EMAILJS_PUBLIC_KEY;


function useWindowWidth() {
  const [width, setWidth] = React.useState(
    typeof window !== "undefined" ? window.innerWidth : 800
  );
  React.useEffect(() => {
    const handler = () => setWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return width;
}

const SAMPLE_FAQS = [
  {
    id: "faq-1",
    q: "How do I reset my App PIN?",
    a: "Go to Settings → Change PIN. Enter your current PIN and choose a new PIN.",
    tags: ["security", "pin"],
  },
  {
    id: "faq-2",
    q: "How do I export my transactions to PDF?",
    a: "Open Dashboard → Export, choose PDF and specify month/year. The export will be generated and downloaded to your device.",
    tags: ["export", "pdf"],
  },
  {
    id: "faq-3",
    q: "Why am I seeing “Firebase not detected” message?",
    a: "This means Firebase likely hasn’t been initialized in your app. Check your firebase.js file and ensure the project’s configuration is loaded before components mount.",
    tags: ["setup", "firebase"],
  },
  {
    id: "faq-4",
    q: "Can I change the PIN length?",
    a: "No, the PIN length is fixed (4 to 8).",
    tags: ["pin", "settings"],
  },
];

const styles = {
  page: {
    padding: "20px 12px",
    minHeight: "100vh",
    background: "linear-gradient(135deg,#eef2ff,#ecfeff)",
    fontFamily:
      "Inter, system-ui, -apple-system, Roboto, Segoe UI, Helvetica Neue, Arial, sans-serif",
    color: "#0f172a",
    boxSizing: "border-box",
    overflowX: "hidden",
  },
  container: {
    maxWidth: 1120,
    margin: "0 auto",
  },
  headerRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 16,
    marginBottom: 18,
  },
  titleWrap: {},
  title: {
    margin: 0,
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.1,
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 6,
    color: "#475569",
    fontSize: 14,
  },
  userBox: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  userText: {
    textAlign: "right",
  },
  smallMuted: {
    fontSize: 13,
    color: "#6b7280",
  },
  userName: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0b5cff",
  },
  card: {
    background: "#fff",
    borderRadius: 16,
    padding: 18,
    boxShadow: "0 10px 30px rgba(16,24,40,0.06)",
    border: "1px solid rgba(15,23,42,0.05)",
  },
  searchArea: {
    display: "flex",
    flexWrap: "wrap",
    gap: 12,
    alignItems: "center",
    marginBottom: 18,
  },
  searchCard: {
    flex: 1,
  },
  searchInner: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  inputWrapper: {
    position: "relative",
    flex: 1,
  },
  searchIcon: {
    position: "absolute",
    left: 12,
    top: 10,
    color: "#94a3b8",
  },
  input: {
    width: "100%",
    padding: "10px 12px 10px 36px",
    borderRadius: 12,
    border: "1px solid #e6eef6",
    background: "#f8fafc",
    outline: "none",
    fontSize: 14,
    color: "#0f172a",
    boxSizing: "border-box",
  },
  actions: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    alignItems: "center",
  },
  primaryBtn: {
    padding: "10px 16px",
    borderRadius: 12,
    border: "none",
    cursor: "pointer",
    background: "linear-gradient(90deg,#4f46e5,#06b6d4)",
    color: "#fff",
    fontWeight: 700,
    boxShadow: "0 12px 28px rgba(79,70,229,0.12)",
  },
  secondaryBtn: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid #e6eef6",
    background: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  },
  quickGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3,1fr)",
    gap: 12,
    marginTop: 12,
  },
  quickCard: {
    padding: 12,
    borderRadius: 12,
    background: "linear-gradient(180deg,#fff,#fbfdff)",
    border: "1px solid #eef2ff",
    boxShadow: "0 6px 16px rgba(2,6,23,0.03)",
  },
  tabButton: {
    padding: "8px 12px",
    borderRadius: 12,
    border: "1px solid transparent",
    cursor: "pointer",
    background: "transparent",
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
    color: "#0f172a",
  },
  tabActive: {
    background: "#fff",
    boxShadow: "0 8px 20px rgba(2,6,23,0.06)",
    borderColor: "#eef2ff",
  },
  contentGrid: {
    display: "grid",
    gridTemplateColumns: "2fr 1fr",
    gap: 18,
  },
  faqCard: {
    borderRadius: 12,
    padding: 16,
    background: "#fff",
    border: "1px solid #eef2ff",
    boxShadow: "0 8px 24px rgba(14,20,40,0.04)",
  },
  faqRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  faqItem: {
    border: "1px solid #f1f5f9",
    borderRadius: 10,
    overflow: "hidden",
    marginBottom: 8,
  },
  faqButton: {
    width: "100%",
    textAlign: "left",
    padding: 12,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
    background: "transparent",
    border: "none",
    cursor: "pointer",
  },
  faqQuestion: {
    fontWeight: 700,
    color: "#0f172a",
  },
  faqTags: {
    marginTop: 6,
    fontSize: 12,
    color: "#6b7280",
  },
  faqAnswer: {
    padding: 12,
    paddingTop: 0,
    color: "#334155",
  },
  twoColGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
  },
  smallText: {
    fontSize: 13,
    color: "#6b7280",
  },
  rightColumnCard: {
    borderRadius: 12,
    padding: 14,
    background: "#fff",
    border: "1px solid #eef2ff",
    boxShadow: "0 8px 20px rgba(2,6,23,0.03)",
    marginBottom: 12,
  },
  recentTicket: {
    padding: 10,
    borderRadius: 8,
    background: "#fbfdff",
    border: "1px solid #eef2ff",
    fontSize: 13,
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(2,6,23,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 9999,
  },
  modal: {
    width: "100%",
    maxWidth: 920,
    borderRadius: 14,
    background: "linear-gradient(180deg,#ffffff,#fbfdff)",
    padding: 18,
    boxShadow: "0 30px 80px rgba(2,6,23,0.35)",
  },
  formInput: {
    width: "100%",
    padding: 10,
    borderRadius: 8,
    border: "1px solid #e6eef6",
    fontSize: 14,
    boxSizing: "border-box",
  },
  footerBtns: {
    display: "flex",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 12,
  },
  smallButton: {
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px solid #e6eef6",
    background: "#fff",
    cursor: "pointer",
  },
  starBtn: {
    padding: "8px 10px",
    borderRadius: 8,
    border: "1px solid #e6eef6",
    background: "#fff",
    cursor: "pointer",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },
  starActive: {
    background: "#fdba74",
    borderColor: "#fb923c",
    color: "#7c2d12",
  },
  resultBox: {
    width: 420,
    maxWidth: "92%",
    borderRadius: 12,
    padding: 18,
    display: "flex",
    gap: 12,
    alignItems: "center",
    boxShadow: "0 20px 60px rgba(2,6,23,0.25)",
    background: "#fff",
    border: "1px solid rgba(15,23,42,0.06)",
  },
  docsWrap: {
    background: "#fff",
    borderRadius: 14,
    padding: 22,
    boxShadow: "0 14px 40px rgba(2,6,23,0.08)",
    border: "1px solid #eef2ff",
    lineHeight: 1.6,
  },
  docsH1: {
    fontSize: 22,
    margin: 0,
    fontWeight: 900,
    color: "#0f172a",
  },
  docsH2: {
    fontSize: 18,
    marginTop: 16,
    fontWeight: 800,
    color: "#0f172a",
  },
  docsP: {
    color: "#334155",
    marginTop: 10,
  },
  docsLi: {
    marginTop: 6,
    color: "#334155",
  },
};

// -- Helper: format timestamp to dd/mm/yyyy
function formatDMY(ts) {
  const d = new Date(ts || Date.now());
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

// Safe auth/db getters
const auth = (() => {
  try {
    return getAuth();
  } catch {
    return null;
  }
})();

const db = (() => {
  try {
    return getDatabase();
  } catch {
    return null;
  }
})();

export default function Help() {
  const windowWidth = useWindowWidth();
  const isMobile = windowWidth < 640;
  const [user, setUser] = useState(null);
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("faqs");
  const [faqs, setFaqs] = useState(SAMPLE_FAQS);
  const [expanded, setExpanded] = useState(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [modalMode, setModalMode] = useState("report"); // 'report' | 'pin'

  const [docsModal, setDocsModal] = useState({ open: false, type: null });

  const [report, setReport] = useState({
    subject: "",
    message: "",
    type: "bug",
    email: "",
    name: "",
  });

  const [submitting, setSubmitting] = useState(false);
  const [recent, setRecent] = useState([]);
  const [rating, setRating] = useState(0);

  const [resultPopup, setResultPopup] = useState({
    open: false,
    success: true,
    title: "",
    message: "",
  });

  // View modal for a single ticket
  const [viewTicket, setViewTicket] = useState({
    open: false,
    ticket: null,
    index: null,
  });

  function showResult(success, title, message, autoClose = true, autoCloseMs = 3000) {
    setResultPopup({ open: true, success, title, message });
    if (autoClose) {
      setTimeout(
        () => setResultPopup((prev) => ({ ...prev, open: false })),
        autoCloseMs
      );
    }
  }

  // Auth listener
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setReport((r) => ({
        ...r,
        email: u?.email || "",
        name: u?.displayName || "",
      }));
    });
    return () => unsub();
  }, []);

  // EmailJS init
  useEffect(() => {
    try {
      if (EMAILJS_PUBLIC_KEY) {
        emailjs.init(EMAILJS_PUBLIC_KEY);
      }
    } catch {
      // ignore
    }
  }, []);

  // Read recent tickets for user
  useEffect(() => {
    if (!db || !user) return;
    // <-- CHANGED: read under the user's node so tickets live inside the user
    const r = ref(db, `users/${user.uid}/support/requests`);
    const handler = (snap) => {
      const val = snap.val();
      if (!val) {
        setRecent([]);
        return;
      }
      const arr = Object.entries(val)
        .map(([id, v]) => ({ id, ...v }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setRecent(arr.slice(0, 8));
    };
    onValue(r, handler, (err) => {
      console.error("support read error", err);
    });
    return () => {
      try {
        off(r, "value", handler);
      } catch {
        // ignore
      }
    };
  }, [db, user]);

  const filteredFaqs = useMemo(() => {
    const q = String(query).trim().toLowerCase();
    if (!q) return faqs;
    return faqs.filter((f) =>
      [f.q, f.a, ...(f.tags || [])].join(" ").toLowerCase().includes(q)
    );
  }, [faqs, query]);

  function toggleExpand(id) {
    setExpanded((prev) => (prev === id ? null : id));
  }

  // Submit report: send email and store in Firebase tickets
  async function submitReport() {
    setSubmitting(true);
    try {
      const payload = {
        subject:
          modalMode === "pin"
            ? report.subject || "Requesting to change or delete default PIN"
            : report.subject || "(no subject)",
        message: report.message || "no message",
        type:
          modalMode === "pin"
            ? "PIN request"
            : report.type || "Feedback",
        email: report.email || user?.email || "no-reply@smartbudgettracker.app",
        name: report.name || user?.displayName || "Guest",
        userId: user?.uid || null,
        status: "open",
        createdAt: Date.now(),
        // added: human-readable submitted on date in dd/mm/yyyy
        submittedOn: formatDMY(Date.now()),
      };

      // 1) EmailJS
      let emailSent = false;
      let emailErrorText = "";
      try {
        if (!EMAILJS_SERVICE_ID || !EMAILJS_TEMPLATE_ID) {
          throw new Error(
            "EmailJS env vars missing (VITE_EMAILJS_SERVICE_ID/TEMPLATE_ID)."
          );
        }

        const composedPlain = [
          `Name: ${payload.name || "Guest"}`,
          `Email: ${payload.email || "no-reply@smartbudgettracker.app"}`,
          `Type: ${payload.type}`,
          `Subject: ${payload.subject}`,
          "Message:",
          payload.message || "no message",
          "",
          `User ID: ${payload.userId || "unknown"}`,
          `Sent at: ${new Date(payload.createdAt).toLocaleString()}`,
        ].join("\n");

        const composedHtml = composedPlain
          .replace(/\n/g, "<br>")
          .replace(/ {2,}/g, "<br><br>");

        const templateParams = {
          to_email: "smartbudgettracker5@gmail.com",
          to_name: "Smart Budget Tracker Support",
          from_name: payload.name || "Guest",
          from_email: payload.email || "no-reply@smartbudgettracker.app",
          reply_to: payload.email || "no-reply@smartbudgettracker.app",
          subject: payload.subject,
          type: payload.type,
          message: composedPlain,
          html_message: composedHtml,
          short_message: payload.message || "",
          userId: payload.userId || "",
        };

        const res = await emailjs.send(
          EMAILJS_SERVICE_ID,
          EMAILJS_TEMPLATE_ID,
          templateParams
        );
        console.log("EmailJS send result", res);
        emailSent = true;
      } catch (e) {
        emailErrorText = e?.text || e?.message || String(e || "unknown error");
        console.warn("EmailJS send failed", e);
      }

      // 2) Store into Firebase tickets
      if (db && user) {
        try {
          // <-- CHANGED: write tickets under the user's node so they're stored inside that user only
          const userPath = ref(db, `users/${user.uid}/support/requests`);
          await push(userPath, payload);

          // NOTE: removed writes to top-level /support/... paths to avoid tickets
          // appearing outside the user node and causing duplicates.
        } catch (e) {
          console.error("Failed to push to Firebase", e);
        }
      } else {
        console.warn("Firebase DB not available, payload:", payload);
      }

      // 3) Popup
      setReport((r) => ({
        ...r,
        subject:
          modalMode === "pin"
            ? "Requesting to change or delete default PIN"
            : "",
        message:
          modalMode === "pin"
            ? "I would like to request a change or deletion of my default PIN. Provide details here."
            : "",
        type: "bug",
      }));
      setShowReportModal(false);
      setModalMode("report");

      if (emailSent) {
        showResult(
          true,
          "Report submitted",
          "Thanks, your report was submitted and an email was sent to the support team."
        );
      } else {
        showResult(
          false,
          "Saved (email failed)",
          `Report saved, but sending email failed: ${emailErrorText || "unknown error"}.`
        );
      }
    } catch (e) {
      console.error(e);
      showResult(
        false,
        "Submission failed",
        "Failed to submit report. Check console for details."
      );
    } finally {
      setSubmitting(false);
    }
  }

  function starClick(n) {
    setRating(n);
    if (db && user) {
      const r = ref(db, `support/ratings/${user.uid}`);
      push(r, { rating: n, createdAt: Date.now() }).catch((e) =>
        console.error(e)
      );
    }
  }

  // Open PIN request modal
  function openPinRequest() {
    setModalMode("pin");
    setReport((r) => ({
      ...r,
      subject: "Requesting to change or delete default PIN",
      message:
        "I would like to request a change or deletion of my default PIN. Provide details here.",
      type: "pin",
      email: user?.email || "",
      name: user?.displayName || "",
    }));
    setShowReportModal(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Cancel in PIN modal: open mail client
  function handlePinCancel() {
    const mailTo = "smartbudgettrackerg@gmail.com";
    const subject = encodeURIComponent(
      report.subject || "Requesting to change or delete default PIN"
    );
    const body = encodeURIComponent(
      report.message ||
        "I would like to request a change or deletion of my default PIN."
    );
    const mailUrl = `mailto:${mailTo}?subject=${subject}&body=${body}`;
    window.location.href = mailUrl;

    setShowReportModal(false);
    setModalMode("report");
  }

  // Docs inner content (unchanged content)
  function DocsInner() {
    return (
      <div style={styles.docsWrap}>
        <h1 style={styles.docsH1}>Smart Budget Tracker User Guide</h1>
        <p style={styles.docsP}>
          <strong>About this app</strong>
        </p>
        <p style={styles.docsP}>
          Smart Budget Tracker helps you record income and expenses, create
          budgets, and view clear reports to manage your personal finances. Its
          designed for everyday users who want an easy, secure way to track
          money across devices.
        </p>
        <hr style={{ marginTop: 18, marginBottom: 18 }} />
        <h2 style={styles.docsH2}>How to use</h2>
        <h3 style={{ marginTop: 10, marginBottom: 6 }}>Quick start</h3>
        <ol style={{ paddingLeft: 18 }}>
          <li style={styles.docsLi}>
            <strong>Open the app</strong> use the web or mobile.
          </li>
          <li style={styles.docsLi}>
            <strong>Create an account</strong> register with your name, email,
            and password.
          </li>
          <li style={styles.docsLi}>
            <strong>Sign in</strong> sign in with your email and password to
            access your personal dashboard.
          </li>
          <li style={styles.docsLi}>
            <strong>Add transactions</strong> record income or expenses with
            amount, date, category, and an optional note.
          </li>
          <li style={styles.docsLi}>
            <strong>Manage categories &amp; budgets</strong> create categories
            (e.g., Food, Rent) and set monthly budgets to track spending.
          </li>
          <li style={styles.docsLi}>
            <strong>View reports</strong> check charts and summaries to review
            monthly spending and income.
          </li>
          <li style={styles.docsLi}>
            <strong>Export data</strong> download your transaction history using
            the export option in the app (see “How to export”).
          </li>
        </ol>
        <h3 style={{ marginTop: 12 }}>Helpful tips</h3>
        <ul style={{ paddingLeft: 18 }}>
          <li style={styles.docsLi}>
            Use clear notes for each transaction for easier searching later.
          </li>
          <li style={styles.docsLi}>
            Regularly check your budget progress to avoid overspending.
          </li>
          <li style={styles.docsLi}>
            Always log out on shared or public devices.
          </li>
        </ul>
        <hr style={{ marginTop: 18, marginBottom: 18 }} />
        <h2 style={styles.docsH2}>Integration guide for administrators</h2>
        <p style={styles.docsP}>
          This section gives high-level steps administrators use to connect the
          app to external systems or enable backups. It avoids technical or
          platform-specific details so its safe for users to read.
        </p>
        <h3 style={{ marginTop: 10 }}>What admins typically configure</h3>
        <ul style={{ paddingLeft: 18 }}>
          <li style={styles.docsLi}>
            <strong>Database</strong> Choose and configure a secure database to
            store user data.
          </li>
          <li style={styles.docsLi}>
            <strong>Authentication</strong> Configure how users sign in
            (email/password and other optional providers).
          </li>
          <li style={styles.docsLi}>
            <strong>Backups &amp; exports</strong> Enable automated backups and
            safe export destinations for recovery.
          </li>
          <li style={styles.docsLi}>
            <strong>Notifications (optional)</strong> Configure optional
            notification systems for reminders or alerts.
          </li>
        </ul>
        <h3 style={{ marginTop: 10 }}>High-level admin steps</h3>
        <ol style={{ paddingLeft: 18 }}>
          <li style={styles.docsLi}>
            Provide the frontend web or mobile link to users.
          </li>
          <li style={styles.docsLi}>
            Configure the server-side application to connect to a secure
            database and backup location.
          </li>
          <li style={styles.docsLi}>
            Ensure authentication settings are enabled and secure (strong
            password rules, optional two-factor authentication).
          </li>
          <li style={styles.docsLi}>
            Test user registration, sign-in, transaction flow, and exports
            before giving access to users.
          </li>
        </ol>
        <hr style={{ marginTop: 18, marginBottom: 18 }} />
        <h2 style={styles.docsH2}>How to export</h2>
        <p style={styles.docsP}>
          You can export your data anytime using the app’s built-in export
          tools.
        </p>
        <h3 style={{ marginTop: 10 }}>Export from the app (PDF)</h3>
        <ol style={{ paddingLeft: 18 }}>
          <li style={styles.docsLi}>
            Sign in and go to <strong>Settings</strong> or{" "}
            <strong>Transactions</strong>.
          </li>
          <li style={styles.docsLi}>
            Select <strong>Export</strong> and the system exports your data as{" "}
            <strong>PDF</strong>.
          </li>
          <li style={styles.docsLi}>
            Download the file to your device and open the PDF file.
          </li>
        </ol>
        <h3 style={{ marginTop: 10 }}>Backup options</h3>
        <p style={styles.docsP}>
          If your organization has enabled cloud backups, your data may also be
          backed up automatically. Contact your administrator for details or to
          request a full data export.
        </p>
        <hr style={{ marginTop: 18, marginBottom: 18 }} />
        <h2 style={styles.docsH2}>Data security (user-facing summary)</h2>
        <p style={styles.docsP}>
          Your privacy and data protection are important. Below are the main
          protections in place and actions you can take.
        </p>
        <h3 style={{ marginTop: 10 }}>What we do to protect your data</h3>
        <ul style={{ paddingLeft: 18 }}>
          <li style={styles.docsLi}>
            <strong>Password safety</strong> Passwords are stored securely on
            the server using best practices.
          </li>
          <li style={{ marginTop: 6, color: "#334155" }}>
            <strong>Encrypted connections</strong> The app should be used over
            secure connections (HTTPS) to protect data in transit.
          </li>
          <li style={{ marginTop: 6, color: "#334155" }}>
            <strong>Access control</strong> the app restricts access so each user can only see their own data.
          </li>
          <li style={{ marginTop: 6, color: "#334155" }}>
            <strong>Backups</strong> Backups are stored in secure locations
            controlled by administrators.
          </li>
        </ul>
        <h3 style={{ marginTop: 10 }}>What you can do</h3>
        <ul style={{ paddingLeft: 18 }}>
          <li style={styles.docsLi}>Use a strong, unique password.</li>
          <li style={styles.docsLi}>
            Enable any available additional sign-in protections (for example,
            two-factor authentication).
          </li>
          <li style={styles.docsLi}>Log out on shared or public devices.</li>
          <li style={styles.docsLi}>
            Contact your administrator immediately if you suspect unauthorized
            access.
          </li>
        </ul>
        <hr style={{ marginTop: 18, marginBottom: 18 }} />
        <h2 style={styles.docsH2}>Uses (what you can do with the app)</h2>
        <ul style={{ paddingLeft: 18 }}>
          <li style={styles.docsLi}>
            Record and categorize income and expenses.
          </li>
          <li style={styles.docsLi}>
            Create and manage budgets by category.
          </li>
          <li style={styles.docsLi}>
            View visual reports and monthly summaries.
          </li>
          <li style={styles.docsLi}>
            Export transactions for personal accounting or tax purposes.
          </li>
          <li style={styles.docsLi}>
            Optionally use a mobile app to manage finances on the go.
          </li>
        </ul>
        <hr style={{ marginTop: 18, marginBottom: 18 }} />
        <h2 style={styles.docsH2}>Advantages (why this app helps)</h2>
        <ul style={{ paddingLeft: 18 }}>
          <li style={styles.docsLi}>
            <strong>Easy to use</strong> Simple interfaces for fast transaction
            entry.
          </li>
          <li style={styles.docsLi}>
            <strong>Portable exports</strong> Export data in common formats for
            spreadsheets and accounting.
          </li>
          <li style={styles.docsLi}>
            <strong>Cross-device access</strong> Use the web and mobile app to
            manage finances anywhere.
          </li>
          <li style={styles.docsLi}>
            <strong>Secure by design</strong> Built with common security
            practices and admin controls for backups.
          </li>
        </ul>
      </div>
    );
  }

  // Docs modal wrapper
  function renderDocsModalContent() {
    if (!docsModal.open) return null;
    const { type } = docsModal;
    const hideScrollbarStyles = {
      WebkitScrollbar: { display: "none" },
      msOverflowStyle: "none",
      scrollbarWidth: "none",
    };
    const scrollContainerStyle = {
      maxHeight: "calc(100vh - 160px)",
      overflowY: "auto",
      paddingRight: 6,
    };

    const close = () => setDocsModal({ open: false, type: null });

    if (type === "api") {
      return (
        <div
          style={styles.modalOverlay}
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div style={{ ...styles.modal, ...hideScrollbarStyles }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText size={20} style={{ color: "#06b6d4" }} />
                <div>
                  <div style={{ fontWeight: 700 }}>API Integration guide</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    Overview and steps for administrators and integrators.
                  </div>
                </div>
              </div>
              <button
                onClick={close}
                style={{
                  borderRadius: 8,
                  padding: 8,
                  border: "1px solid #e6eef6",
                  background: "#fff",
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="hide-scrollbar" style={scrollContainerStyle}>
              <div style={styles.docsWrap}>
                <h2 style={styles.docsH2}>What the API does</h2>
                <p style={styles.docsP}>
                  Allow authorized clients to read and write transactions,
                  manage categories, and fetch reports. All API access requires
                  authenticated requests to protect user data.
                </p>
                <h2 style={styles.docsH2}>High-level integration steps</h2>
                <ol style={{ paddingLeft: 18 }}>
                  <li style={styles.docsLi}>
                    <strong>Request API access</strong> contact the system
                    administrator to receive credentials or API access.
                  </li>
                  <li style={styles.docsLi}>
                    <strong>Authentication</strong> obtain a valid token or
                    account and use it to authenticate requests. Tokens expire;
                    follow admin instructions for renewal.
                  </li>
                  <li style={styles.docsLi}>
                    <strong>Common endpoints examples</strong>
                    <ul style={{ paddingLeft: 18 }}>
                      <li style={styles.docsLi}>
                        <code>GET /transactions</code> list user transactions
                      </li>
                      <li style={styles.docsLi}>
                        <code>POST /transactions</code> create a new
                        transaction
                      </li>
                      <li style={styles.docsLi}>
                        <code>GET /reports</code> get monthly or category
                        reports
                      </li>
                    </ul>
                  </li>
                  <li style={styles.docsLi}>
                    <strong>Rate limits &amp; usage</strong> adhere to any
                    limits the admin sets; avoid requesting large exports
                    frequently to reduce load.
                  </li>
                  <li style={styles.docsLi}>
                    <strong>Error handling</strong> on errors, include the
                    request details (endpoint, payload, timestamp) when
                    reporting to support.
                  </li>
                </ol>
                <h2 style={styles.docsH2}>Integration safety</h2>
                <ul style={{ paddingLeft: 18 }}>
                  <li style={styles.docsLi}>
                    Never share credentials in public repositories or channels.
                  </li>
                  <li style={styles.docsLi}>
                    Use secure channels to send credentials to integrators.
                  </li>
                  <li style={styles.docsLi}>
                    Follow admin instructions for permitted integrations and IP
                    allowlists.
                  </li>
                </ul>
                <h2 style={styles.docsH2}>Where to get technical details</h2>
                <p style={styles.docsP}>
                  Ask your admin for the API specification (OpenAPI/Swagger or a
                  PDF) that lists endpoints, request/response schemas,
                  authentication method, and examples.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (type === "privacy") {
      return (
        <div
          style={styles.modalOverlay}
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div style={{ ...styles.modal, ...hideScrollbarStyles }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <LifeBuoy size={20} style={{ color: "#06b6d4" }} />
                <div>
                  <div style={{ fontWeight: 700 }}>Privacy &amp; Security</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    How we protect personal and financial data.
                  </div>
                </div>
              </div>
              <button
                onClick={close}
                style={{
                  borderRadius: 8,
                  padding: 8,
                  border: "1px solid #e6eef6",
                  background: "#fff",
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="hide-scrollbar" style={scrollContainerStyle}>
              <div style={styles.docsWrap}>
                <h2 style={styles.docsH2}>Key protections</h2>
                <ul style={{ paddingLeft: 18 }}>
                  <li style={styles.docsLi}>
                    <strong>Secure passwords</strong> Passwords are stored using
                    secure hashing on the server.
                  </li>
                  <li style={{ marginTop: 6, color: "#334155" }}>
                    <strong>Encrypted transport</strong> data should be
                    transmitted over secure connections (HTTPS) to prevent
                    interception.
                  </li>
                  <li style={{ marginTop: 6, color: "#334155" }}>
                    <strong>Access control</strong> the app restricts access so each user can only see their own data.
                  </li>
                  <li style={{ marginTop: 6, color: "#334155" }}>
                    <strong>Backups &amp; storage</strong> backups are protected
                    and accessible only to authorized administrators.
                  </li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (type === "release") {
      return (
        <div
          style={styles.modalOverlay}
          onClick={(e) => e.target === e.currentTarget && close()}
        >
          <div style={{ ...styles.modal, ...hideScrollbarStyles }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Star size={20} style={{ color: "#06b6d4" }} />
                <div>
                  <div style={{ fontWeight: 700 }}>Release notes</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    Summary of app updates and migration notes.
                  </div>
                </div>
              </div>
              <button
                onClick={close}
                style={{
                  borderRadius: 8,
                  padding: 8,
                  border: "1px solid #e6eef6",
                  background: "#fff",
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="hide-scrollbar" style={scrollContainerStyle}>
              <div style={styles.docsWrap}>
                <h2 style={styles.docsH2}>Release notes template</h2>
                <p style={styles.docsP}>
                  <strong>Version</strong> <code>v1.1.1.5</code>
                </p>
                <p style={styles.docsP}>
                  <strong>Summary</strong> A short one-line summary of this
                  release.
                </p>
                <h3 style={styles.docsH2}>New features</h3>
                <p style={styles.docsP}>
                  Bulleted list of new user-facing features.
                </p>
                <h3 style={styles.docsH2}>Improvements</h3>
                <p style={styles.docsP}>
                  Smaller UX or performance improvements.
                </p>
                <h3 style={styles.docsH2}>Bug fixes</h3>
                <p style={styles.docsP}>
                  Issues fixed that users may have reported.
                </p>
                <h3 style={styles.docsH2}>
                  Important notices &amp; migration steps
                </h3>
                <p style={styles.docsP}>
                  Any actions users or admins must take (for example, data
                  migrations, required updates).
                </p>
                <h3 style={styles.docsH2}>How to get help</h3>
                <p style={styles.docsP}>
                  Where to report problems or ask questions.
                </p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (type === "docs") {
      return (
        <div
          style={styles.modalOverlay}
          onClick={(e) =>
            e.target === e.currentTarget &&
            setDocsModal({ open: false, type: null })
          }
        >
          <div style={{ ...styles.modal, ...hideScrollbarStyles }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 12,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <FileText size={20} style={{ color: "#06b6d4" }} />
                <div>
                  <div style={{ fontWeight: 700 }}>Documentation</div>
                  <div style={{ fontSize: 13, color: "#6b7280" }}>
                    Full app user guide
                  </div>
                </div>
              </div>
              <button
                onClick={() =>
                  setDocsModal({ open: false, type: null })
                }
                style={{
                  borderRadius: 8,
                  padding: 8,
                  border: "1px solid #e6eef6",
                  background: "#fff",
                }}
              >
                <X size={16} />
              </button>
            </div>
            <div className="hide-scrollbar" style={scrollContainerStyle}>
              <DocsInner />
            </div>
          </div>
        </div>
      );
    }

    return null;
  }

  // View ticket floating modal
  function renderViewTicketModal() {
    if (!viewTicket.open || !viewTicket.ticket) return null;
    const t = viewTicket.ticket;
    return (
      <div
        style={styles.modalOverlay}
        onClick={(e) =>
          e.target === e.currentTarget &&
          setViewTicket({ open: false, ticket: null, index: null })
        }
      >
        <div style={styles.modal}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <FileText size={20} style={{ color: "#06b6d4" }} />
              <div>
                <div style={{ fontWeight: 700 }}>
                  Ticket #{viewTicket.index + 1}
                </div>
                <div style={{ fontSize: 13, color: "#6b7280" }}>
                  View ticket details
                </div>
              </div>
            </div>
            <button
              onClick={() =>
                setViewTicket({ open: false, ticket: null, index: null })
              }
              style={{
                borderRadius: 8,
                padding: 8,
                border: "1px solid #e6eef6",
                background: "#fff",
              }}
            >
              <X size={16} />
            </button>
          </div>
          <div
            style={{
              maxHeight: "calc(100vh - 180px)",
              overflowY: "auto",
            }}
          >
            <div style={styles.docsWrap}>
              <h2 style={styles.docsH2}>Type</h2>
              <p style={styles.docsP}>{t.type}</p>

              <h2 style={styles.docsH2}>Submitted on</h2>
              <p style={styles.docsP}>
                {t.submittedOn || formatDMY(t.createdAt || Date.now())}
              </p>

              <h2 style={styles.docsH2}>Subject</h2>
              <p style={styles.docsP}>{t.subject}</p>
              <h2 style={styles.docsH2}>Message</h2>
              <p style={{ ...styles.docsP, whiteSpace: "pre-wrap" }}>
                {t.message}
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        <div style={styles.headerRow}>
          <div style={styles.titleWrap}>
            <h1 style={styles.title}>Help &amp; Support</h1>
            <p style={styles.subtitle}>
              Docs, FAQs, interactive troubleshooting, and direct support all in
              one place.
            </p>
          </div>
          <div style={styles.userBox}>
            <div style={styles.userText}>
              <div style={styles.smallMuted}>Signed in as</div>
              <div style={styles.userName}>
                {user?.displayName || user?.email || "Guest"}
              </div>
            </div>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 12,
                background: "#fff",
                boxShadow: "0 6px 18px rgba(16,24,40,0.06)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <LifeBuoy size={20} style={{ color: "#06b6d4" }} />
            </div>
          </div>
        </div>

        <div style={{ ...styles.card, marginBottom: 14 }}>
          <div style={styles.searchArea}>
            <div style={{ flex: 1 }}>
              <div style={styles.inputWrapper}>
                <Search size={18} style={styles.searchIcon} />
                <input
                  placeholder="Search FAQs, guides, troubleshooting..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>
            <div style={styles.actions}>
              <button
                onClick={() =>
                  setDocsModal({ open: true, type: "docs" })
                }
                style={styles.primaryBtn}
              >
                View Docs
              </button>
              <button
                onClick={() => {
                  setModalMode("report");
                  setReport((r) => ({
                    ...r,
                    subject: "",
                    message: "",
                    type: "bug",
                    email: user?.email || "",
                    name: user?.displayName || "",
                  }));
                  setShowReportModal(true);
                }}
                style={styles.secondaryBtn}
              >
                <Bug size={16} />
                Report bug
              </button>
            </div>
          </div>

          <div style={{
            ...styles.quickGrid,
            gridTemplateColumns: isMobile ? "1fr" : "repeat(3,1fr)",
          }}>
            <div style={styles.quickCard}>
              <div style={styles.smallText}>Quick action</div>
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{ fontWeight: 700, color: "#0f172a" }}
                  >
                    Request PIN help
                  </div>
                  <div style={styles.smallText}>
                    Sends instructions to your registered email
                  </div>
                </div>
                <button
                  onClick={openPinRequest}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 8,
                    background: "#eef2ff",
                    border: "none",
                    cursor: "pointer",
                    color: "#3730a3",
                  }}
                >
                  Request
                </button>
              </div>
            </div>

            <div style={styles.quickCard}>
              <div style={styles.smallText}>Docs</div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700 }}>Integration guide</div>
                <div style={styles.smallText}>
                  How to wire Firebase &amp; export
                </div>
              </div>
            </div>

            <div style={styles.quickCard}>
              <div style={styles.smallText}>Support</div>
              <div style={{ marginTop: 8 }}>
                <div style={{ fontWeight: 700 }}>Contact team</div>
                <div style={styles.smallText}>
                  Email or create ticket
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={styles.card}>
          <div style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 6,
            marginBottom: 14,
          }}>
            <button
              onClick={() => setActiveTab("faqs")}
              style={{
                ...styles.tabButton,
                ...(activeTab === "faqs" ? styles.tabActive : {}),
              }}
            >
              <BookOpen size={16} />
              <span>FAQs</span>
            </button>
            <button
              onClick={() => setActiveTab("troubleshooter")}
              style={{
                ...styles.tabButton,
                ...(activeTab === "troubleshooter"
                  ? styles.tabActive
                  : {}),
              }}
            >
              <LifeBuoy size={16} />
              <span>Troubleshooter</span>
            </button>
            <button
              onClick={() => setActiveTab("contact")}
              style={{
                ...styles.tabButton,
                ...(activeTab === "contact" ? styles.tabActive : {}),
              }}
            >
              <MessageCircle size={16} />
              <span>Contact</span>
            </button>
          </div>

          <div style={{
            ...styles.contentGrid,
            gridTemplateColumns: isMobile ? "1fr" : "2fr 1fr",
          }}>
            {/* LEFT COLUMN */}
            <div>
              {activeTab === "faqs" && (
                <div style={styles.faqCard}>
                  <div style={styles.faqRow}>
                    <div>
                      <h2
                        style={{
                          margin: 0,
                          fontSize: 18,
                          fontWeight: 800,
                          color: "#0f172a",
                        }}
                      >
                        Frequently Asked Questions
                      </h2>
                      <div
                        style={{
                          ...styles.smallText,
                          marginTop: 6,
                        }}
                      >
                        Top answers curated to help you fast.
                      </div>
                    </div>
                    <div style={styles.smallText}>
                      {filteredFaqs.length} results
                    </div>
                  </div>
                  <div>
                    {filteredFaqs.length === 0 && (
                      <div
                        style={{
                          textAlign: "center",
                          padding: 24,
                          color: "#6b7280",
                        }}
                      >
                        No matching FAQs — try different keywords or create a
                        support ticket.
                      </div>
                    )}
                    {filteredFaqs.map((f) => (
                      <div key={f.id} style={styles.faqItem}>
                        <button
                          onClick={() => toggleExpand(f.id)}
                          style={styles.faqButton}
                        >
                          <div>
                            <div style={styles.faqQuestion}>{f.q}</div>
                            <div style={styles.faqTags}>
                              {f.tags?.join(" · ")}
                            </div>
                          </div>
                          <div style={{ color: "#94a3b8" }}>
                            {expanded === f.id ? (
                              <X size={16} />
                            ) : (
                              <FileText size={16} />
                            )}
                          </div>
                        </button>
                        {expanded === f.id && (
                          <div style={styles.faqAnswer}>{f.a}</div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === "troubleshooter" && (
                <div style={styles.faqCard}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 800,
                    }}
                  >
                    Troubleshooter
                  </h2>
                  <div
                    style={{
                      ...styles.smallText,
                      marginTop: 8,
                    }}
                  >
                    Answer a couple of questions and we will show the most
                    likely fixes.
                  </div>
                  {/* Minimal step implementation, with Can't login opening modal */}
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700 }}>
                      What&apos;s the issue?
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 8,
                        marginTop: 10,
                      }}
                    >
                      <button
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #eef2ff",
                          background: "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onClick={() => {
                          setModalMode("report");
                          setReport((r) => ({
                            ...r,
                            type: "bug",
                            subject: "Login issue",
                            message:
                              "I am unable to login. Please help to resolve this issue.",
                            email: user?.email || "",
                            name: user?.displayName || "",
                          }));
                          setShowReportModal(true);
                        }}
                      >
                        Can&apos;t login
                      </button>
                      <button
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #eef2ff",
                          background: "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onClick={() => {
                          // Open support modal for Data not syncing so user can add details
                          setModalMode("report");
                          setReport((r) => ({
                            ...r,
                            type: "bug",
                            subject: "Data not syncing",
                            message:
                              "My transactions are not syncing across devices or the server. Please advise steps to troubleshoot (include any error messages you see, approximate time it started, and whether this happens on web/mobile).",
                            email: user?.email || "",
                            name: user?.displayName || "",
                          }));
                          setShowReportModal(true);
                        }}
                      >
                        Data not syncing
                      </button>
                      <button
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #eef2ff",
                          background: "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onClick={() => {
                          // Open support modal for Export failed so user can add details
                          setModalMode("report");
                          setReport((r) => ({
                            ...r,
                            type: "bug",
                            subject: "Export failed",
                            message:
                              "Export to PDF or CSV failed. Please describe what happened (any error text, browser name/version, whether pop-ups are blocked, and if storage space is available).",
                            email: user?.email || "",
                            name: user?.displayName || "",
                          }));
                          setShowReportModal(true);
                        }}
                      >
                        Export failed
                      </button>
                      <button
                        style={{
                          padding: 12,
                          borderRadius: 10,
                          border: "1px solid #eef2ff",
                          background: "#fff",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                        onClick={() => {
                          setModalMode("report");
                          setReport((r) => ({
                            ...r,
                            subject: "",
                            message: "",
                            type: "other",
                            email: user?.email || "",
                            name: user?.displayName || "",
                          }));
                          setShowReportModal(true);
                        }}
                      >
                        Other
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "contact" && (
                <div style={styles.faqCard}>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 18,
                      fontWeight: 800,
                    }}
                  >
                    Contact the support team
                  </h2>
                  <div
                    style={{
                      marginTop: 12,
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: 12,
                    }}
                  >
                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: "#fbfdff",
                        border: "1px solid #eef2ff",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>Email</div>
                      <div style={styles.smallText}>
                        support@smartbudgettracker.app
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <button
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            padding: "8px 10px",
                            borderRadius: 8,
                            background: "#fff",
                            border: "1px solid #e6eef6",
                            color: "#0f172a",
                            cursor: "pointer",
                          }}
                          onClick={() => {
                            setModalMode("report");
                            setReport((r) => ({
                              ...r,
                              subject: `Support request from ${
                                user?.email || "guest"
                              }`,
                              message: "",
                              type: "bug",
                              email: user?.email || "",
                              name: user?.displayName || "",
                            }));
                            setShowReportModal(true);
                          }}
                        >
                          <Send size={14} />
                          Send ticket
                        </button>
                      </div>
                    </div>

                    <div
                      style={{
                        padding: 12,
                        borderRadius: 10,
                        background: "#fbfdff",
                        border: "1px solid #eef2ff",
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>Live chat</div>
                      <div style={styles.smallText}>
                        Available during business hours (Mon–Fri)
                      </div>
                      <div style={{ marginTop: 8 }}>
                        <button
                          style={{
                            ...styles.smallButton,
                            background: "#fff",
                          }}
                          onClick={() =>
                            showResult(
                              false,
                              "Coming soon",
                              "Live chat will be available in a future update."
                            )
                          }
                        >
                          Start chat
                        </button>
                      </div>
                    </div>
                  </div>

                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontWeight: 700 }}>
                      Rate your support experience
                    </div>
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          onClick={() => starClick(n)}
                          style={{
                            ...styles.starBtn,
                            ...(rating >= n ? styles.starActive : {}),
                          }}
                        >
                          <Star size={16} />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* RIGHT COLUMN */}
            <div>
              <div style={styles.rightColumnCard}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <div style={styles.smallText}>Resources</div>
                  <div style={{ fontWeight: 700 }}>
                    Documentation &amp; Guides
                  </div>
                </div>
                <div style={{ ...styles.smallText, marginTop: 2 }}>
                  Updated
                </div>
                <ul
                  style={{
                    marginTop: 12,
                    paddingLeft: 0,
                    listStyle: "none",
                  }}
                >
                  <li
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <a
                      style={{
                        textDecoration: "underline",
                        color: "#0f172a",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        setDocsModal({ open: true, type: "api" })
                      }
                    >
                      API Integration guide
                    </a>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                      PDF
                    </span>
                  </li>
                  <li
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 8,
                    }}
                  >
                    <a
                      style={{
                        textDecoration: "underline",
                        color: "#0f172a",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        setDocsModal({ open: true, type: "privacy" })
                      }
                    >
                      Privacy &amp; Security
                    </a>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                      Policy
                    </span>
                  </li>
                  <li
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                    }}
                  >
                    <a
                      style={{
                        textDecoration: "underline",
                        color: "#0f172a",
                        cursor: "pointer",
                      }}
                      onClick={() =>
                        setDocsModal({ open: true, type: "release" })
                      }
                    >
                      Release notes
                    </a>
                    <span style={{ fontSize: 12, color: "#94a3b8" }}>
                      v1.2.0
                    </span>
                  </li>
                </ul>
              </div>

              <div style={styles.rightColumnCard}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    marginBottom: 8,
                  }}
                >
                  <div style={{ fontWeight: 700 }}>Your recent tickets</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>
                    Latest
                  </div>
                </div>
                <div style={{ display: "grid", gap: 8 }}>
                  {recent.length === 0 && (
                    <div style={{ color: "#6b7280" }}>
                      No recent tickets
                    </div>
                  )}
                  {recent.map((r, idx) => (
                    <div key={r.id} style={styles.recentTicket}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <div
                          style={{
                            fontWeight: 700,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {idx + 1}. {r.subject}
                        </div>
                        <button
                          style={{
                            ...styles.smallButton,
                            padding: "4px 8px",
                            fontSize: 12,
                          }}
                          onClick={() =>
                            setViewTicket({
                              open: true,
                              ticket: r,
                              index: idx,
                            })
                          }
                        >
                          View
                        </button>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginTop: 4,
                        }}
                      >
                        {new Date(
                          r.createdAt || Date.now()
                        ).toLocaleString()}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#6b7280",
                          marginTop: 2,
                        }}
                      >
                        Status {r.status}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* REPORT / PIN MODAL */}
        {showReportModal && (
          <div style={styles.modalOverlay}>
            <div style={styles.modal}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 12,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <Bug size={20} style={{ color: "#ef4444" }} />
                  <div>
                    <div style={{ fontWeight: 700 }}>
                      {modalMode === "pin"
                        ? "Request PIN change / deletion"
                        : "Create support ticket"}
                    </div>
                    <div style={{ fontSize: 13, color: "#6b7280" }}>
                      Describe the issue and we will get back to you.
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setShowReportModal(false);
                    setModalMode("report");
                  }}
                  style={{
                    borderRadius: 8,
                    padding: 8,
                    border: "1px solid #e6eef6",
                    background: "#fff",
                  }}
                >
                  <X size={16} />
                </button>
              </div>

              <div style={{ display: "grid", gap: 10 }}>
                {/* TYPE */}
                <div>
                  <label style={styles.smallText}>Type</label>
                  <select
                    value={
                      modalMode === "pin" ? "pin" : report.type || "bug"
                    }
                    onChange={(e) =>
                      modalMode === "pin"
                        ? null
                        : setReport((r) => ({
                            ...r,
                            type: e.target.value,
                          }))
                    }
                    disabled={modalMode === "pin"}
                    style={{
                      ...styles.formInput,
                      marginTop: 6,
                      background:
                        modalMode === "pin" ? "#f8fafc" : "#fff",
                      color: "#0f172a",
                    }}
                  >
                    {/* PIN modal: only PIN request and locked */}
                    {modalMode === "pin" ? (
                      <option value="pin">PIN request</option>
                    ) : (
                      <>
                        <option value="bug">Bug</option>
                        <option value="feedback">Feedback</option>
                        <option value="other">Other</option>
                      </>
                    )}
                  </select>
                </div>

                {/* NAME (readonly) */}
                <div>
                  <label style={styles.smallText}>Name</label>
                  <input
                    value={report.name || user?.displayName || ""}
                    readOnly
                    disabled
                    style={{
                      ...styles.formInput,
                      marginTop: 6,
                      background: "#f8fafc",
                      color: "#0f172a",
                    }}
                  />
                </div>

                {/* EMAIL (readonly) */}
                <div>
                  <label style={styles.smallText}>Email</label>
                  <input
                    value={report.email || user?.email || ""}
                    readOnly
                    disabled
                    style={{
                      ...styles.formInput,
                      marginTop: 6,
                      background: "#f8fafc",
                      color: "#0f172a",
                    }}
                  />
                </div>

                {/* SUBJECT (plain, locked for PIN) */}
                <div>
                  <label style={styles.smallText}>Subject</label>
                  <input
                    value={report.subject}
                    onChange={(e) =>
                      setReport((r) => ({
                        ...r,
                        subject: e.target.value,
                      }))
                    }
                    readOnly={modalMode === "pin"}
                    disabled={modalMode === "pin"}
                    style={{
                      ...styles.formInput,
                      marginTop: 6,
                      background:
                        modalMode === "pin" ? "#f8fafc" : "#fff",
                      color: "#0f172a",
                    }}
                  />
                </div>

                {/* MESSAGE (plain, vertical resize only) */}
                <div>
                  <label style={styles.smallText}>Message</label>
                  <textarea
                    value={report.message}
                    onChange={(e) =>
                      setReport((r) => ({
                        ...r,
                        message: e.target.value,
                      }))
                    }
                    rows={5}
                    style={{
                      ...styles.formInput,
                      marginTop: 6,
                      resize: "vertical", // vertical only
                      overflowX: "hidden", // prevent sideways expansion
                    }}
                  />
                </div>
              </div>

              <div style={styles.footerBtns}>
                <button
                  onClick={
                    modalMode === "pin"
                      ? handlePinCancel
                      : () => {
                          setShowReportModal(false);
                          setModalMode("report");
                        }
                  }
                  style={styles.smallButton}
                >
                  {modalMode === "pin" ? "Cancel email" : "Cancel"}
                </button>
                <button
                  onClick={submitReport}
                  disabled={submitting}
                  style={{
                    ...styles.primaryBtn,
                    opacity: submitting ? 0.8 : 1,
                  }}
                >
                  {submitting
                    ? "Sending..."
                    : modalMode === "pin"
                    ? "Send request"
                    : "Send ticket"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* DOCS MODAL */}
        {renderDocsModalContent()}

        {/* VIEW TICKET MODAL */}
        {renderViewTicketModal()}

        {/* RESULT POPUP */}
        {resultPopup.open && (
          <div style={styles.modalOverlay}>
            <div style={styles.resultBox}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {resultPopup.success ? (
                  <CheckCircle size={36} style={{ color: "#10b981" }} />
                ) : (
                  <X size={36} style={{ color: "#ef4444" }} />
                )}
              </div>
              <div>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 800,
                  }}
                >
                  {resultPopup.title}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#475569",
                  }}
                >
                  {resultPopup.message}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
