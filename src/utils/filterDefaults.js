import { daysAgoInSydney, todayInSydney } from "./time";

const STORAGE_KEY = "lead-dashboard-filter-defaults-v1";

export const DATE_PRESET_OPTIONS = [
  { id: "all", label: "All time" },
  { id: "today", label: "Today" },
  { id: "last_7", label: "Last 7 days" },
  { id: "last_30", label: "Last 30 days" },
  { id: "custom", label: "Custom range" },
];

export const YES_NO_ALL_OPTIONS = [
  { id: "all", label: "All" },
  { id: "yes", label: "Yes" },
  { id: "no", label: "No" },
];

export const FACTORY_FILTER_DEFAULTS = {
  leads: {
    category: "all",
    called: "no",
    attempted: "no",
    pushed: "all",
    datePreset: "all",
    customDateFrom: "",
    customDateTo: "",
    statsDatePreset: "today",
    statsCustomDateFrom: "",
    statsCustomDateTo: "",
  },
  calls: {
    status: "missed_abandoned",
    brand: "all",
    followedUp: "no",
    firstTime: "all",
    datePreset: "today",
    customDateFrom: "",
    customDateTo: "",
    statsDatePreset: "today",
    statsCustomDateFrom: "",
    statsCustomDateTo: "",
  },
};

function mergeSection(factory, saved) {
  if (!saved || typeof saved !== "object") return { ...factory };
  return { ...factory, ...saved };
}

export function getFactoryFilterDefaults() {
  return {
    leads: { ...FACTORY_FILTER_DEFAULTS.leads },
    calls: { ...FACTORY_FILTER_DEFAULTS.calls },
  };
}

export function loadFilterDefaults() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return getFactoryFilterDefaults();
    const parsed = JSON.parse(raw);
    return {
      leads: mergeSection(FACTORY_FILTER_DEFAULTS.leads, parsed.leads),
      calls: mergeSection(FACTORY_FILTER_DEFAULTS.calls, parsed.calls),
    };
  } catch {
    return getFactoryFilterDefaults();
  }
}

export function saveFilterDefaults(defaults) {
  const next = {
    leads: mergeSection(FACTORY_FILTER_DEFAULTS.leads, defaults?.leads),
    calls: mergeSection(FACTORY_FILTER_DEFAULTS.calls, defaults?.calls),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function resolveDatePreset(preset, customFrom = "", customTo = "") {
  const today = todayInSydney();

  switch (preset) {
    case "all":
      return { dateFrom: "", dateTo: "" };
    case "today":
      return { dateFrom: today, dateTo: today };
    case "last_7":
      return { dateFrom: daysAgoInSydney(6), dateTo: today };
    case "last_30":
      return { dateFrom: daysAgoInSydney(29), dateTo: today };
    case "custom":
      return {
        dateFrom: customFrom || "",
        dateTo: customTo || "",
      };
    default:
      return { dateFrom: today, dateTo: today };
  }
}

export function applyLeadsFilterDefaults(section) {
  const config = mergeSection(FACTORY_FILTER_DEFAULTS.leads, section);
  const listDates = resolveDatePreset(
    config.datePreset,
    config.customDateFrom,
    config.customDateTo,
  );
  const statsDates = resolveDatePreset(
    config.statsDatePreset,
    config.statsCustomDateFrom,
    config.statsCustomDateTo,
  );

  return {
    category: config.category,
    called: config.called,
    attempted: config.attempted,
    pushed: config.pushed,
    dateFrom: listDates.dateFrom,
    dateTo: listDates.dateTo,
    statsDateFrom: statsDates.dateFrom,
    statsDateTo: statsDates.dateTo,
  };
}

export function applyCallsFilterDefaults(section) {
  const config = mergeSection(FACTORY_FILTER_DEFAULTS.calls, section);
  const listDates = resolveDatePreset(
    config.datePreset,
    config.customDateFrom,
    config.customDateTo,
  );
  const statsDates = resolveDatePreset(
    config.statsDatePreset,
    config.statsCustomDateFrom,
    config.statsCustomDateTo,
  );

  return {
    status: config.status,
    brand: config.brand,
    followedUp: config.followedUp,
    firstTime: config.firstTime,
    dateFrom: listDates.dateFrom,
    dateTo: listDates.dateTo,
    statsDateFrom: statsDates.dateFrom,
    statsDateTo: statsDates.dateTo,
  };
}
