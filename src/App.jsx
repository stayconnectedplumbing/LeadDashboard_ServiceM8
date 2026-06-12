import { useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Check,
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
  Eye
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "./supabaseClient";

const SOURCES = [
  { id: "google", label: "Google" },
  { id: "facebook", label: "Facebook" },
  { id: "all", label: "All Sources" }
];

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
    booked: false,
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
    booked: true,
    notes: "Booked for Friday morning.",
    created_at: new Date(Date.now() - 3600000).toISOString()
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
    booked: false,
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
    booked: false,
    notes: "",
    ...lead
  };
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
    "Booked",
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
    lead.booked ? "Yes" : "No",
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
  const [error, setError] = useState("");
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [calledFilter, setCalledFilter] = useState("all");
  const [attemptedFilter, setAttemptedFilter] = useState("all");
  const [bookedFilter, setBookedFilter] = useState("all");
  
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
      
      // Booked filter
      const matchesBooked = bookedFilter === "all" || 
        (bookedFilter === "yes" && lead.booked) || 
        (bookedFilter === "no" && !lead.booked);
      
      return matchesSearch && matchesSource && matchesCalled && matchesAttempted && matchesBooked;
    });
  }, [leads, searchQuery, sourceFilter, calledFilter, attemptedFilter, bookedFilter]);

  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const booked = filteredLeads.filter(l => l.booked).length;
    const needsCall = filteredLeads.filter(l => !l.booked && !l.call_attempted).length;
    const called = filteredLeads.filter(l => l.called).length;
    
    return { total, booked, needsCall, called };
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
    setBookedFilter("all");
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
            <p className="stat-label">Booked</p>
            <p className="stat-value">{stats.booked}</p>
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
              {SOURCES.map(source => (
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
            <label className="filter-label">Booked</label>
            <select 
              value={bookedFilter} 
              onChange={(e) => setBookedFilter(e.target.value)}
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
          <strong>supabase/seed.sql</strong> in the Supabase SQL editor, or wait
          for n8n to import leads from Gmail and Facebook.
        </p>
      )}

      {error && <p className="error">Supabase error: {error}</p>}

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
                <th>Booked</th>
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
                  <>
                    <tr key={lead.id} className={lead.booked ? "booked" : ""}>
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
                          {lead.source === "google" ? <Mail size={14} /> : <UserRound size={14} />}
                          {lead.source.charAt(0).toUpperCase() + lead.source.slice(1)}
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
                      <td>
                        <label className="toggle-label">
                          <input
                            type="checkbox"
                            checked={lead.booked}
                            onChange={(e) => updateLead(lead.id, { booked: e.target.checked })}
                          />
                          <span className="toggle-custom"></span>
                        </label>
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
                  </>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
