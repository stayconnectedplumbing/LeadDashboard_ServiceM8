/** Three lead source categories — see PROJECT.md */

export type LeadCategory =
  | "same_day_home_services"
  | "stay_connected_plumbing"
  | "facebook";

const SAME_DAY_HOSTS = [
  "samedayhomeservices.com.au",
  "samedayshowerrepairs.com.au",
  "emergencyplumbingrepairs.com.au",
];

const STAY_CONNECTED_HOST = "stayconnectedplumbing.com.au";

function extractUrl(raw: Record<string, unknown> | undefined): string {
  if (!raw) return "";
  return String(
    raw.current_url ?? raw.page_url ?? raw.referer_url ?? "",
  ).toLowerCase();
}

export function resolveLeadCategoryFromUrl(
  url: string,
): LeadCategory | null {
  if (url.includes(STAY_CONNECTED_HOST)) return "stay_connected_plumbing";
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
  if (
    source === "same_day_home_services" ||
    source === "same_day_shower_repairs" ||
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
