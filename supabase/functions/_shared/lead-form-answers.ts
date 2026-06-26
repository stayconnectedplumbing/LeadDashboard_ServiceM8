export type FormAnswer = { label: string; value: string };

export type LeadFormContext = {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  service_requested?: string | null;
  message?: string | null;
  raw_payload?: Record<string, unknown>;
};

const SKIP_FIELD_NAMES = new Set([
  "full_name",
  "name",
  "first_name",
  "last_name",
  "email",
  "phone_number",
  "phone",
  "mobile",
  "service",
  "service_requested",
  "message",
  "comments",
  "details",
]);

/** Facebook field_data: only hide contact fields already shown in the table. */
const FACEBOOK_CONTACT_FIELDS = new Set([
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
  "webhook_secret",
  "_webhook_secret",
]);

const FORMINATOR_FIELD_KEY =
  /^(name|email|phone|textarea|text|select|radio|checkbox|hidden|number|address|url)[-_]?\d+$/i;

type PushAnswerOptions = {
  allowLongText?: boolean;
  skipMessageMatch?: boolean;
};

function decodeHtmlEntities(text: unknown): string {
  return String(text)
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) =>
      String.fromCharCode(parseInt(code, 16)),
    )
    .replace(/&amp;/gi, "&");
}

function formatDisplayText(text: unknown): string {
  return decodeHtmlEntities(text)
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export { formatDisplayText };

function humanizeLabel(name: string): string {
  return formatDisplayText(name)
    .replace(/[-/]+/g, " ")
    .replace(/\?+$/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizePhone(value: unknown): string {
  return String(value).replace(/\D/g, "");
}

function isUrl(value: unknown): boolean {
  const text = String(value).trim();
  return (
    /^https?:\/\//i.test(text) ||
    text.startsWith("//") ||
    /^www\./i.test(text)
  );
}

function isTrackingToken(value: unknown): boolean {
  const text = String(value).trim();
  if (!text) return true;
  if (text.length > 50 && !/\s/.test(text) && !text.includes("@")) return true;
  if (/^[A-Za-z0-9+/=_-]{40,}$/.test(text)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) {
    return true;
  }
  return false;
}

function isNumericId(value: unknown): boolean {
  return /^\d{5,}$/.test(String(value).trim());
}

function isPostcodeField(label: string): boolean {
  return /^(post_code|postcode|zip|postal_code)$/i.test(String(label).trim());
}

function isHumanReadableAnswer(
  value: unknown,
  options: { allowLongText?: boolean } = {},
): boolean {
  const text = String(value).trim();
  const maxLength = options.allowLongText ? 5000 : 250;
  if (!text) return false;
  if (text.length < 2 || text.length > maxLength) return false;
  if (isUrl(text)) return false;
  if (isTrackingToken(text)) return false;
  if (isNumericId(text)) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  if (/^page:\s*/i.test(text)) return false;
  return true;
}

function isForminatorPayload(rawPayload: Record<string, unknown>): boolean {
  return Object.keys(rawPayload).some((key) => FORMINATOR_FIELD_KEY.test(key));
}

function sortedForminatorKeys(rawPayload: Record<string, unknown>, prefix: string): string[] {
  return Object.keys(rawPayload)
    .filter((key) => new RegExp(`^${prefix}[-_]?\\d+$`, "i").test(key))
    .sort((left, right) => {
      const leftNum = Number(left.match(/(\d+)$/)?.[1] ?? 0);
      const rightNum = Number(right.match(/(\d+)$/)?.[1] ?? 0);
      return leftNum - rightNum;
    });
}

function valueMatchesLead(
  value: unknown,
  lead: LeadFormContext | null,
  options: { skipMessageMatch?: boolean } = {},
): boolean {
  if (!lead) return false;

  const text = String(value).trim();
  if (!text) return false;

  const lower = text.toLowerCase();

  if (lead.full_name && lower === String(lead.full_name).trim().toLowerCase()) {
    return true;
  }
  if (lead.email && lower === String(lead.email).trim().toLowerCase()) {
    return true;
  }
  if (
    lead.phone &&
    normalizePhone(text) === normalizePhone(lead.phone) &&
    normalizePhone(text).length >= 8
  ) {
    return true;
  }
  if (
    lead.service_requested &&
    lower === String(lead.service_requested).trim().toLowerCase()
  ) {
    return true;
  }
  if (lead.message && !options.skipMessageMatch) {
    const message = String(lead.message).trim().toLowerCase();
    if (lower === message) return true;
    if (message.includes(`suburb: ${lower}`) || message.includes(`postcode: ${lower}`)) {
      return false;
    }
    if (message.includes(lower) && text.length >= 4) return true;
  }

  const pageUrl = String(
    lead.raw_payload?.current_url ?? lead.raw_payload?.page_url ?? "",
  ).trim();
  if (pageUrl && (text === pageUrl || pageUrl.includes(text) || text.includes(pageUrl))) {
    return true;
  }

  return false;
}

function pushAnswer(
  lines: FormAnswer[],
  label: string,
  value: unknown,
  seen: Set<string>,
  valueSeen: Set<string>,
  lead: LeadFormContext | null,
  options: PushAnswerOptions = {},
): void {
  const text = value == null ? "" : String(value).trim();
  if (!label || !text) return;
  const isPostcode = isPostcodeField(label) && /^\d{4}$/.test(text);
  if (
    !isHumanReadableAnswer(text, { allowLongText: options.allowLongText }) &&
    !isPostcode
  ) {
    return;
  }
  if (
    lead &&
    valueMatchesLead(text, lead, { skipMessageMatch: options.skipMessageMatch })
  ) {
    return;
  }

  const valueKey = text.toLowerCase();
  if (valueSeen.has(valueKey)) return;

  const key = `${label}:${text}`;
  if (seen.has(key)) return;

  seen.add(key);
  valueSeen.add(valueKey);
  lines.push({
    label: humanizeLabel(label),
    value: isPostcode ? text : formatDisplayText(text),
  });
}

function collectForminatorAnswers(
  rawPayload: Record<string, unknown>,
  lead: LeadFormContext | null,
): FormAnswer[] {
  const lines: FormAnswer[] = [];
  const seen = new Set<string>();
  const valueSeen = new Set<string>();
  let hasService = Boolean(lead?.service_requested);

  for (const key of sortedForminatorKeys(rawPayload, "text")) {
    pushAnswer(lines, "Suburb", rawPayload[key], seen, valueSeen, lead);
  }

  for (const key of sortedForminatorKeys(rawPayload, "select")) {
    if (hasService) continue;
    const before = lines.length;
    pushAnswer(lines, "Service", rawPayload[key], seen, valueSeen, lead);
    if (lines.length > before) hasService = true;
  }

  for (const key of sortedForminatorKeys(rawPayload, "radio")) {
    if (hasService) continue;
    const before = lines.length;
    pushAnswer(lines, "Service", rawPayload[key], seen, valueSeen, lead);
    if (lines.length > before) hasService = true;
  }

  for (const key of sortedForminatorKeys(rawPayload, "hidden")) {
    if (hasService) continue;
    const before = lines.length;
    pushAnswer(lines, "Service", rawPayload[key], seen, valueSeen, lead);
    if (lines.length > before) hasService = true;
  }

  for (const key of sortedForminatorKeys(rawPayload, "checkbox")) {
    pushAnswer(lines, "Services", rawPayload[key], seen, valueSeen, lead);
  }

  for (const key of sortedForminatorKeys(rawPayload, "address")) {
    pushAnswer(lines, "Address", rawPayload[key], seen, valueSeen, lead);
  }

  for (const key of sortedForminatorKeys(rawPayload, "number")) {
    const text = String(rawPayload[key] ?? "").trim();
    if (/^\d{4}$/.test(text)) {
      pushAnswer(lines, "Postcode", text, seen, valueSeen, lead);
    }
  }

  for (const key of sortedForminatorKeys(rawPayload, "textarea")) {
    pushAnswer(lines, "Message", rawPayload[key], seen, valueSeen, lead, {
      allowLongText: true,
      skipMessageMatch: true,
    });
  }

  return lines;
}

function collectFacebookAnswers(
  rawPayload: Record<string, unknown>,
  lead: LeadFormContext | null,
): FormAnswer[] {
  const lines: FormAnswer[] = [];
  const seen = new Set<string>();
  const valueSeen = new Set<string>();
  const fieldData = rawPayload.field_data;

  if (!Array.isArray(fieldData)) return lines;

  for (const entry of fieldData) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { name?: string; values?: unknown[] };
    const name = String(record.name ?? "").trim();
    if (!name || FACEBOOK_CONTACT_FIELDS.has(name.toLowerCase())) continue;
    pushAnswer(lines, name, record.values?.[0], seen, valueSeen, null);
  }

  return lines;
}

function collectGenericAnswers(
  rawPayload: Record<string, unknown>,
  lead: LeadFormContext | null,
): FormAnswer[] {
  const lines: FormAnswer[] = [];
  const seen = new Set<string>();
  const valueSeen = new Set<string>();

  for (const [key, value] of Object.entries(rawPayload)) {
    if (SKIP_PAYLOAD_KEYS.has(key)) continue;
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    if (FORMINATOR_FIELD_KEY.test(key)) continue;
    if (!/^(suburb|postcode|post_code|location|city|address|job_address)$/i.test(key)) {
      continue;
    }
    pushAnswer(lines, key, value, seen, valueSeen, lead);
  }

  return lines;
}

export function formatLeadFormAnswers(
  rawPayload: Record<string, unknown> = {},
  lead: LeadFormContext | null = null,
): FormAnswer[] {
  if (!rawPayload || typeof rawPayload !== "object") return [];

  if (isForminatorPayload(rawPayload)) {
    return collectForminatorAnswers(rawPayload, lead);
  }

  if (Array.isArray(rawPayload.field_data) && rawPayload.field_data.length > 0) {
    return collectFacebookAnswers(rawPayload, lead);
  }

  return collectGenericAnswers(rawPayload, lead);
}

export function formatLeadFormAnswersText(
  rawPayload: Record<string, unknown> = {},
  lead: LeadFormContext | null = null,
): string {
  return formatLeadFormAnswers(rawPayload, lead)
    .map((item) => `${item.label}: ${item.value}`)
    .join("\n");
}

function fieldDataValue(
  rawPayload: Record<string, unknown>,
  names: string[],
): string {
  const fieldData = rawPayload.field_data;
  if (!Array.isArray(fieldData)) return "";

  const wanted = names.map((name) => name.toLowerCase());
  for (const entry of fieldData) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as { name?: string; values?: unknown[] };
    const name = String(record.name ?? "").toLowerCase();
    if (!wanted.includes(name)) continue;
    const value = record.values?.[0];
    return value == null ? "" : String(value).trim();
  }

  return "";
}

export function extractAddressFromPayload(
  rawPayload: Record<string, unknown> = {},
): string {
  let suburb = fieldDataValue(rawPayload, ["suburb", "city"]);
  let postcode = fieldDataValue(rawPayload, ["postcode", "post_code"]);
  let address = "";

  if (!suburb || !postcode) {
    for (const [field, value] of Object.entries(rawPayload)) {
      if (value == null || value === "") continue;
      const text = String(value).trim();
      if (!text) continue;
      const normalized = field.toLowerCase();

      if (!suburb && (normalized.includes("suburb") || normalized.includes("city"))) {
        suburb = text;
      } else if (
        !postcode &&
        (normalized.includes("postcode") || normalized.includes("post_code"))
      ) {
        postcode = text;
      } else if (!address && normalized.includes("address")) {
        address = text;
      } else if (!suburb && /^text[-_]?\d+$/i.test(field)) {
        suburb = text;
      } else if (!postcode && /^number[-_]?\d+$/i.test(field) && /^\d{4}$/.test(text)) {
        postcode = text;
      }
    }
  }

  if (suburb && postcode) return `${suburb} ${postcode}`;
  if (suburb) return suburb;
  if (postcode) return postcode;
  if (address) return address;

  return "";
}
