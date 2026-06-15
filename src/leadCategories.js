/** Three lead source categories — see PROJECT.md */

export const CATEGORY_LABELS = {
  same_day_home_services: "Same Day Home Services",
  stay_connected_plumbing: "Stay Connected Plumbing",
  facebook: "Facebook",
};

export const CATEGORY_OPTIONS = [
  { id: "all", label: "All Categories" },
  { id: "same_day_home_services", label: CATEGORY_LABELS.same_day_home_services },
  { id: "stay_connected_plumbing", label: CATEGORY_LABELS.stay_connected_plumbing },
  { id: "facebook", label: CATEGORY_LABELS.facebook },
];

const SAME_DAY_HOSTS = [
  "samedayhomeservices.com.au",
  "samedayshowerrepairs.com.au",
  "emergencyplumbingrepairs.com.au",
];

function extractUrl(rawPayload) {
  if (!rawPayload || typeof rawPayload !== "object") return "";
  return String(
    rawPayload.current_url ?? rawPayload.page_url ?? rawPayload.referer_url ?? "",
  ).toLowerCase();
}

export function resolveLeadCategory(source, rawPayload = {}) {
  if (source === "facebook") return "facebook";

  const url = extractUrl(rawPayload);
  if (url.includes("stayconnectedplumbing.com.au")) return "stay_connected_plumbing";
  if (SAME_DAY_HOSTS.some((host) => url.includes(host))) {
    return "same_day_home_services";
  }

  if (source === "stay_connected_plumbing") return "stay_connected_plumbing";
  if (
    source === "same_day_home_services" ||
    source === "same_day_shower_repairs" ||
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
