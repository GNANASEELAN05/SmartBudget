import Sidebar from "../components/Sidebar";
import Topbar from "../components/Topbar";
import { Outlet } from "react-router-dom";

export default function MainLayout() {
  return (
    <div style={{ display: "flex", height: "100vh", background: "#f8fafc" }}>
      {/* Sidebar */}
      <Sidebar />

      {/* Right Section */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* Topbar */}
        <Topbar />

        {/* Page Content */}
        <div
          style={{
            flex: 1,
            padding: "28px",
            overflowY: "auto",
          }}
        >
          <Outlet />
        </div>
      </div>
    </div>
  );
}
