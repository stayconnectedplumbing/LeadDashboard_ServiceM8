export type LeadCategory =
  | "same_day_home_services"
  | "same_day_shower_repairs"
  | "stay_connected_plumbing"
  | "facebook";

const SHOWER_REPAIRS_HOST = "samedayshowerrepairs.com.au";

const SAME_DAY_HOSTS = [
  "samedayhomeservices.com.au",
  "emergencyplumbingrepairs.com.au",
];

const STAY_CONNECTED_HOST = "stayconnectedplumbing.com.au";

function extractUrl(raw: Record<string, unknown> | undefined): string {
  if (!raw) return "";

  const direct = String(
    raw.current_url ?? raw.page_url ?? raw.referer_url ?? raw._wp_http_referer ?? "",
  ).trim();
  if (direct) return direct.toLowerCase();

  for (const [key, value] of Object.entries(raw)) {
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

export function resolveLeadCategoryFromUrl(
  url: string,
): LeadCategory | null {
  if (url.includes(STAY_CONNECTED_HOST)) return "stay_connected_plumbing";
  if (url.includes(SHOWER_REPAIRS_HOST)) return "same_day_shower_repairs";
  if (SAME_DAY_HOSTS.some((host) => url.includes(host))) {
    return "same_day_home_services";
  }
  return null;
}

export function resolveLeadCategory(
  source: string,
  rawPayload: Record<string, unknown> = {},
): LeadCategory {
  if (source === "facebook") return "facebook";

  const fromUrl = resolveLeadCategoryFromUrl(extractUrl(rawPayload));
  if (fromUrl) return fromUrl;

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

export function resolveWordPressSource(
  payload: Record<string, unknown>,
): LeadCategory {
  return resolveLeadCategory("wordpress", payload);
}
