import { useEffect, useId, useState } from "react";
import { createPortal } from "react-dom";
import { Settings, X } from "lucide-react";
import { CATEGORY_OPTIONS } from "../leadCategories";
import { BRAND_FILTER_OPTIONS, CALL_STATUS_OPTIONS } from "../callTracking";
import {
  DATE_PRESET_OPTIONS,
  YES_NO_ALL_OPTIONS,
  getFactoryFilterDefaults,
  loadFilterDefaults,
  saveFilterDefaults,
} from "../utils/filterDefaults";

function DatePresetFields({
  label,
  preset,
  customFrom,
  customTo,
  onPresetChange,
  onCustomFromChange,
  onCustomToChange,
}) {
  return (
    <div className="settings-field-group">
      <label className="filter-label">{label}</label>
      <select
        className="filter-select"
        value={preset}
        onChange={(e) => onPresetChange(e.target.value)}
      >
        {DATE_PRESET_OPTIONS.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
      {preset === "custom" && (
        <div className="settings-custom-dates">
          <label className="stats-date-field">
            <span>From</span>
            <input
              type="date"
              className="filter-select filter-date"
              value={customFrom}
              onChange={(e) => onCustomFromChange(e.target.value)}
            />
          </label>
          <label className="stats-date-field">
            <span>To</span>
            <input
              type="date"
              className="filter-select filter-date"
              value={customTo}
              onChange={(e) => onCustomToChange(e.target.value)}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div className="settings-field-group">
      <label className="filter-label">{label}</label>
      <select
        className="filter-select"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function FilterSettings({ onSaved, initialTab = "leads" }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState(initialTab);
  const [draft, setDraft] = useState(() => loadFilterDefaults());
  const [savedFlash, setSavedFlash] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;

    setDraft(loadFilterDefaults());
    setTab(initialTab);
    setSavedFlash(false);

    function handleKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, initialTab]);

  function updateLeads(patch) {
    setDraft((prev) => ({
      ...prev,
      leads: { ...prev.leads, ...patch },
    }));
  }

  function updateCalls(patch) {
    setDraft((prev) => ({
      ...prev,
      calls: { ...prev.calls, ...patch },
    }));
  }

  function handleSave() {
    const saved = saveFilterDefaults(draft);
    setDraft(saved);
    setSavedFlash(true);
    onSaved?.(saved);
    window.setTimeout(() => setSavedFlash(false), 1800);
  }

  function handleRestoreFactory() {
    setDraft(getFactoryFilterDefaults());
  }

  return (
    <>
      <button
        type="button"
        className="text-button"
        onClick={() => setOpen(true)}
        title="Default filter settings"
        aria-label="Open filter settings"
      >
        <Settings size={18} />
        Settings
      </button>

      {open &&
        createPortal(
          <div
            className="settings-overlay"
            onClick={(event) => {
              if (event.target === event.currentTarget) setOpen(false);
            }}
          >
            <div
              className="settings-modal"
              role="dialog"
              aria-modal="true"
              aria-labelledby={titleId}
            >
              <div className="settings-modal-header">
                <div>
                  <h2 id={titleId}>Default filters</h2>
                  <p className="settings-modal-subtitle">
                    Saved on this browser. Reset All on each page restores these
                    defaults.
                  </p>
                </div>
                <button
                  type="button"
                  className="icon-button"
                  onClick={() => setOpen(false)}
                  aria-label="Close settings"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="settings-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "leads"}
                  className={`settings-tab${tab === "leads" ? " active" : ""}`}
                  onClick={() => setTab("leads")}
                >
                  Leads
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={tab === "calls"}
                  className={`settings-tab${tab === "calls" ? " active" : ""}`}
                  onClick={() => setTab("calls")}
                >
                  Call Tracking
                </button>
              </div>

              <div className="settings-modal-body">
                {tab === "leads" ? (
                  <div className="settings-grid">
                    <SelectField
                      label="Category"
                      value={draft.leads.category}
                      onChange={(value) => updateLeads({ category: value })}
                      options={CATEGORY_OPTIONS}
                    />
                    <SelectField
                      label="Called"
                      value={draft.leads.called}
                      onChange={(value) => updateLeads({ called: value })}
                      options={YES_NO_ALL_OPTIONS}
                    />
                    <SelectField
                      label="No Answer"
                      value={draft.leads.attempted}
                      onChange={(value) => updateLeads({ attempted: value })}
                      options={YES_NO_ALL_OPTIONS}
                    />
                    <SelectField
                      label="Push ServiceM8"
                      value={draft.leads.pushed}
                      onChange={(value) => updateLeads({ pushed: value })}
                      options={YES_NO_ALL_OPTIONS}
                    />
                    <DatePresetFields
                      label="List date range"
                      preset={draft.leads.datePreset}
                      customFrom={draft.leads.customDateFrom}
                      customTo={draft.leads.customDateTo}
                      onPresetChange={(value) =>
                        updateLeads({ datePreset: value })
                      }
                      onCustomFromChange={(value) =>
                        updateLeads({ customDateFrom: value })
                      }
                      onCustomToChange={(value) =>
                        updateLeads({ customDateTo: value })
                      }
                    />
                    <DatePresetFields
                      label="Stats date range"
                      preset={draft.leads.statsDatePreset}
                      customFrom={draft.leads.statsCustomDateFrom}
                      customTo={draft.leads.statsCustomDateTo}
                      onPresetChange={(value) =>
                        updateLeads({ statsDatePreset: value })
                      }
                      onCustomFromChange={(value) =>
                        updateLeads({ statsCustomDateFrom: value })
                      }
                      onCustomToChange={(value) =>
                        updateLeads({ statsCustomDateTo: value })
                      }
                    />
                  </div>
                ) : (
                  <div className="settings-grid">
                    <SelectField
                      label="Status"
                      value={draft.calls.status}
                      onChange={(value) => updateCalls({ status: value })}
                      options={CALL_STATUS_OPTIONS}
                    />
                    <SelectField
                      label="Brand"
                      value={draft.calls.brand}
                      onChange={(value) => updateCalls({ brand: value })}
                      options={BRAND_FILTER_OPTIONS}
                    />
                    <SelectField
                      label="Followed Up"
                      value={draft.calls.followedUp}
                      onChange={(value) => updateCalls({ followedUp: value })}
                      options={YES_NO_ALL_OPTIONS}
                    />
                    <SelectField
                      label="New caller"
                      value={draft.calls.firstTime}
                      onChange={(value) => updateCalls({ firstTime: value })}
                      options={YES_NO_ALL_OPTIONS}
                    />
                    <DatePresetFields
                      label="List date range"
                      preset={draft.calls.datePreset}
                      customFrom={draft.calls.customDateFrom}
                      customTo={draft.calls.customDateTo}
                      onPresetChange={(value) =>
                        updateCalls({ datePreset: value })
                      }
                      onCustomFromChange={(value) =>
                        updateCalls({ customDateFrom: value })
                      }
                      onCustomToChange={(value) =>
                        updateCalls({ customDateTo: value })
                      }
                    />
                    <DatePresetFields
                      label="Stats date range"
                      preset={draft.calls.statsDatePreset}
                      customFrom={draft.calls.statsCustomDateFrom}
                      customTo={draft.calls.statsCustomDateTo}
                      onPresetChange={(value) =>
                        updateCalls({ statsDatePreset: value })
                      }
                      onCustomFromChange={(value) =>
                        updateCalls({ statsCustomDateFrom: value })
                      }
                      onCustomToChange={(value) =>
                        updateCalls({ statsCustomDateTo: value })
                      }
                    />
                  </div>
                )}
              </div>

              <div className="settings-modal-footer">
                <button
                  type="button"
                  className="text-button"
                  onClick={handleRestoreFactory}
                >
                  Restore factory defaults
                </button>
                <div className="settings-modal-footer-actions">
                  {savedFlash && (
                    <span className="settings-saved-flash">Saved</span>
                  )}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => setOpen(false)}
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    className="save-button settings-save-button"
                    onClick={handleSave}
                  >
                    Save defaults
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
