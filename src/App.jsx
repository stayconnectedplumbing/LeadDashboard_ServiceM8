import { Fragment, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Globe,
  ClipboardList,
  Loader2,
  Mail,
  Phone,
  RefreshCcw,
  Save,
  Search,
  UserRound,
  Filter,
  ChevronDown,
  ChevronUp,
  X,
  Download,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
  Eye,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./supabaseClient";
import {
  isInServiceM8Iframe,
  normalizePushResult,
  pushLeadViaServiceM8Bridge,
} from "./servicem8Push";

const SOURCE_LABELS = {
  google: "Google",
  google_form: "Google Form",
  facebook: "Facebook",
  wordpress: "WordPress",
  stay_connected_plumbing: "Stay Connected",
  same_day_home_services: "Same Day Home",
  same_day_shower_repairs: "Same Day Shower",
  emergency_plumbing_sydney: "Emergency Plumbing",
};

function formatSourceLabel(source) {
  if (SOURCE_LABELS[source]) return SOURCE_LABELS[source];
  return source
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

function SourceIcon({ source }) {
  if (source === "google" || source === "google_form") return <Mail size={14} />;
  if (source === "wordpress") return <Globe size={14} />;
  if (source === "facebook") return <UserRound size={14} />;
  return <ClipboardList size={14} />;
}

const DEMO_LEADS = [
  {
    id: "demo-google-1",
    source: "google",
    full_name: "Sarah Mitchell",
    phone: "0400 123 456",
    email: "sarah@example.com",
    service_requested: "End of lease clean",
    message: "Looking for availability next Tuesday.",
    called: false,
    call_attempted: false,
    notes: "",
    created_at: new Date().toISOString()
  },
  {
    id: "demo-facebook-1",
    source: "facebook",
    full_name: "James Carter",
    phone: "0411 987 654",
    email: "james@example.com",
    service_requested: "Commercial quote",
    message: "Needs call after 3pm.",
    called: true,
    call_attempted: true,
    servicem8_job_uuid: "demo-job-uuid",
    servicem8_pushed_at: new Date().toISOString(),
    notes: "Pushed to ServiceM8 for Friday morning.",
    created_at: new Date(Date.now() - 3600000).toISOString()
  },
  {
    id: "demo-wordpress-1",
    source: "wordpress",
    full_name: "Michael Chen",
    phone: "0433 555 666",
    email: "michael@example.com",
    service_requested: "Blocked drain",
    message: "Submitted via website contact form.",
    called: false,
    call_attempted: false,
    notes: "",
    created_at: new Date(Date.now() - 1800000).toISOString()
  },
  {
    id: "demo-google-2",
    source: "google",
    full_name: "Emma Wilson",
    phone: "0422 333 444",
    email: "emma@test.com",
    service_requested: "Regular house cleaning",
    message: "Weekly service preferred.",
    called: false,
    call_attempted: true,
    notes: "",
    created_at: new Date(Date.now() - 7200000).toISOString()
  }
];

function formatDate(value) {
  return new Intl.DateTimeFormat("en-AU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function normalizeLead(lead) {
  return {
    called: false,
    call_attempted: false,
    servicem8_job_uuid: null,
    servicem8_pushed_at: null,
    notes: "",
    ...lead,
  };
}

function isPushedToServiceM8(lead) {
  return Boolean(lead.servicem8_job_uuid);
}

function serviceM8JobUrl(jobUuid) {
  return `https://go.servicem8.com/openjob/${jobUuid}`;
}

function downloadCSV(leads) {
  const headers = [
    "ID",
    "Source",
    "Name",
    "Phone",
    "Email",
    "Service",
    "Message",
    "Called",
    "Attempted",
    "ServiceM8",
    "Notes",
    "Created At"
  ];
  const rows = leads.map(lead => [
    lead.id,
    lead.source,
    lead.full_name || "",
    lead.phone || "",
    lead.email || "",
    lead.service_requested || "",
    lead.message || "",
    lead.called ? "Yes" : "No",
    lead.call_attempted ? "Yes" : "No",
    isPushedToServiceM8(lead) ? "Yes" : "No",
    lead.notes || "",
    formatDate(lead.created_at)
  ]);
  
  const csvContent = [
    headers.join(","),
    ...rows.map(row => row.map(field => `"${String(field).replace(/"/g, '""')}"`).join(","))
  ].join("\n");
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `leads-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function App() {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [pushingId, setPushingId] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [pushErrors, setPushErrors] = useState({});
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [calledFilter, setCalledFilter] = useState("all");
  const [attemptedFilter, setAttemptedFilter] = useState("all");
  const [pushedFilter, setPushedFilter] = useState("all");
  
  // Expanded rows for notes
  const [expandedRows, setExpandedRows] = useState({});
  
  // Local note edits per row
  const [localNotes, setLocalNotes] = useState({});

  async function loadLeads() {
    setError("");
    setLoading(true);

    if (!hasSupabaseConfig) {
      setLeads(DEMO_LEADS.map(normalizeLead));
      setLoading(false);
      return;
    }

    const { data, error: loadError } = await supabase
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
    } else {
      setLeads((data || []).map(normalizeLead));
    }

    setLoading(false);
  }

  useEffect(() => {
    loadLeads();
  }, []);

  useEffect(() => {
    if (!toast) return undefined;

    const timer = window.setTimeout(() => setToast(null), 10000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;

    const channel = supabase
      .channel("lead-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "leads" },
        () => loadLeads()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Initialize local notes when leads load
  useEffect(() => {
    const notes = {};
    leads.forEach(lead => {
      notes[lead.id] = lead.notes || "";
    });
    setLocalNotes(notes);
  }, [leads]);

  const sourceOptions = useMemo(() => {
    const ids = [...new Set(leads.map((lead) => lead.source))].sort();
    return [
      { id: "all", label: "All Sources" },
      ...ids.map((id) => ({ id, label: formatSourceLabel(id) })),
    ];
  }, [leads]);

  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Search query filter
      const matchesSearch = !searchQuery.trim() || 
        [
          lead.full_name,
          lead.phone,
          lead.email,
          lead.service_requested,
          lead.message,
          lead.notes
        ].filter(Boolean).some(value => 
          value.toLowerCase().includes(searchQuery.trim().toLowerCase())
        );
      
      // Source filter
      const matchesSource = sourceFilter === "all" || lead.source === sourceFilter;
      
      // Called filter
      const matchesCalled = calledFilter === "all" || 
        (calledFilter === "yes" && lead.called) || 
        (calledFilter === "no" && !lead.called);
      
      // Attempted filter
      const matchesAttempted = attemptedFilter === "all" || 
        (attemptedFilter === "yes" && lead.call_attempted) || 
        (attemptedFilter === "no" && !lead.call_attempted);
      
      const matchesPushed = pushedFilter === "all" ||
        (pushedFilter === "yes" && isPushedToServiceM8(lead)) ||
        (pushedFilter === "no" && !isPushedToServiceM8(lead));

      return matchesSearch && matchesSource && matchesCalled && matchesAttempted && matchesPushed;
    });
  }, [leads, searchQuery, sourceFilter, calledFilter, attemptedFilter, pushedFilter]);

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const pushed = filteredLeads.filter(isPushedToServiceM8).length;
    const needsCall = filteredLeads.filter(l => !isPushedToServiceM8(l) && !l.call_attempted).length;
    const called = filteredLeads.filter(l => l.called).length;

    return { total, pushed, needsCall, called };
  }, [filteredLeads]);

  async function updateLead(id, patch) {
    setSavingId(id);
    setError("");
    
    // Optimistic update
    setLeads(prev => 
      prev.map(lead => lead.id === id ? { ...lead, ...patch } : lead)
    );

    if (hasSupabaseConfig) {
      const { error: updateError } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", id);

      if (updateError) {
        setError(updateError.message);
        await loadLeads(); // Revert on error
      }
    }

    setSavingId(null);
  }

  async function pushToServiceM8(lead) {
    if (isPushedToServiceM8(lead)) return;

    setPushingId(lead.id);
    setError("");
    setPushErrors(prev => {
      const next = { ...prev };
      delete next[lead.id];
      return next;
    });

    try {
      let result;

      if (!hasSupabaseConfig) {
        result = {
          ok: true,
          job_uuid: `demo-${lead.id}`,
          job_url: serviceM8JobUrl(`demo-${lead.id}`),
        };
      } else if (isInServiceM8Iframe()) {
        result = await pushLeadViaServiceM8Bridge(lead);
      } else {
        const { data, error: invokeError } = await supabase.functions.invoke(
          "push-servicem8",
          { body: { lead_id: lead.id } },
        );

        if (invokeError) {
          throw new Error(invokeError.message);
        }
        result = normalizePushResult(data);
      }

      const jobUuid = result.job_uuid;
      const jobUrl = result.job_url || serviceM8JobUrl(jobUuid);
      const patch = {
        servicem8_job_uuid: jobUuid,
        servicem8_pushed_at: new Date().toISOString(),
      };

      setLeads(prev =>
        prev.map(item => item.id === lead.id ? { ...item, ...patch } : item),
      );

      if (hasSupabaseConfig && isInServiceM8Iframe()) {
        const { error: updateError } = await supabase
          .from("leads")
          .update(patch)
          .eq("id", lead.id);

        if (updateError) {
          setToast({
            type: "warning",
            title: "Job created, but link not saved",
            message: `The ServiceM8 job was created, but saving the link failed: ${updateError.message}`,
            jobUrl,
          });
          await loadLeads();
          return;
        }
      }

      setToast({
        type: "success",
        title: result.already_pushed ? "Already in ServiceM8" : "Job created",
        message: result.already_pushed
          ? `${lead.full_name || "Lead"} already has a ServiceM8 job.`
          : `${lead.full_name || "Lead"} was pushed to ServiceM8 as a Quote job.`,
        jobUrl,
      });
    } catch (pushError) {
      const message = pushError instanceof Error ? pushError.message : String(pushError);
      setPushErrors(prev => ({ ...prev, [lead.id]: message }));
      setToast({
        type: "error",
        title: "Push failed",
        message,
      });
    } finally {
      setPushingId(null);
    }
  }

  function toggleExpand(id) {
    setExpandedRows(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  }

  function handleNoteChange(id, value) {
    setLocalNotes(prev => ({
      ...prev,
      [id]: value
    }));
  }

  function resetFilters() {
    setSearchQuery("");
    setSourceFilter("all");
    setCalledFilter("all");
    setAttemptedFilter("all");
    setPushedFilter("all");
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ServiceM8</p>
          <h1>Lead Management Dashboard</h1>
        </div>
        <div className="topbar-actions">
          {filteredLeads.length > 0 && (
            <button 
              className="text-button"
              onClick={() => downloadCSV(filteredLeads)}
              type="button"
            >
              <Download size={18} />
              Export CSV
            </button>
          )}
          <button 
            className="icon-button" 
            onClick={loadLeads} 
            aria-label="Refresh leads"
            disabled={loading}
          >
            {loading ? <Loader2 className="spin" /> : <RefreshCcw />}
          </button>
        </div>
      </header>

      {/* Stats Cards */}
      <section className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon blue">
            <ClipboardList size={24} />
          </div>
          <div>
            <p className="stat-label">Total Leads</p>
            <p className="stat-value">{stats.total}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon red">
            <Phone size={24} />
          </div>
          <div>
            <p className="stat-label">Needs Call</p>
            <p className="stat-value">{stats.needsCall}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon purple">
            <Phone size={24} />
          </div>
          <div>
            <p className="stat-label">Called</p>
            <p className="stat-value">{stats.called}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <CalendarCheck size={24} />
          </div>
          <div>
            <p className="stat-label">In ServiceM8</p>
            <p className="stat-value">{stats.pushed}</p>
          </div>
        </div>
      </section>

      {/* Filters */}
      <section className="filters-section">
        <div className="filters-header">
          <div className="filters-title">
            <Filter size={20} />
            <h2>Filters</h2>
          </div>
          <button 
            className="text-button"
            onClick={resetFilters}
            type="button"
          >
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
                placeholder="Search by name, phone, email, service, message..."
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
            <label className="filter-label">Source</label>
            <select 
              value={sourceFilter} 
              onChange={(e) => setSourceFilter(e.target.value)}
              className="filter-select"
            >
              {sourceOptions.map(source => (
                <option key={source.id} value={source.id}>{source.label}</option>
              ))}
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Called</label>
            <select 
              value={calledFilter} 
              onChange={(e) => setCalledFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">Call Attempted</label>
            <select 
              value={attemptedFilter} 
              onChange={(e) => setAttemptedFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          <div className="filter-group">
            <label className="filter-label">In ServiceM8</label>
            <select
              value={pushedFilter}
              onChange={(e) => setPushedFilter(e.target.value)}
              className="filter-select"
            >
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
      </section>

      {!hasSupabaseConfig && (
        <p className="notice">
          Demo mode is active. Add Supabase values to .env to connect live leads.
        </p>
      )}

      {hasSupabaseConfig && !loading && filteredLeads.length === 0 && leads.length > 0 && (
        <p className="notice">
          No leads match your current filters.
        </p>
      )}

      {hasSupabaseConfig && !loading && leads.length === 0 && (
        <p className="notice">
          Connected to Supabase, but no leads found yet. Run{" "}
          <strong>supabase/seed.sql</strong> in the Supabase SQL editor, or submit
          a test form via the WordPress webhook (see <strong>wordpress/WEBHOOK.md</strong>).
        </p>
      )}

      {error && <p className="error">Supabase error: {error}</p>}

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          <div className="toast-icon">
            {toast.type === "success" ? (
              <CheckCircle2 size={20} />
            ) : (
              <CircleAlert size={20} />
            )}
          </div>
          <div className="toast-body">
            <strong>{toast.title}</strong>
            <p>{toast.message}</p>
            {toast.jobUrl && (
              <a
                href={toast.jobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="toast-link"
              >
                <ExternalLink size={14} />
                Open job in ServiceM8
              </a>
            )}
          </div>
          <button
            className="toast-close"
            type="button"
            aria-label="Dismiss"
            onClick={() => setToast(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Leads Table */}
      <section className="table-container">
        <div className="table-wrapper">
          <table className="leads-table">
            <thead>
              <tr>
                <th></th>
                <th>Source</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Service</th>
                <th>Called</th>
                <th>Attempted</th>
                <th>ServiceM8</th>
                <th>Created</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="11" className="table-loading">
                    <Loader2 className="spin" />
                    Loading leads...
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan="11" className="table-empty">
                    No leads found
                  </td>
                </tr>
              ) : (
                filteredLeads.map(lead => (
                  <Fragment key={lead.id}>
                    <tr className={isPushedToServiceM8(lead) ? "pushed" : ""}>
                      <td className="expand-cell">
                        <button 
                          className="expand-btn"
                          onClick={() => toggleExpand(lead.id)}
                          type="button"
                        >
                          {expandedRows[lead.id] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                        </button>
                      </td>
                      <td>
                        <span className={`source-badge ${lead.source}`}>
                          <SourceIcon source={lead.source} />
                          {formatSourceLabel(lead.source)}
                        </span>
                      </td>
                      <td className="name-cell">
                        <strong>{lead.full_name || "Unnamed"}</strong>
                      </td>
                      <td>
                        {lead.phone ? (
                          <a href={`tel:${lead.phone}`} className="link">
                            {lead.phone}
                          </a>
                        ) : "-"}
                      </td>
                      <td>
                        {lead.email ? (
                          <a href={`mailto:${lead.email}`} className="link">
                            {lead.email}
                          </a>
                        ) : "-"}
                      </td>
                      <td className="service-cell">
                        {lead.service_requested || "-"}
                      </td>
                      <td>
                        <label className="toggle-label">
                          <input
                            type="checkbox"
                            checked={lead.called}
                            onChange={(e) => updateLead(lead.id, { called: e.target.checked })}
                          />
                          <span className="toggle-custom"></span>
                        </label>
                      </td>
                      <td>
                        <label className="toggle-label">
                          <input
                            type="checkbox"
                            checked={lead.call_attempted}
                            onChange={(e) => updateLead(lead.id, { call_attempted: e.target.checked })}
                          />
                          <span className="toggle-custom"></span>
                        </label>
                      </td>
                      <td className="servicem8-cell">
                        {isPushedToServiceM8(lead) ? (
                          <div className="push-status push-status-success">
                            <span className="push-status-label">
                              <CheckCircle2 size={14} />
                              Job created
                            </span>
                            <a
                              href={serviceM8JobUrl(lead.servicem8_job_uuid)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="link pushed-link"
                            >
                              <ExternalLink size={14} />
                              View job
                            </a>
                          </div>
                        ) : (
                          <div className="push-status">
                            <button
                              className="push-button"
                              type="button"
                              onClick={() => pushToServiceM8(lead)}
                              disabled={pushingId === lead.id}
                            >
                              {pushingId === lead.id ? (
                                <>
                                  <Loader2 className="spin" size={14} />
                                  Creating job…
                                </>
                              ) : (
                                "Push ServiceM8"
                              )}
                            </button>
                            {pushErrors[lead.id] && (
                              <p className="push-status-error">{pushErrors[lead.id]}</p>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="date-cell">
                        {formatDate(lead.created_at)}
                      </td>
                      <td className="action-cell">
                        <button 
                          className="expand-btn"
                          onClick={() => toggleExpand(lead.id)}
                          type="button"
                          title="View details"
                        >
                          <Eye size={16} />
                        </button>
                      </td>
                    </tr>
                    {expandedRows[lead.id] && (
                      <tr className="expanded-row">
                        <td colSpan="11">
                          <div className="expanded-content">
                            {lead.message && (
                              <div className="expanded-section">
                                <h4>Message</h4>
                                <p className="lead-message">{lead.message}</p>
                              </div>
                            )}
                            <div className="expanded-section">
                              <h4>Notes</h4>
                              <div className="notes-field">
                                <textarea
                                  value={localNotes[lead.id] || ""}
                                  onChange={(e) => handleNoteChange(lead.id, e.target.value)}
                                  onBlur={() => {
                                    if (localNotes[lead.id] !== lead.notes) {
                                      updateLead(lead.id, { notes: localNotes[lead.id] || "" });
                                    }
                                  }}
                                  rows={4}
                                  placeholder="Add notes here..."
                                />
                                <button
                                  className="save-button"
                                  type="button"
                                  onClick={() => updateLead(lead.id, { notes: localNotes[lead.id] || "" })}
                                  disabled={savingId === lead.id}
                                >
                                  {savingId === lead.id ? <Loader2 className="spin" /> : <Save size={16} />}
                                  {savingId === lead.id ? "Saving" : "Save Notes"}
                                </button>
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
