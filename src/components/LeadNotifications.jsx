import { useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import { formatDate } from "../utils/format";

export function LeadNotifications({
  notifications,
  unreadCount,
  onMarkAllRead,
  onClearAll,
  onSelect,
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(event) {
      if (
        panelRef.current?.contains(event.target) ||
        buttonRef.current?.contains(event.target)
      ) {
        return;
      }
      setOpen(false);
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  function handleToggle() {
    const nextOpen = !open;
    setOpen(nextOpen);
    if (nextOpen && unreadCount > 0) {
      onMarkAllRead();
    }
  }

  return (
    <div className="lead-notifications">
      <button
        ref={buttonRef}
        type="button"
        className={`lead-notifications-bell${unreadCount > 0 ? " has-unread" : ""}`}
        onClick={handleToggle}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
      >
        <Bell size={14} strokeWidth={2} />
        {unreadCount > 0 && (
          <span className="lead-notifications-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          ref={panelRef}
          className="lead-notifications-panel"
          role="dialog"
          aria-label="Lead notifications"
        >
          <div className="lead-notifications-panel-header">
            <h3>Notifications</h3>
            {notifications.length > 0 && (
              <button
                type="button"
                className="text-button text-button-compact"
                onClick={onClearAll}
              >
                Clear all
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <p className="lead-notifications-empty">
              New leads will appear here while this dashboard is open.
            </p>
          ) : (
            <ul className="lead-notifications-list">
              {notifications.map((item) => (
                <li key={item.id} className="lead-notification-row">
                  <button
                    type="button"
                    className={`lead-notification-item${item.read ? " read" : ""}`}
                    onClick={() => {
                      onSelect(item);
                      setOpen(false);
                    }}
                  >
                    <div className="lead-notification-content">
                      <span className="lead-notification-title">
                        {item.fullName}
                      </span>
                      <span className="lead-notification-meta">
                        {item.categoryLabel}
                        {item.service ? ` · ${item.service}` : ""}
                      </span>
                      {item.phone && (
                        <span className="lead-notification-phone">
                          {item.phone}
                        </span>
                      )}
                      <span className="lead-notification-time">
                        {formatDate(item.receivedAt)}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
