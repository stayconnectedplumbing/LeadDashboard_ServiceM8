import {
  Sidebar as ProSidebar,
  Menu,
  MenuItem,
  sidebarClasses,
} from "react-pro-sidebar";
import {
  ClipboardList,
  PhoneCall,
  X,
} from "lucide-react";

const NAV_ITEMS = [
  {
    id: "leads",
    label: "Leads",
    description: "Website & Facebook forms",
    icon: ClipboardList,
  },
  {
    id: "calls",
    label: "Call Tracking",
    description: "WildJar phone calls",
    icon: PhoneCall,
  },
];

const menuItemStyles = {
  button: ({ level, active, disabled }) => {
    if (level !== 0 || disabled) return undefined;

    return {
      borderRadius: "8px",
      margin: "0 12px 4px",
      padding: "10px 12px",
      height: "auto",
      color: active ? "#ffffff" : "#cbd5e1",
      backgroundColor: active ? "#2563eb" : "transparent",
      transition: "background-color 150ms ease, color 150ms ease",
      "&:hover": {
        backgroundColor: active ? "#1d4ed8" : "rgba(255, 255, 255, 0.08)",
        color: "#ffffff",
      },
    };
  },
  label: ({ level }) =>
    level === 0
      ? {
          fontSize: "0.9375rem",
          fontWeight: 600,
        }
      : undefined,
  icon: ({ level, active }) =>
    level === 0
      ? {
          minWidth: "2rem",
          color: active ? "#ffffff" : "#94a3b8",
        }
      : undefined,
};

export function Sidebar({ activeView, onNavigate, open, onOpenChange }) {
  const handleNavigate = (viewId) => {
    onNavigate(viewId);
    onOpenChange(false);
  };

  return (
    <>
      <ProSidebar
        toggled={open}
        breakPoint="all"
        width="260px"
        backgroundColor="#0f172a"
        transitionDuration={250}
        onBackdropClick={() => onOpenChange(false)}
        rootStyles={{
          border: "none",
          [`.${sidebarClasses.container}`]: {
            borderRight: "1px solid #1e293b",
            display: "flex",
            flexDirection: "column",
            height: "100vh",
          },
        }}
      >
        <div className="pro-sidebar-brand">
          <div>
            <p className="pro-sidebar-eyebrow">ServiceM8</p>
            <h2 className="pro-sidebar-title">Lead Dashboard</h2>
          </div>
          <button
            type="button"
            className="pro-sidebar-close"
            onClick={() => onOpenChange(false)}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <Menu menuItemStyles={menuItemStyles}>
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const isActive = activeView === item.id;

            return (
              <MenuItem
                key={item.id}
                active={isActive}
                icon={<Icon size={20} />}
                onClick={() => handleNavigate(item.id)}
              >
                {item.label}
              </MenuItem>
            );
          })}
        </Menu>
      </ProSidebar>
    </>
  );
}
