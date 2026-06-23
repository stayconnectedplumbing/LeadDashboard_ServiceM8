import { ClipboardList, PhoneCall } from "lucide-react";

const NAV_ITEMS = [
  { id: "leads", label: "Leads", icon: ClipboardList },
  { id: "calls", label: "Call Tracking", icon: PhoneCall },
];

export function Sidebar({ activeView, onNavigate }) {
  return (
    <nav className="top-nav">
      <div className="top-nav-inner">
        <div className="top-nav-tabs">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <button
                key={item.id}
                type="button"
                className={`top-nav-tab${isActive ? " active" : ""}`}
                onClick={() => onNavigate(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
