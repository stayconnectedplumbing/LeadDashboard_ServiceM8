import { useState } from "react";
import { Menu as MenuIcon } from "lucide-react";
import { Sidebar } from "./components/Sidebar";
import { CallTrackingView } from "./views/CallTrackingView";
import { LeadsView } from "./views/LeadsView";

export function App() {
  const [activeView, setActiveView] = useState("leads");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="app-layout">
      {!sidebarOpen && (
        <button
          type="button"
          className="sidebar-toggle-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
        >
          <MenuIcon size={20} />
        </button>
      )}

      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        open={sidebarOpen}
        onOpenChange={setSidebarOpen}
      />

      <main className="main-content">
        {activeView === "leads" && <LeadsView />}
        {activeView === "calls" && <CallTrackingView />}
      </main>
    </div>
  );
}
