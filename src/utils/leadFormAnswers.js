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
  "page_id",
  "form_type",
  "render_id",
  "_wp_http_referer",
  "_forminator_user_ip",
]);

function humanizeLabel(name) {
  return String(name)
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function pushAnswer(lines, label, value) {
  const text = value == null ? "" : String(value).trim();
  if (!label || !text) return;
  lines.push({ label: humanizeLabel(label), value: text });
}

export function formatLeadFormAnswers(rawPayload = {}) {
  if (!rawPayload || typeof rawPayload !== "object") return [];

  const lines = [];
  const seen = new Set();

  const fieldData = rawPayload.field_data;
  if (Array.isArray(fieldData)) {
    for (const entry of fieldData) {
      const name = String(entry?.name ?? "").trim();
      if (!name || SKIP_FIELD_NAMES.has(name.toLowerCase())) continue;
      const value = entry?.values?.[0];
      const key = `${name}:${value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pushAnswer(lines, name, value);
    }
  }

  for (const [key, value] of Object.entries(rawPayload)) {
    if (SKIP_PAYLOAD_KEYS.has(key)) continue;
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    if (/^(name|email|phone|textarea|text|select|hidden|number|address|url)[-_]?\d+$/i.test(key)) {
      pushAnswer(lines, key, value);
      continue;
    }
    if (/suburb|postcode|post_code|service|message|comments|details|location|city/i.test(key)) {
      const dedupe = `${key}:${value}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      pushAnswer(lines, key, value);
    }
  }

  return lines;
}
