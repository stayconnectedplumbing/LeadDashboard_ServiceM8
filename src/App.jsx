import { useEffect, useRef, useState } from "react";
import { Sidebar } from "./components/Sidebar";
import { CallTrackingView } from "./views/CallTrackingView";
import { LeadsView } from "./views/LeadsView";
import { hasSupabaseConfig, supabase } from "./supabaseClient";
import {
  createLeadNotification,
  MAX_LEAD_NOTIFICATIONS,
} from "./utils/leadNotifications";

export function App() {
  const [activeView, setActiveView] = useState("leads");
  const [notifications, setNotifications] = useState([]);
  const focusLeadRef = useRef(null);

  const unreadNotificationCount = notifications.filter((item) => !item.read).length;

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;

    const channel = supabase
      .channel("lead-notifications")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          if (!payload.new) return;
          const lead = payload.new;

          setNotifications((prev) => {
            if (prev.some((item) => item.leadId === lead.id)) {
              return prev;
            }
            return [createLeadNotification(lead), ...prev].slice(
              0,
              MAX_LEAD_NOTIFICATIONS,
            );
          });
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "leads" },
        (payload) => {
          if (!payload.old?.id) return;
          setNotifications((prev) =>
            prev.filter((item) => item.leadId !== payload.old.id),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  function markAllNotificationsRead() {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));
  }

  function clearAllNotifications() {
    setNotifications([]);
  }

  function handleNotificationSelect(notification) {
    setNotifications((prev) =>
      prev.map((item) =>
        item.leadId === notification.leadId ? { ...item, read: true } : item,
      ),
    );
    setActiveView("leads");
    window.setTimeout(() => {
      focusLeadRef.current?.(notification);
    }, 100);
  }

  return (
    <div className="app-layout">
      <Sidebar
        activeView={activeView}
        onNavigate={setActiveView}
        notifications={notifications}
        unreadNotificationCount={unreadNotificationCount}
        onMarkAllNotificationsRead={markAllNotificationsRead}
        onClearAllNotifications={clearAllNotifications}
        onNotificationSelect={handleNotificationSelect}
      />

      <main className="main-content">
        {activeView === "leads" && <LeadsView focusLeadRef={focusLeadRef} />}
        {activeView === "calls" && <CallTrackingView />}
      </main>
    </div>
  );
}
