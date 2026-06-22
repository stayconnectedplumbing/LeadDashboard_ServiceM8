export type FormAnswer = { label: string; value: string };

const SKIP_FIELD_NAMES = new Set([
  "full_name",
  "name",
  "first_name",
  "last_name",
  "email",
  "phone_number",
  "phone",
  "mobile",
]);

const SKIP_PAYLOAD_KEYS = new Set([
  "field_data",
  "form_name",
  "form_id",
  "page_id",
  "leadgen_id",
  "ad_id",
  "adgroup_id",
  "created_time",
  "id",
  "meta_test",
  "graph_fetch_error",
  "current_url",
  "page_url",
  "referer_url",
  "form_title",
  "entry_time",
  "form_type",
  "render_id",
  "_wp_http_referer",
  "_forminator_user_ip",
]);

function humanizeLabel(name: string): string {
  return String(name)
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pushAnswer(
  lines: FormAnswer[],
  label: string,
  value: unknown,
  seen: Set<string>,
): void {
  const text = value == null ? "" : String(value).trim();
  if (!label || !text) return;
  const key = `${label}:${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  lines.push({ label: humanizeLabel(label), value: text });
}

export function formatLeadFormAnswers(
  rawPayload: Record<string, unknown> = {},
): FormAnswer[] {
  if (!rawPayload || typeof rawPayload !== "object") return [];

  const lines: FormAnswer[] = [];
  const seen = new Set<string>();

  const fieldData = rawPayload.field_data;
  if (Array.isArray(fieldData)) {
    for (const entry of fieldData) {
      if (!entry || typeof entry !== "object") continue;
      const record = entry as { name?: string; values?: unknown[] };
      const name = String(record.name ?? "").trim();
      if (!name || SKIP_FIELD_NAMES.has(name.toLowerCase())) continue;
      pushAnswer(lines, name, record.values?.[0], seen);
    }
  }

  for (const [key, value] of Object.entries(rawPayload)) {
    if (SKIP_PAYLOAD_KEYS.has(key)) continue;
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    if (/^(name|email|phone|textarea|text|select|hidden|number|address|url)[-_]?\d+$/i.test(key)) {
      pushAnswer(lines, key, value, seen);
      continue;
    }
    if (/suburb|postcode|post_code|service|message|comments|details|location|city/i.test(key)) {
      pushAnswer(lines, key, value, seen);
    }
  }

  return lines;
}

export function formatLeadFormAnswersText(
  rawPayload: Record<string, unknown> = {},
): string {
  return formatLeadFormAnswers(rawPayload)
    .map((item) => `${item.label}: ${item.value}`)
    .join("\n");
}

function extractTopLevelAddress(payload: Record<string, unknown>): string {
  const keys = ["suburb", "city", "location", "address", "job_address"];
  for (const key of keys) {
    for (const [field, value] of Object.entries(payload)) {
      if (
        field.toLowerCase().includes(key) &&
        value != null &&
        String(value).trim()
      ) {
        return String(value).trim();
      }
    }
  }
  return "";
}

export function extractAddressFromPayload(
  rawPayload: Record<string, unknown> = {},
): string {
  const answers = formatLeadFormAnswers(rawPayload);
  let suburb = "";
  let postcode = "";
  let address = "";

  for (const { label, value } of answers) {
    const normalized = label.toLowerCase();
    if (normalized.includes("suburb") || normalized.includes("city")) {
      suburb = value;
    } else if (normalized.includes("postcode") || normalized.includes("post code")) {
      postcode = value;
    } else if (normalized.includes("address") || normalized.includes("location")) {
      address = value;
    }
  }

  if (suburb && postcode) return `${suburb} ${postcode}`;
  if (suburb) return suburb;
  if (postcode) return postcode;
  if (address) return address;

  return extractTopLevelAddress(rawPayload);
}
