import { Fragment, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Download,
  Eye,
  Filter,
  Headphones,
  Loader2,
  Phone,
  PhoneIncoming,
  PhoneMissed,
  RefreshCcw,
  Save,
  Search,
  Timer,
  UserPlus,
  X,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "../supabaseClient";
import {
  BRAND_FILTER_OPTIONS,
  CALL_STATUS_OPTIONS,
  DEMO_PHONE_CALLS,
  downloadCallsCSV,
  formatCallStatus,
  normalizePhoneCall,
  statusBadgeClass,
} from "../callTracking";
import { formatDate, formatDuration } from "../utils/format";
import { endOfSydneyDay, isTodayInSydney, startOfSydneyDay } from "../utils/time";

function getCallTime(call) {
  return call.call_started_at || call.created_at;
}

export function CallTrackingView() {
  const [calls, setCalls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [brandFilter, setBrandFilter] = useState("all");
  const [followedUpFilter, setFollowedUpFilter] = useState("all");
  const [firstTimeFilter, setFirstTimeFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expandedRows, setExpandedRows] = useState({});
  const [localNotes, setLocalNotes] = useState({});

  async function loadCalls() {
    setError("");
    setLoading(true);

    if (!hasSupabaseConfig) {
      setCalls(DEMO_PHONE_CALLS.map(normalizePhoneCall));
      setLoading(false);
      return;
    }

    const { data, error: loadError } = await supabase
      .from("phone_calls")
      .select("*")
      .order("call_started_at", { ascending: false, nullsFirst: false });

    if (loadError) {
      setError(loadError.message);
    } else {
      setCalls((data || []).map(normalizePhoneCall));
    }

    setLoading(false);
  }

  useEffect(() => {
    loadCalls();
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;

    const channel = supabase
      .channel("call-tracking")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "phone_calls" },
        () => loadCalls(),
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const notes = {};
    calls.forEach((call) => {
      notes[call.id] = call.notes || "";
    });
    setLocalNotes(notes);
  }, [calls]);

  const filteredCalls = useMemo(() => {
    return calls.filter((call) => {
      const matchesSearch =
        !searchQuery.trim() ||
        [
          call.caller_phone,
          call.tracking_source,
          call.tracking_number,
          call.brand,
          call.caller_area,
          call.notes,
          call.web_source,
          call.web_medium,
        ]
          .filter(Boolean)
          .some((value) =>
            value.toLowerCase().includes(searchQuery.trim().toLowerCase()),
          );

      const matchesStatus =
        statusFilter === "all" || call.call_status === statusFilter;
      const matchesBrand =
        brandFilter === "all" || call.brand === brandFilter;
      const matchesFollowedUp =
        followedUpFilter === "all" ||
        (followedUpFilter === "yes" && call.followed_up) ||
        (followedUpFilter === "no" && !call.followed_up);
      const matchesFirstTime =
        firstTimeFilter === "all" ||
        (firstTimeFilter === "yes" && call.first_time_caller) ||
        (firstTimeFilter === "no" && call.first_time_caller === false);

      const callDate = new Date(getCallTime(call));
      const matchesDateFrom =
        !dateFrom || callDate >= startOfSydneyDay(dateFrom);
      const matchesDateTo =
        !dateTo || callDate <= endOfSydneyDay(dateTo);

      return (
        matchesSearch &&
        matchesStatus &&
        matchesBrand &&
        matchesFollowedUp &&
        matchesFirstTime &&
        matchesDateFrom &&
        matchesDateTo
      );
    });
  }, [
    calls,
    searchQuery,
    statusFilter,
    brandFilter,
    followedUpFilter,
    firstTimeFilter,
    dateFrom,
    dateTo,
  ]);

  const stats = useMemo(() => {
    const todayCalls = filteredCalls.filter((call) =>
      isTodayInSydney(getCallTime(call)),
    );
    const answered = filteredCalls.filter(
      (call) => call.call_status === "answered",
    ).length;
    const missed = filteredCalls.filter(
      (call) => call.call_status === "missed",
    ).length;
    const newCallers = filteredCalls.filter(
      (call) => call.first_time_caller,
    ).length;
    const needsFollowUp = filteredCalls.filter(
      (call) => !call.followed_up && call.call_status !== "answered",
    ).length;

    const durations = filteredCalls
      .map((call) => call.duration_seconds)
      .filter((value) => typeof value === "number" && value > 0);
    const avgDuration = durations.length
      ? Math.round(
          durations.reduce((sum, value) => sum + value, 0) / durations.length,
        )
      : 0;

    return {
      today: todayCalls.length,
      answered,
      missed,
      newCallers,
      needsFollowUp,
      avgDuration,
    };
  }, [filteredCalls]);

  async function updateCall(id, patch) {
    setSavingId(id);
    setError("");
    setCalls((prev) =>
      prev.map((call) => (call.id === id ? { ...call, ...patch } : call)),
    );

    if (hasSupabaseConfig) {
      const { error: updateError } = await supabase
        .from("phone_calls")
        .update(patch)
        .eq("id", id);

      if (updateError) {
        setError(updateError.message);
        await loadCalls();
      }
    }

    setSavingId(null);
  }

  function toggleExpand(id) {
    setExpandedRows((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  }

  function handleNoteChange(id, value) {
    setLocalNotes((prev) => ({
      ...prev,
      [id]: value,
    }));
  }

  function resetFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setBrandFilter("all");
    setFollowedUpFilter("all");
    setFirstTimeFilter("all");
    setDateFrom("");
    setDateTo("");
  }

  return (
    <div className="page-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">WildJar</p>
          <h1>Call Tracking</h1>
        </div>
        <div className="topbar-actions">
          {filteredCalls.length > 0 && (
            <button
              className="text-button"
              onClick={() =>
                downloadCallsCSV(
                  filteredCalls,
                  formatDate,
                  formatDuration,
                  formatCallStatus,
                )
              }
              type="button"
            >
              <Download size={18} />
              Export CSV
            </button>
          )}
          <button
            className="icon-button"
            onClick={loadCalls}
            aria-label="Refresh calls"
            disabled={loading}
          >
            {loading ? <Loader2 className="spin" /> : <RefreshCcw />}
          </button>
        </div>
      </header>

      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <PhoneIncoming size={24} />
          </div>
          <div>
            <p className="stat-label">Calls Today</p>
            <p className="stat-value">{stats.today}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <Phone size={24} />
          </div>
          <div>
            <p className="stat-label">Answered</p>
            <p className="stat-value">{stats.answered}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">
            <PhoneMissed size={24} />
          </div>
          <div>
            <p className="stat-label">Missed</p>
            <p className="stat-value">{stats.missed}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">
            <UserPlus size={24} />
          </div>
          <div>
            <p className="stat-label">New Callers</p>
            <p className="stat-value">{stats.newCallers}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon amber">
            <Timer size={24} />
          </div>
          <div>
            <p className="stat-label">Avg Duration</p>
            <p className="stat-value">{formatDuration(stats.avgDuration)}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">
            <Headphones size={24} />
          </div>
          <div>
            <p className="stat-label">Needs Follow-up</p>
            <p className="stat-value">{stats.needsFollowUp}</p>
          </div>
        </div>
      </section>

      <section className="filters-section">
        <div className="filters-header">
          <div className="filters-title">
            <Filter size={20} />
            <h2>Filters</h2>
          </div>
          <button className="text-button" onClick={resetFilters} type="button">
            Reset All
          </button>
        </div>

        <div className="filters-grid">
          <div className="filter-group full-width">
            <label className="filter-label">Search</label>
            <div className="search-box">
              <Search size={18} />
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by caller, area, tracking source, brand..."
              />
              {searchQuery && (
                <button
                  className="clear-search"
                  onClick={() => setSearchQuery("")}
                  type="button"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>

          <div className="filter-group">
            <label className="filter-label">Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="filter-select"
            >
              {CALL_STATUS_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Brand</label>
            <select
              value={brandFilter}
              onChange={(e) => setBrandFilter(e.target.value)}
              className="filter-select"
            >
              {BRAND_FILTER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Followed Up</label>
            <select
              value={followedUpFilter}
              onChange={(e) => setFollowedUpFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">First Time Caller</label>
            <select
              value={firstTimeFilter}
              onChange={(e) => setFirstTimeFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">From date</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="filter-select filter-date"
            />
          </div>

          <div className="filter-group">
            <label className="filter-label">To date</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="filter-select filter-date"
            />
          </div>
        </div>
      </section>

      {!hasSupabaseConfig && (
        <p className="notice">
          Demo mode — sample WildJar calls shown. Connect Supabase and configure
          the webhook (see <strong>wildjar/WEBHOOK.md</strong>).
        </p>
      )}

      {hasSupabaseConfig && !loading && filteredCalls.length === 0 && calls.length > 0 && (
        <p className="notice">No calls match your current filters.</p>
      )}

      {hasSupabaseConfig && !loading && calls.length === 0 && (
        <p className="notice">
          No phone calls yet. Point WildJar webhooks to the Supabase Edge Function
          (see <strong>wildjar/WEBHOOK.md</strong>) and send a test call.
        </p>
      )}

      {error && <p className="error">Supabase error: {error}</p>}

      <section className="table-container">
        <div className="table-wrapper">
          <table className="leads-table">
            <thead>
              <tr>
                <th></th>
                <th>Caller</th>
                <th>Brand</th>
                <th>Tracking Source</th>
                <th>Status</th>
                <th>Duration</th>
                <th>New?</th>
                <th>Followed Up</th>
                <th>Talk Time</th>
                <th>Call Time</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" className="table-loading">
                    <Loader2 className="spin" />
                    Loading calls...
                  </td>
                </tr>
              ) : filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan="11" className="table-empty">
                    No calls found
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => {
                  const needsAttention =
                    !call.followed_up && call.call_status !== "answered";

                  return (
                    <Fragment key={call.id}>
                      <tr className={needsAttention ? "call-needs-followup" : ""}>
                        <td className="expand-cell">
                          <button
                            className="expand-btn"
                            onClick={() => toggleExpand(call.id)}
                            type="button"
                          >
                            {expandedRows[call.id] ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </button>
                        </td>
                        <td className="name-cell">
                          <strong>{call.caller_phone || "Unknown"}</strong>
                          {call.caller_area && (
                            <p className="cell-subtext">{call.caller_area}</p>
                          )}
                        </td>
                        <td>{call.brand || call.account_name || "—"}</td>
                        <td className="service-cell">
                          {call.tracking_source || "—"}
                        </td>
                        <td>
                          <span
                            className={`call-status-badge ${statusBadgeClass(call.call_status)}`}
                          >
                            {formatCallStatus(call.call_status)}
                          </span>
                        </td>
                        <td>{formatDuration(call.duration_seconds)}</td>
                        <td>
                          {call.first_time_caller === true
                            ? "Yes"
                            : call.first_time_caller === false
                              ? "No"
                              : "—"}
                        </td>
                        <td>
                          <label className="toggle-label">
                            <input
                              type="checkbox"
                              checked={call.followed_up}
                              onChange={(e) =>
                                updateCall(call.id, {
                                  followed_up: e.target.checked,
                                })
                              }
                            />
                            <span className="toggle-custom"></span>
                          </label>
                        </td>
                        <td>{formatDuration(call.talk_time_seconds)}</td>
                        <td className="date-cell">
                          {formatDate(getCallTime(call))}
                        </td>
                        <td className="action-cell">
                          <button
                            className="expand-btn"
                            onClick={() => toggleExpand(call.id)}
                            type="button"
                            title="View details"
                          >
                            <Eye size={16} />
                          </button>
                        </td>
                      </tr>
                      {expandedRows[call.id] && (
                        <tr className="expanded-row">
                          <td colSpan="11">
                            <div className="expanded-content call-detail-grid">
                              <div className="expanded-section">
                                <h4>Call details</h4>
                                <dl className="detail-list">
                                  <div>
                                    <dt>Tracking number</dt>
                                    <dd>{call.tracking_number || "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>IVR option</dt>
                                    <dd>{call.ivr_option || "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>WildJar call ID</dt>
                                    <dd>{call.wildjar_call_id}</dd>
                                  </div>
                                </dl>
                              </div>

                              <div className="expanded-section">
                                <h4>Marketing attribution</h4>
                                <dl className="detail-list">
                                  <div>
                                    <dt>Web source</dt>
                                    <dd>{call.web_source || "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>Web medium</dt>
                                    <dd>{call.web_medium || "—"}</dd>
                                  </div>
                                  <div>
                                    <dt>Account</dt>
                                    <dd>{call.account_name || "—"}</dd>
                                  </div>
                                </dl>
                              </div>

                              <div className="expanded-section full-width">
                                <h4>Notes</h4>
                                <div className="notes-field">
                                  <textarea
                                    value={localNotes[call.id] || ""}
                                    onChange={(e) =>
                                      handleNoteChange(call.id, e.target.value)
                                    }
                                    onBlur={() => {
                                      if (localNotes[call.id] !== call.notes) {
                                        updateCall(call.id, {
                                          notes: localNotes[call.id] || "",
                                        });
                                      }
                                    }}
                                    rows={4}
                                    placeholder="Add follow-up notes..."
                                  />
                                  <button
                                    className="save-button"
                                    type="button"
                                    onClick={() =>
                                      updateCall(call.id, {
                                        notes: localNotes[call.id] || "",
                                      })
                                    }
                                    disabled={savingId === call.id}
                                  >
                                    {savingId === call.id ? (
                                      <Loader2 className="spin" />
                                    ) : (
                                      <Save size={16} />
                                    )}
                                    {savingId === call.id ? "Saving" : "Save Notes"}
                                  </button>
                                </div>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
