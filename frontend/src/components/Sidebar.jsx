import {
  Home,
  PlusCircle,
  List,
  Tag,
  Wallet,
  BarChart2,
  Target,
  FileText,
  User,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Calendar,
  Repeat,
  CreditCard,
  Settings,
  DownloadCloud,
  UploadCloud,
  PieChart,
  TrendingUp,
  Bell,
  Layers,
} from "lucide-react";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react";

export default function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth <= 768);
      if (window.innerWidth > 768) setMobileOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const sections = [
    {
      title: "OVERVIEW",
      items: [
        { name: "Dashboard", icon: Home, path: "/dashboard" },
        { name: "Income", icon: Wallet, path: "/income" },
        { name: "Add Expense", icon: PlusCircle, path: "/add-expense" },
        { name: "Monthly Budget", icon: Wallet, path: "/budget" },
        { name: "Expense List", icon: List, path: "/expenses" },
        { name: "Transactions", icon: CreditCard, path: "/transactions" },
        { name: "Recurring", icon: Repeat, path: "/recurring" },
        { name: "Categories", icon: Tag, path: "/categories" },
      ],
    },
    {
      title: "PLANNING",
      items: [
        { name: "Savings Goals", icon: Target, path: "/savings" },
        { name: "Budgets Overview", icon: PieChart, path: "/budgets-overview" },
        { name: "Net Worth", icon: Layers, path: "/net-worth" },
        { name: "Scheduled Bills", icon: Calendar, path: "/scheduled-bills" },
      ],
    },
    {
      title: "TOOLS",
      items: [
        { name: "Export", icon: DownloadCloud, path: "/export" },
      ],
    },
    {
      title: "INSIGHTS",
      items: [
        { name: "Analytics", icon: BarChart2, path: "/analytics" },
        { name: "Reports", icon: FileText, path: "/reports" },
        { name: "Trends", icon: TrendingUp, path: "/trends" },
      ],
    },
    {
      title: "ACCOUNT",
      items: [
        { name: "Profile", icon: User, path: "/profile" },
        { name: "Settings", icon: Settings, path: "/settings" },
        { name: "Help", icon: Tag, path: "/help" },
      ],
    },
  ];

  const handleClick = async (item) => {
    if (item.name === "Logout") {
      await signOut(auth);
      localStorage.clear();
      navigate("/login");
    } else {
      navigate(item.path);
    }
  };

return (
    <>
      {/* ===== MOBILE HAMBURGER BUTTON ===== */}
        {isMobile && !mobileOpen && (
        <button
          onClick={() => setMobileOpen(true)}
          style={{
            position: "fixed",
            top: 18,
            left: 14,
            zIndex: 1300,
            background: "#0f9960",
            color: "white",
            border: "none",
            borderRadius: "10px",
            width: "40px",
            height: "40px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
          }}
          aria-label="Open menu"
        >
          <span style={{ fontSize: 20, lineHeight: 1 }}>☰</span>
        </button>
      )}

      {/* ===== MOBILE BACKDROP ===== */}
      {isMobile && mobileOpen && (
        <div
          onClick={() => setMobileOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 1200,
          }}
        />
      )}

      {/* ===== SIDEBAR ===== */}
      <div
        style={{
          width: isMobile ? "260px" : collapsed ? "88px" : "260px",
          height: "100vh",
          background: "linear-gradient(180deg, #0f9960 0%, #0b6e45 100%)",
          color: "white",
          padding: "18px 14px",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          transition: isMobile ? "transform 0.28s ease" : "width 0.25s ease",
          flexShrink: 0,
          // Mobile: fixed drawer sliding in from left
          ...(isMobile && {
            position: "fixed",
            top: 0,
            left: 0,
            zIndex: 1250,
            transform: mobileOpen ? "translateX(0)" : "translateX(-100%)",
            boxShadow: mobileOpen ? "6px 0 24px rgba(0,0,0,0.35)" : "none",
          }),
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: "22px", flexShrink: 0 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: (!isMobile && collapsed) ? "center" : "space-between",
            }}
          >
            {(isMobile || !collapsed) && (
              <div>
                <h2 style={{ fontWeight: 700, margin: 0 }}>Smart Budget</h2>
                <span style={{ fontSize: "12px", opacity: 0.7 }}>
                  Personal Finance
                </span>
              </div>
            )}

            {isMobile ? (
              // Mobile: show X close button
              <div
                onClick={() => setMobileOpen(false)}
                style={{
                  cursor: "pointer",
                  padding: "6px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.15)",
                }}
              >
                <ChevronLeft size={18} />
              </div>
            ) : (
              // Desktop: collapse/expand toggle
              <div
                onClick={() => setCollapsed(!collapsed)}
                style={{
                  cursor: "pointer",
                  padding: "6px",
                  borderRadius: "8px",
                  background: "rgba(255,255,255,0.15)",
                }}
              >
                {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
              </div>
            )}
          </div>
        </div>

      {/* User Card */}
      {(isMobile || !collapsed) && (
        <div
          style={{
            background: "rgba(255,255,255,0.12)",
            borderRadius: "14px",
            padding: "12px",
            marginBottom: "22px",
            display: "flex",
            alignItems: "center",
            gap: "12px",
          }}
        >
          <div
            style={{
              width: "38px",
              height: "38px",
              borderRadius: "50%",
              background: "#fff",
              color: "#0b6e45",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 700,
            }}
          >
            U
          </div>
          <div>
            <div style={{ fontSize: "14px", fontWeight: 600 }}>
              User Account
            </div>
            <div style={{ fontSize: "11px", opacity: 0.7 }}>
              Finance Manager
            </div>
          </div>
        </div>
      )}

      {/* Menu */}
      <div
        className="sidebar-scroll"
        style={{
          flex: 1,
          overflowY: "auto",
          minHeight: 0,
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {sections.map((section, si) => (
          <div key={si} style={{ marginBottom: "18px" }}>
            {(isMobile || !collapsed) && (
              <div
                style={{
                  fontSize: "11px",
                  fontWeight: 600,
                  opacity: 0.6,
                  marginBottom: "8px",
                  paddingLeft: "10px",
                  letterSpacing: "0.6px",
                }}
              >
                {section.title}
              </div>
            )}

            {section.items.map((item, i) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;

              return (
        <div
          key={i}
          title={(!isMobile && collapsed) ? item.name : ""}
          onClick={() => { handleClick(item); if (isMobile) setMobileOpen(false); }}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: (!isMobile && collapsed) ? "center" : "flex-start",
                    gap: "12px",
                    padding: "12px 14px",
                    marginBottom: "6px",
                    borderRadius: "14px",
                    cursor: "pointer",
                    background: isActive
                      ? "rgba(255,255,255,0.2)"
                      : "transparent",
                    boxShadow: isActive
                      ? "0 0 12px rgba(255,255,255,0.25)"
                      : "none",
                    transition: "all 0.2s ease",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background =
                      "rgba(255,255,255,0.14)")
                  }
                  onMouseLeave={(e) =>
                    (e.currentTarget.style.background = isActive
                      ? "rgba(255,255,255,0.2)"
                      : "transparent")
                  }
                >
                  <Icon size={20} />
                  {(isMobile || !collapsed) && (
                    <span style={{ fontSize: "15px", fontWeight: 500 }}>
                      {item.name}
                    </span>
                  )}
                </div>
              );
            })}

            {!collapsed && (
              <div
                style={{
                  height: "1px",
                  background: "rgba(255,255,255,0.15)",
                  margin: "14px 0",
                }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Logout */}
      <div
        onClick={() => handleClick({ name: "Logout" })}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: (!isMobile && collapsed) ? "center" : "flex-start",
          gap: "12px",
          padding: "12px 14px",
          borderRadius: "14px",
          cursor: "pointer",
          background: "rgba(255,80,80,0.18)",
          flexShrink: 0,
          marginBottom: "10px",
        }}
      >
        <LogOut size={20} />
        {(isMobile || !collapsed) && (
          <span style={{ fontSize: "15px", fontWeight: 600 }}>
            Logout
          </span>
        )}
      </div>

      {/* Footer */}
      {(isMobile || !collapsed) && (
        <div
          style={{
            fontSize: "11px",
            opacity: 0.6,
            textAlign: "center",
            flexShrink: 0,
          }}
        >
          © 2025 Smart Budget Tracker
        </div>
      )}

      <style>
        {`
          .sidebar-scroll::-webkit-scrollbar {
            width: 0;
            height: 0;
            display: none;
          }
        `}
      </style>
      </div>
    </>
  );
}
