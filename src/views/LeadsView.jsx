import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarCheck,
  Clock,
  Globe,
  ClipboardList,
  Loader2,
  Phone,
  RefreshCcw,
  Save,
  Search,
  Trash2,
  UserRound,
  Filter,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  X,
  Download,
  Bell,
  CheckCircle2,
  CircleAlert,
  ExternalLink,
} from "lucide-react";
import { hasSupabaseConfig, supabase } from "../supabaseClient";
import {
  isInServiceM8Iframe,
  normalizePushResult,
  pushLeadViaServiceM8Bridge,
  reconcileLeadServiceM8Link,
  reconcileUnlinkedLeads,
  syncServiceM8Link,
} from "../servicem8Push";
import {
  CATEGORY_OPTIONS,
  formatCategoryLabel,
  getLastLeadAgeByCategory,
  getLeadReceivedAt,
  resolveLeadCategory,
} from "../leadCategories";
import { formatDate } from "../utils/format";
import { formatLeadFormAnswers } from "../utils/leadFormAnswers";
import { formatServiceM8Error } from "../utils/servicem8Error";
import { StatsDateFilters } from "../components/StatsDateFilters";
import { isInSydneyDateRange, todayInSydney } from "../utils/time";

function CategoryIcon({ category }) {
  if (category === "facebook") return <UserRound size={14} />;
  if (category === "stay_connected_plumbing") return <Globe size={14} />;
  return <ClipboardList size={14} />;
}

const DEMO_LEADS = [
  {
    id: "demo-same-day-1",
    source: "same_day_home_services",
    full_name: "Sarah Mitchell",
    phone: "0400 123 456",
    email: "sarah@example.com",
    service_requested: "Blocked drain",
    message: "Emergency call out needed.",
    called: false,
    call_attempted: false,
    notes: "",
    raw_payload: { current_url: "https://emergencyplumbingrepairs.com.au/" },
    created_at: new Date().toISOString(),
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
    created_at: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "demo-stay-connected-1",
    source: "stay_connected_plumbing",
    full_name: "Michael Chen",
    phone: "0433 555 666",
    email: "michael@example.com",
    service_requested: "Hot water repair",
    message: "Submitted via website contact form.",
    called: false,
    call_attempted: false,
    notes: "",
    raw_payload: { current_url: "https://stayconnectedplumbing.com.au/" },
    created_at: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: "demo-same-day-2",
    source: "same_day_shower_repairs",
    full_name: "Emma Wilson",
    phone: "0422 333 444",
    email: "emma@test.com",
    service_requested: "Shower repair",
    message: "Weekly service preferred.",
    called: false,
    call_attempted: true,
    notes: "",
    raw_payload: { current_url: "https://samedayshowerrepairs.com.au/" },
    created_at: new Date(Date.now() - 7200000).toISOString(),
  },
];

const PAGE_SIZE_OPTIONS = [50, 100, 150, 200];

function normalizeLead(lead) {
  let rawPayload = lead.raw_payload;
  if (typeof rawPayload === "string") {
    try {
      rawPayload = JSON.parse(rawPayload);
    } catch {
      rawPayload = lead.raw_payload;
    }
  }

  return {
    called: false,
    call_attempted: false,
    servicem8_job_uuid: null,
    servicem8_pushed_at: null,
    notes: "",
    hidden: false,
    ...lead,
    raw_payload: rawPayload,
  };
}

function isLeadHidden(lead) {
  return Boolean(lead?.hidden);
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
    "Category",
    "Name",
    "Phone",
    "Email",
    "Service",
    "Message",
    "Called",
    "No Answer",
    "Push ServiceM8",
    "Notes",
    "Received At",
  ];
  const rows = leads.map((lead) => [
    lead.id,
    formatCategoryLabel(lead.source, lead.raw_payload),
    lead.full_name || "",
    lead.phone || "",
    lead.email || "",
    lead.service_requested || "",
    lead.message || "",
    lead.called ? "Yes" : "No",
    lead.call_attempted ? "Yes" : "No",
    isPushedToServiceM8(lead) ? "Yes" : "No",
    lead.notes || "",
    formatDate(getLeadReceivedAt(lead)),
  ]);

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((field) => `"${String(field).replace(/"/g, '""')}"`).join(","),
    ),
  ].join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute(
    "download",
    `leads-${new Date().toISOString().split("T")[0]}.csv`,
  );
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function LeadsView({ focusLeadRef }) {
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [hidingId, setHidingId] = useState(null);
  const [pushingId, setPushingId] = useState(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState(null);
  const [pushErrors, setPushErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [calledFilter, setCalledFilter] = useState("no");
  const [attemptedFilter, setAttemptedFilter] = useState("no");
  const [pushedFilter, setPushedFilter] = useState("all");
  const [statsDateFrom, setStatsDateFrom] = useState(() => todayInSydney());
  const [statsDateTo, setStatsDateTo] = useState(() => todayInSydney());
  const [dateFrom, setDateFrom] = useState(() => todayInSydney());
  const [dateTo, setDateTo] = useState(() => todayInSydney());
  const [nowTick, setNowTick] = useState(Date.now());
  const [expandedRows, setExpandedRows] = useState({});
  const [localNotes, setLocalNotes] = useState({});
  const [pageSize, setPageSize] = useState(50);
  const [currentPage, setCurrentPage] = useState(1);

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
      .eq("hidden", false)
      .order("received_at", { ascending: false });

    if (loadError) {
      setError(loadError.message);
    } else {
      const loadedLeads = (data || []).map(normalizeLead);
      setLeads(loadedLeads);
      reconcileUnlinkedLeads(loadedLeads, (syncedLead) => {
        setLeads((prev) =>
          prev.map((item) => (item.id === syncedLead.id ? syncedLead : item)),
        );
      });
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
    const timer = window.setInterval(() => setNowTick(Date.now()), 60000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!hasSupabaseConfig) return undefined;

    function handleNewLead(lead) {
      if (isLeadHidden(lead)) return;

      const normalized = normalizeLead(lead);

      setLeads((prev) => {
        if (prev.some((item) => item.id === normalized.id)) {
          return prev;
        }
        return [normalized, ...prev];
      });

      setToast({
        type: "info",
        title: "New lead",
        message: `${normalized.full_name || "Someone"} — ${formatCategoryLabel(normalized.source, normalized.raw_payload)}`,
      });
    }

    const channel = supabase
      .channel("lead-dashboard")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "leads" },
        (payload) => {
          if (payload.new) handleNewLead(payload.new);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "leads" },
        (payload) => {
          if (!payload.new) return;
          const updated = normalizeLead(payload.new);
          if (isLeadHidden(updated)) {
            setLeads((prev) => prev.filter((item) => item.id !== updated.id));
            return;
          }
          setLeads((prev) =>
            prev.map((item) => (item.id === updated.id ? updated : item)),
          );
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "leads" },
        (payload) => {
          if (!payload.old?.id) return;
          setLeads((prev) => prev.filter((item) => item.id !== payload.old.id));
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    const notes = {};
    leads.forEach((lead) => {
      notes[lead.id] = lead.notes || "";
    });
    setLocalNotes(notes);
  }, [leads]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchQuery,
    categoryFilter,
    calledFilter,
    attemptedFilter,
    pushedFilter,
    dateFrom,
    dateTo,
    pageSize,
  ]);

  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const category = resolveLeadCategory(lead.source, lead.raw_payload);

      const matchesSearch =
        !searchQuery.trim() ||
        [
          lead.full_name,
          lead.phone,
          lead.email,
          lead.service_requested,
          lead.message,
          lead.notes,
          formatCategoryLabel(lead.source, lead.raw_payload),
        ]
          .filter(Boolean)
          .some((value) =>
            value.toLowerCase().includes(searchQuery.trim().toLowerCase()),
          );

      const matchesCategory =
        categoryFilter === "all" || category === categoryFilter;
      const matchesCalled =
        calledFilter === "all" ||
        (calledFilter === "yes" && lead.called) ||
        (calledFilter === "no" && !lead.called);
      const matchesAttempted =
        attemptedFilter === "all" ||
        (attemptedFilter === "yes" && lead.call_attempted) ||
        (attemptedFilter === "no" && !lead.call_attempted);
      const matchesPushed =
        pushedFilter === "all" ||
        (pushedFilter === "yes" && isPushedToServiceM8(lead)) ||
        (pushedFilter === "no" && !isPushedToServiceM8(lead));

      const matchesDate = isInSydneyDateRange(
        getLeadReceivedAt(lead),
        dateFrom,
        dateTo,
      );

      return (
        matchesSearch &&
        matchesCategory &&
        matchesCalled &&
        matchesAttempted &&
        matchesPushed &&
        matchesDate
      );
    });
  }, [
    leads,
    searchQuery,
    categoryFilter,
    calledFilter,
    attemptedFilter,
    pushedFilter,
    dateFrom,
    dateTo,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredLeads.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);

  const paginatedLeads = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return filteredLeads.slice(start, start + pageSize);
  }, [filteredLeads, pageSize, safePage]);

  const pageStart = filteredLeads.length ? (safePage - 1) * pageSize + 1 : 0;
  const pageEnd = Math.min(safePage * pageSize, filteredLeads.length);

  const focusLeadFromNotification = useCallback(
    (notification) => {
      const index = filteredLeads.findIndex(
        (lead) => lead.id === notification.leadId,
      );
      if (index === -1) {
        setToast({
          type: "warning",
          title: "Lead not visible",
          message: "This lead is hidden by your current filters.",
        });
        return;
      }

      const page = Math.floor(index / pageSize) + 1;
      setCurrentPage(page);
      setExpandedRows((prev) => ({ ...prev, [notification.leadId]: true }));

      window.setTimeout(() => {
        document
          .getElementById(`lead-row-${notification.leadId}`)
          ?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 100);
    },
    [filteredLeads, pageSize],
  );

  useEffect(() => {
    if (!focusLeadRef) return undefined;

    focusLeadRef.current = focusLeadFromNotification;
    return () => {
      focusLeadRef.current = null;
    };
  }, [focusLeadRef, focusLeadFromNotification]);

  const lastLeadByPlatform = useMemo(
    () => getLastLeadAgeByCategory(leads),
    [leads, nowTick],
  );

  const statsLeads = useMemo(() => {
    return leads.filter((lead) =>
      isInSydneyDateRange(getLeadReceivedAt(lead), statsDateFrom, statsDateTo),
    );
  }, [leads, statsDateFrom, statsDateTo]);

  const stats = useMemo(() => {
    const total = statsLeads.length;
    const pushed = statsLeads.filter(isPushedToServiceM8).length;
    const needsCall = statsLeads.filter(
      (l) => !isPushedToServiceM8(l) && !l.call_attempted,
    ).length;
    const called = statsLeads.filter((l) => l.called).length;

    return { total, pushed, needsCall, called };
  }, [statsLeads]);

  async function updateLead(id, patch) {
    setSavingId(id);
    setError("");
    setLeads((prev) =>
      prev.map((lead) => (lead.id === id ? { ...lead, ...patch } : lead)),
    );

    if (hasSupabaseConfig) {
      const { error: updateError } = await supabase
        .from("leads")
        .update(patch)
        .eq("id", id);

      if (updateError) {
        setError(updateError.message);
        await loadLeads();
      }
    }

    setSavingId(null);
  }

  async function hideLead(lead) {
    const label = lead.full_name || "this lead";
    const confirmed = window.confirm(
      `Hide "${label}" from the dashboard?\n\nThe lead stays in Supabase and can be restored from the database if needed.`,
    );
    if (!confirmed) return;

    setHidingId(lead.id);
    setError("");
    setExpandedRows((prev) => {
      const next = { ...prev };
      delete next[lead.id];
      return next;
    });
    setLeads((prev) => prev.filter((item) => item.id !== lead.id));

    if (hasSupabaseConfig) {
      const { error: hideError } = await supabase
        .from("leads")
        .update({ hidden: true })
        .eq("id", lead.id);

      if (hideError) {
        setError(hideError.message);
        await loadLeads();
      }
    }

    setHidingId(null);
  }

  async function persistPushToSupabase(leadId, patch) {
    if (!hasSupabaseConfig) return { ok: true };

    try {
      await syncServiceM8Link(leadId, patch.servicem8_job_uuid);
      return { ok: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { ok: false, error: message };
    }
  }

  async function refreshLeadFromSupabase(leadId) {
    if (!hasSupabaseConfig) return null;

    const { data, error: loadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .single();

    if (loadError || !data) return null;
    return normalizeLead(data);
  }

  async function pushToServiceM8(lead) {
    setPushingId(lead.id);
    setError("");
    setPushErrors((prev) => {
      const next = { ...prev };
      delete next[lead.id];
      return next;
    });

    try {
      let currentLead = (await refreshLeadFromSupabase(lead.id)) || lead;

      const reconciled = await reconcileLeadServiceM8Link(currentLead);
      if (reconciled.synced) {
        currentLead = reconciled.lead;
        setLeads((prev) =>
          prev.map((item) => (item.id === lead.id ? currentLead : item)),
        );
      }

      if (isPushedToServiceM8(currentLead)) {
        setLeads((prev) =>
          prev.map((item) =>
            item.id === lead.id ? { ...item, ...currentLead } : item,
          ),
        );
        setToast({
          type: "success",
          title: "Already in ServiceM8",
          message: `${currentLead.full_name || "Lead"} already has a ServiceM8 job.`,
          jobUrl: serviceM8JobUrl(currentLead.servicem8_job_uuid),
        });
        return;
      }

      let result;

      if (!hasSupabaseConfig) {
        result = {
          ok: true,
          job_uuid: `demo-${lead.id}`,
          job_url: serviceM8JobUrl(`demo-${lead.id}`),
        };
      } else if (isInServiceM8Iframe()) {
        result = await pushLeadViaServiceM8Bridge(currentLead);
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
      const alreadyPushed = Boolean(result.already_pushed);
      const patch = {
        servicem8_job_uuid: jobUuid,
        servicem8_pushed_at:
          currentLead.servicem8_pushed_at || new Date().toISOString(),
      };

      setLeads((prev) =>
        prev.map((item) => (item.id === lead.id ? { ...item, ...patch } : item)),
      );

      const save = await persistPushToSupabase(lead.id, patch);
      if (!save.ok) {
        setToast({
          type: "warning",
          title: alreadyPushed
            ? "Job found, but link not saved"
            : "Job created, but link not saved",
          message: `ServiceM8 has the job, but Supabase could not save the link: ${save.error}`,
          jobUrl,
        });
        return;
      }

      setToast({
        type: "success",
        title: alreadyPushed ? "Already in ServiceM8" : "Job created",
        message: alreadyPushed
          ? `${currentLead.full_name || "Lead"} was already in ServiceM8. The dashboard link has been restored.`
          : `${currentLead.full_name || "Lead"} was pushed to ServiceM8 as a Quote job.`,
        jobUrl,
      });
    } catch (pushError) {
      const message = formatServiceM8Error(
        pushError instanceof Error ? pushError.message : String(pushError),
      );
      setPushErrors((prev) => ({ ...prev, [lead.id]: message }));
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
    const today = todayInSydney();
    setSearchQuery("");
    setCategoryFilter("all");
    setCalledFilter("no");
    setAttemptedFilter("no");
    setPushedFilter("all");
    setDateFrom(today);
    setDateTo(today);
  }

  function handleExportCSV() {
    if (filteredLeads.length === 0) return;
    downloadCSV(filteredLeads);
  }

  return (
    <div className="page-shell">
      <header className="page-top">
        <StatsDateFilters
          dateFrom={statsDateFrom}
          dateTo={statsDateTo}
          onDateFromChange={setStatsDateFrom}
          onDateToChange={setStatsDateTo}
        />
        <div className="page-top-main">
          <section className="stats-grid stats-grid-compact">
          <div className="stat-card">
            <div className="stat-icon blue">
              <ClipboardList size={18} />
            </div>
            <div>
              <p className="stat-label">Total Leads</p>
              <p className="stat-value">{stats.total}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon red">
              <Phone size={18} />
            </div>
            <div>
              <p className="stat-label">Needs Call</p>
              <p className="stat-value">{stats.needsCall}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon purple">
              <Phone size={18} />
            </div>
            <div>
              <p className="stat-label">Called</p>
              <p className="stat-value">{stats.called}</p>
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-icon green">
              <CalendarCheck size={18} />
            </div>
            <div>
              <p className="stat-label">Pushed to SM8</p>
              <p className="stat-value">{stats.pushed}</p>
            </div>
          </div>
          </section>

          <div className="topbar-actions">
            <button
              className="icon-button"
              onClick={loadLeads}
              aria-label="Refresh leads"
              disabled={loading}
            >
              {loading ? <Loader2 className="spin" /> : <RefreshCcw />}
            </button>
          </div>
        </div>
      </header>

      <section className="platform-last-leads platform-last-leads-compact">
        <div className="platform-last-leads-header">
          <Clock size={16} />
          <h2>Last lead by platform</h2>
        </div>
        <div className="platform-last-leads-grid">
          {lastLeadByPlatform.map((platform) => (
            <div
              key={platform.id}
              className={`platform-last-card ${platform.id}${platform.isStale ? " stale" : ""}`}
            >
              <p className="platform-last-label">{platform.label}</p>
              <p className="platform-last-age">{platform.age}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="filters-section">
        <div className="filters-header">
          <div className="filters-title">
            <Filter size={20} />
            <h2>Filters</h2>
          </div>
          <div className="filters-header-actions">
            <button
              className="text-button"
              onClick={handleExportCSV}
              type="button"
              disabled={loading || filteredLeads.length === 0}
              title={
                filteredLeads.length === 0
                  ? "No leads to export with current filters"
                  : `Export ${filteredLeads.length} lead(s) to CSV`
              }
            >
              <Download size={18} />
              Export CSV
            </button>
            <button className="text-button" onClick={resetFilters} type="button">
              Reset All
            </button>
          </div>
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
            <label className="filter-label">Category</label>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="filter-select"
            >
              {CATEGORY_OPTIONS.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.label}
                </option>
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
            <label className="filter-label">No Answer</label>
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
            <label className="filter-label">Push ServiceM8</label>
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
          Demo mode is active. Add Supabase values to .env to connect live leads.
        </p>
      )}

      {hasSupabaseConfig && !loading && filteredLeads.length === 0 && leads.length > 0 && (
        <p className="notice">No leads match your current filters.</p>
      )}

      {hasSupabaseConfig && !loading && leads.length === 0 && (
        <p className="notice">
          Connected to Supabase, but no leads found yet. Submit a test form via
          the WordPress webhook (see <strong>wordpress/WEBHOOK.md</strong>).
        </p>
      )}

      {error && <p className="error">Supabase error: {error}</p>}

      {toast && (
        <div className={`toast toast-${toast.type}`} role="status">
          <div className="toast-icon">
            {toast.type === "success" ? (
              <CheckCircle2 size={20} />
            ) : toast.type === "info" ? (
              <Bell size={20} />
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

      <section className="table-container">
        <div className="table-toolbar">
          <p className="table-toolbar-summary">
            {loading
              ? "Loading leads…"
              : filteredLeads.length
                ? `Showing ${pageStart}–${pageEnd} of ${filteredLeads.length} leads`
                : "No leads to show"}
          </p>
          <div className="table-toolbar-controls">
            <label className="table-page-size">
              <span>Show</span>
              <select
                value={pageSize}
                onChange={(e) => setPageSize(Number(e.target.value))}
                className="filter-select"
                aria-label="Rows per page"
              >
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <span>per page</span>
            </label>
            <div className="table-pagination">
              <button
                type="button"
                className="pagination-button"
                onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                disabled={loading || safePage <= 1}
                aria-label="Previous page"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="pagination-status">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                className="pagination-button"
                onClick={() =>
                  setCurrentPage((page) => Math.min(totalPages, page + 1))
                }
                disabled={loading || safePage >= totalPages}
                aria-label="Next page"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="leads-table">
            <thead>
              <tr>
                <th></th>
                <th>Category</th>
                <th>Name</th>
                <th>Phone</th>
                <th>Email</th>
                <th>Service</th>
                <th>Called</th>
                <th>No Answer</th>
                <th>Push ServiceM8</th>
                <th></th>
                <th>Received</th>
                <th aria-label="Actions"></th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="12" className="table-loading">
                    <Loader2 className="spin" />
                    Loading leads...
                  </td>
                </tr>
              ) : filteredLeads.length === 0 ? (
                <tr>
                  <td colSpan="12" className="table-empty">
                    No leads found
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead) => {
                  const category = resolveLeadCategory(
                    lead.source,
                    lead.raw_payload,
                  );
                  const pushed = isPushedToServiceM8(lead);
                  const formAnswers = formatLeadFormAnswers(lead.raw_payload, lead);

                  return (
                    <Fragment key={lead.id}>
                      <tr
                        id={`lead-row-${lead.id}`}
                        className={pushed ? "pushed" : ""}
                      >
                        <td className="expand-cell">
                          <button
                            className="expand-btn"
                            onClick={() => toggleExpand(lead.id)}
                            type="button"
                            title="View details"
                            aria-label="View details"
                          >
                            {expandedRows[lead.id] ? (
                              <ChevronUp size={16} />
                            ) : (
                              <ChevronDown size={16} />
                            )}
                          </button>
                        </td>
                        <td>
                          <span className={`source-badge ${category}`}>
                            <CategoryIcon category={category} />
                            {formatCategoryLabel(lead.source, lead.raw_payload)}
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
                          ) : (
                            "-"
                          )}
                        </td>
                        <td>
                          {lead.email ? (
                            <a href={`mailto:${lead.email}`} className="link">
                              {lead.email}
                            </a>
                          ) : (
                            "-"
                          )}
                        </td>
                        <td className="service-cell">
                          {lead.service_requested || "-"}
                        </td>
                        <td>
                          <label className="toggle-label">
                            <input
                              type="checkbox"
                              checked={lead.called}
                              onChange={(e) =>
                                updateLead(lead.id, { called: e.target.checked })
                              }
                            />
                            <span className="toggle-custom"></span>
                          </label>
                        </td>
                        <td>
                          <label className="toggle-label">
                            <input
                              type="checkbox"
                              checked={lead.call_attempted}
                              onChange={(e) =>
                                updateLead(lead.id, {
                                  call_attempted: e.target.checked,
                                })
                              }
                            />
                            <span className="toggle-custom"></span>
                          </label>
                        </td>
                        <td className="push-status-cell">
                          <span className={`push-flag ${pushed ? "yes" : "no"}`}>
                            {pushed ? "Yes" : "No"}
                          </span>
                        </td>
                        <td className="servicem8-cell">
                          {pushed ? (
                            <div className="push-status push-status-success">
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
                                <p className="push-status-error">
                                  {pushErrors[lead.id]}
                                </p>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="date-cell">
                          {formatDate(getLeadReceivedAt(lead))}
                        </td>
                        <td className="actions-cell">
                          <button
                            className="hide-lead-button"
                            type="button"
                            title="Hide from dashboard"
                            aria-label={`Hide ${lead.full_name || "lead"} from dashboard`}
                            onClick={() => hideLead(lead)}
                            disabled={hidingId === lead.id}
                          >
                            {hidingId === lead.id ? (
                              <Loader2 className="spin" size={15} />
                            ) : (
                              <Trash2 size={15} />
                            )}
                          </button>
                        </td>
                      </tr>
                      {expandedRows[lead.id] && (
                        <tr className="expanded-row">
                          <td colSpan="12">
                            <div className="expanded-content">
                              {lead.message && formAnswers.length === 0 && (
                                <div className="expanded-section">
                                  <h4>Message</h4>
                                  <p className="lead-message">{lead.message}</p>
                                </div>
                              )}
                              <div className="expanded-details-grid">
                                <div className="expanded-section">
                                  <h4>Notes</h4>
                                  <div className="notes-field">
                                    <textarea
                                      value={localNotes[lead.id] || ""}
                                      onChange={(e) =>
                                        handleNoteChange(lead.id, e.target.value)
                                      }
                                      onBlur={() => {
                                        if (localNotes[lead.id] !== lead.notes) {
                                          updateLead(lead.id, {
                                            notes: localNotes[lead.id] || "",
                                          });
                                        }
                                      }}
                                      rows={4}
                                      placeholder="Add notes here..."
                                    />
                                    <button
                                      className="save-button"
                                      type="button"
                                      onClick={() =>
                                        updateLead(lead.id, {
                                          notes: localNotes[lead.id] || "",
                                        })
                                      }
                                      disabled={savingId === lead.id}
                                    >
                                      {savingId === lead.id ? (
                                        <Loader2 className="spin" />
                                      ) : (
                                        <Save size={16} />
                                      )}
                                      {savingId === lead.id ? "Saving" : "Save Notes"}
                                    </button>
                                  </div>
                                </div>
                                {formAnswers.length > 0 && (
                                  <div className="expanded-section">
                                    <h4>Form answers</h4>
                                    <dl className="form-answers-list">
                                      {formAnswers.map((item) => (
                                          <div
                                            className="form-answers-row"
                                            key={`${item.label}-${item.value}`}
                                          >
                                            <dt className="form-answers-label">
                                              {item.label}
                                            </dt>
                                            <dd className="form-answers-value">
                                              {item.value}
                                            </dd>
                                          </div>
                                      ))}
                                    </dl>
                                  </div>
                                )}
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
