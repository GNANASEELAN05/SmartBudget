import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { Outlet } from "react-router-dom";

export default function DashboardLayout() {
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",          // fixed height
        overflow: "hidden",       // ⛔ block page scroll here ONLY
      }}
    >
      {/* Sidebar */}
      <Sidebar />

      {/* Right Side */}
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",     // ⛔ isolate content scroll
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
            overflowY: "auto",     // ✅ content scrolls here
            minHeight: 0,          // 🔑 required for flex scroll
            padding: "16px",

            /* ✅ hide scrollbar but keep scrolling */
            scrollbarWidth: "none",     // Firefox
            msOverflowStyle: "none",    // IE / Edge
          }}
          className="hide-scrollbar"
        >
          <Outlet />
        </div>
      </div>

      {/* Webkit scrollbar hide */}
      <style>
        {`
          .hide-scrollbar::-webkit-scrollbar {
            width: 0;
            height: 0;
            display: none;
          }
        `}
      </style>
    </div>
  );
}
