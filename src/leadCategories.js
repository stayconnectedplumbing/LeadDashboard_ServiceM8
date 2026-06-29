import { parseAustralianLocalTime } from "./utils/time.js";

export const CATEGORY_LABELS = {
  same_day_home_services: "Same Day Home Services",
  same_day_shower_repairs: "Same Day Shower Repairs",
  stay_connected_plumbing: "Stay Connected Plumbing",
  facebook: "Facebook",
};

export const CATEGORY_OPTIONS = [
  { id: "all", label: "All Categories" },
  { id: "same_day_home_services", label: CATEGORY_LABELS.same_day_home_services },
  { id: "same_day_shower_repairs", label: CATEGORY_LABELS.same_day_shower_repairs },
  { id: "stay_connected_plumbing", label: CATEGORY_LABELS.stay_connected_plumbing },
  { id: "facebook", label: CATEGORY_LABELS.facebook },
];

export const PLATFORM_CATEGORIES = [
  "same_day_home_services",
  "same_day_shower_repairs",
  "stay_connected_plumbing",
  "facebook",
];

export const PLATFORM_SHORT_LABELS = {
  same_day_home_services: "Same Day Home Services",
  same_day_shower_repairs: "Same Day Shower Repairs",
  stay_connected_plumbing: "Stay Connected Plumbing",
  facebook: "Facebook",
};

const SHOWER_REPAIRS_HOST = "samedayshowerrepairs.com.au";

const SAME_DAY_HOSTS = [
  "samedayhomeservices.com.au",
  "emergencyplumbingrepairs.com.au",
];

function extractUrl(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") return "";

  const direct = String(
    rawPayload.current_url ?? rawPayload.page_url ?? rawPayload.referer_url ?? "",
  ).trim();
  if (direct) return direct.toLowerCase();

  for (const [key, value] of Object.entries(rawPayload)) {
    const normalized = key.toLowerCase().replace(/_/g, " ").trim();
    if (
      (normalized === "page url" ||
        normalized === "pageurl" ||
        normalized === "current url") &&
      value != null &&
      value !== ""
    ) {
      return String(value).toLowerCase();
    }
  }

  return "";
}

export function resolveLeadCategory(source, rawPayload = {}) {
  if (source === "facebook") return "facebook";

  const url = extractUrl(rawPayload);
  if (url.includes("stayconnectedplumbing.com.au")) return "stay_connected_plumbing";
  if (url.includes(SHOWER_REPAIRS_HOST)) return "same_day_shower_repairs";
  if (SAME_DAY_HOSTS.some((host) => url.includes(host))) {
    return "same_day_home_services";
  }

  if (source === "stay_connected_plumbing") return "stay_connected_plumbing";
  if (source === "same_day_shower_repairs") return "same_day_shower_repairs";
  if (
    source === "same_day_home_services" ||
    source === "emergency_plumbing_sydney"
  ) {
    return "same_day_home_services";
  }

  return "same_day_home_services";
}

export function formatCategoryLabel(source, rawPayload) {
  const category = resolveLeadCategory(source, rawPayload);
  return CATEGORY_LABELS[category] || category;
}

export function getLeadReceivedAt(lead) {
  const payload =
    typeof lead.raw_payload === "string"
      ? (() => {
          try {
            return JSON.parse(lead.raw_payload);
          } catch {
            return null;
          }
        })()
      : lead.raw_payload;

  const entryTime = payload?.entry_time ?? payload?.submitted_at;
  if (entryTime) {
    const parsed = parseAustralianLocalTime(entryTime);
    if (parsed) return parsed;
  }

  const receivedAt = lead.received_at || lead.created_at;
  if (receivedAt) {
    const parsed = parseAustralianLocalTime(receivedAt);
    if (parsed) return parsed;
  }

  return new Date(receivedAt);
}

export function formatTimeSince(date) {
  const ms = Date.now() - date.getTime();
  if (ms < 0) return "Just now";

  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) {
    const minutes = Math.max(1, Math.round(hours * 60));
    return minutes === 1 ? "< 1 hr" : `${minutes} min`;
  }

  const rounded = Math.round(hours * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded : rounded.toFixed(1)} hrs`;
}

export function getLastLeadAgeByCategory(leads) {
  return PLATFORM_CATEGORIES.map((categoryId) => {
    const categoryLeads = leads.filter(
      (lead) => resolveLeadCategory(lead.source, lead.raw_payload) === categoryId,
    );

    if (!categoryLeads.length) {
      return {
        id: categoryId,
        label: PLATFORM_SHORT_LABELS[categoryId],
        age: "—",
        detail: "No leads yet",
        isStale: false,
      };
    }

    const latestMs = categoryLeads.reduce((max, lead) => {
      const time = getLeadReceivedAt(lead).getTime();
      return time > max ? time : max;
    }, 0);

    const hours = (Date.now() - latestMs) / (1000 * 60 * 60);

    return {
      id: categoryId,
      label: PLATFORM_SHORT_LABELS[categoryId],
      age: formatTimeSince(new Date(latestMs)),
      detail: "Since last lead",
      isStale: hours >= 24,
    };
  });
}
