import {
  type LeadCategory,
  resolveLeadCategory,
} from "./lead-category.ts";

/** ServiceM8 job category UUIDs — Same Day Home Services account */
export const SERVICEM8_CATEGORY_UUIDS: Record<LeadCategory, string> = {
  same_day_home_services: "56ede18b-65c7-4a1f-a1cc-2420756f929b",
  same_day_shower_repairs: "56ede18b-65c7-4a1f-a1cc-2420756f929b",
  stay_connected_plumbing: "bdbbb658-6e05-4a09-aeab-1e4fcc4e61bb",
  facebook: "0e38598c-fbfe-4f0f-93d9-21fa78f83a5b",
};

export function resolveServiceM8CategoryUuid(
  source: string,
  rawPayload: Record<string, unknown> = {},
): string {
  const category = resolveLeadCategory(source, rawPayload);
  return SERVICEM8_CATEGORY_UUIDS[category];
}
