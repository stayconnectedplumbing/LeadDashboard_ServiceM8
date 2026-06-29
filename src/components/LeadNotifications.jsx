import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Bell } from "lucide-react";
import { formatDate } from "../utils/format";

const DROPDOWN_WIDTH = 400;

function getDropdownPosition(triggerEl) {
  if (!triggerEl) return null;

  const rect = triggerEl.getBoundingClientRect();
  const width = Math.min(DROPDOWN_WIDTH, window.innerWidth - 16);
  const left = Math.max(
    8,
    Math.min(rect.right - width, window.innerWidth - width - 8),
  );

  return {
    top: rect.bottom + 8,
    left,
    width,
  };
}

function NotificationItem({ item, onSelect }) {
  return (
    <li
      className={`lead-notification-item${item.read ? " is-read" : ""}`}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(item)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(item);
        }
      }}
    >
      <div className="lead-notification-row lead-notification-row-title">
        {!item.read ? <span className="lead-notification-dot" aria-hidden="true" /> : null}
        <span>{item.fullName}</span>
      </div>

      <div className="lead-notification-row lead-notification-row-muted">
        {formatDate(item.receivedAt)}
      </div>

      <div className="lead-notification-row lead-notification-row-source">
        New lead · {item.categoryLabel}
      </div>

      {item.service ? (
        <div className="lead-notification-row">
          <span className="lead-notification-field-label">Service</span>
          <span className="lead-notification-field-value">{item.service}</span>
        </div>
      ) : null}

      {item.phone ? (
        <div className="lead-notification-row">
          <span className="lead-notification-field-label">Phone</span>
          <span className="lead-notification-field-value">{item.phone}</span>
        </div>
      ) : null}

      {item.message ? (
        <div className="lead-notification-row lead-notification-row-message">
          <span className="lead-notification-field-label">Message</span>
          <span className="lead-notification-field-value">{item.message}</span>
        </div>
      ) : null}
    </li>
  );
}

export function LeadNotifications({
  notifications,
  unreadCount,
  onMarkAllRead,
  onClearAll,
  onSelect,
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const panelId = useId();
  const triggerRef = useRef(null);
  const dropdownRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function updatePosition() {
      setPosition(getDropdownPosition(triggerRef.current));
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (
        dropdownRef.current?.contains(target) ||
        triggerRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    }

    updatePosition();
    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open, notifications.length]);

  function handleToggle() {
    setOpen((current) => {
      const nextOpen = !current;
      if (nextOpen && unreadCount > 0) {
        onMarkAllRead();
      }
      return nextOpen;
    });
  }

  function handleSelect(item) {
    onSelect(item);
    setOpen(false);
  }

  const dropdown =
    open && position
      ? createPortal(
          <div
            ref={dropdownRef}
            id={panelId}
            className="lead-notifications-dropdown"
            style={{
              position: "fixed",
              top: `${position.top}px`,
              left: `${position.left}px`,
              width: `${position.width}px`,
            }}
            role="dialog"
            aria-label="Lead notifications"
          >
            <div className="lead-notifications-dropdown-header">
              <div className="lead-notifications-dropdown-heading">
                <h3>Notifications</h3>
                <div className="lead-notifications-dropdown-subtitle">
                  {notifications.length} lead
                  {notifications.length === 1 ? "" : "s"}
                </div>
              </div>
              {notifications.length > 0 ? (
                <button
                  type="button"
                  className="text-button text-button-compact"
                  onClick={onClearAll}
                >
                  Clear all
                </button>
              ) : null}
            </div>

            {notifications.length === 0 ? (
              <div className="lead-notifications-dropdown-empty">
                New leads will appear here while this dashboard is open.
              </div>
            ) : (
              <ul className="lead-notifications-dropdown-list">
                {notifications.map((item) => (
                  <NotificationItem
                    key={item.id}
                    item={item}
                    onSelect={handleSelect}
                  />
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="lead-notifications">
      <button
        ref={triggerRef}
        type="button"
        className={`lead-notifications-bell${unreadCount > 0 ? " has-unread" : ""}`}
        onClick={handleToggle}
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-haspopup="dialog"
      >
        <Bell size={16} strokeWidth={2} />
        {unreadCount > 0 ? (
          <span className="lead-notifications-badge" aria-hidden="true">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>
      {dropdown}
    </div>
  );
}
