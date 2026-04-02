import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { Outlet } from "react-router-dom";

export default function DashboardLayout() {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Sidebar */}
      <Sidebar />

      {/* Right Side — takes full width on mobile since sidebar is fixed/off-screen */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          minWidth: 0,
          width: "100%",
        }}
      >
        {/* Topbar (fixed) */}
        <div style={{ flexShrink: 0 }}>
          <Topbar />
        </div>

        {/* Scrollable Page Content */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            minHeight: 0,
            padding: "16px",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
          className="hide-scrollbar"
        >
          <Outlet />
        </div>
      </div>

      {/* Scrollbar hide styles */}
      <style>{`
        .hide-scrollbar::-webkit-scrollbar {
          width: 0;
          height: 0;
          display: none;
        }
        @media (max-width: 768px) {
          .hide-scrollbar {
            padding: 12px 8px !important;
            padding-top: 56px !important;
          }
        }
        @media (min-width: 769px) {
          .hide-scrollbar {
            padding: 16px !important;
          }
        }
      `}</style>
    </div>
  );
}