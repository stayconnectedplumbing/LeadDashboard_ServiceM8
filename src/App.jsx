import { useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { CallTrackingView } from "./views/CallTrackingView";
import { LeadsView } from "./views/LeadsView";

export function App() {
  const [activeView, setActiveView] = useState("leads");

  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} onNavigate={setActiveView} />

      <main className="main-content">
        {activeView === "leads" && <LeadsView />}
        {activeView === "calls" && <CallTrackingView />}
      </main>
    </div>
  );
}
