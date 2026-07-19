import { resolveLeadCategory } from "./lead-category.ts";

export type FormAnswer = { label: string; value: string };

export type LeadFormContext = {
  source?: string | null;
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
  "notification_text",
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

function isShowerRepairsLead(
  lead: LeadFormContext | null,
  rawPayload: Record<string, unknown> = {},
): boolean {
  if (lead?.source === "same_day_shower_repairs") return true;
  if (resolveLeadCategory(lead?.source ?? "", rawPayload) === "same_day_shower_repairs") {
    return true;
  }

  const formTitle = String(rawPayload.form_title ?? "").toLowerCase();
  if (formTitle.includes("shower")) return true;

  const subject = String(rawPayload.subject ?? "").toLowerCase();
  return subject.includes("shower quote");
}

function matchNotificationField(text: string, label: string): string {
  if (!text) return "";

  const inline = new RegExp(`(?:^|\\n)\\s*(?:${label})\\s*[:\\-|]\\s*(.+)`, "i");
  const inlineMatch = text.match(inline);
  if (inlineMatch) {
    return inlineMatch[1].split("\n")[0].replace(/\s*\|.*$/, "").trim();
  }

  const nextLine = new RegExp(
    `(?:^|\\n)\\s*(?:${label})\\s*:?\\s*\\r?\\n\\s*(.+)`,
    "i",
  );
  const nextLineMatch = text.match(nextLine);
  if (nextLineMatch) {
    return nextLineMatch[1].split("\n")[0].replace(/\s*\|.*$/, "").trim();
  }

  return "";
}

function firstForminatorFieldValue(
  rawPayload: Record<string, unknown>,
  prefixes: string[],
): string {
  for (const prefix of prefixes) {
    for (const key of sortedForminatorKeys(rawPayload, prefix)) {
      const value = rawPayload[key];
      if (value == null || value === "") continue;
      const text = Array.isArray(value) ? value.join(", ") : String(value).trim();
      if (text) return text;
    }
  }
  return "";
}

function showerEmailText(rawPayload: Record<string, unknown>): string {
  return [rawPayload.notification_text, rawPayload.snippet, rawPayload.text_plain]
    .filter(Boolean)
    .join("\n");
}

function payloadFieldValue(
  rawPayload: Record<string, unknown>,
  labels: string[],
): string {
  for (const wanted of labels) {
    const target = wanted.toLowerCase();
    const direct = rawPayload[wanted];
    if (direct != null && String(direct).trim()) {
      return String(direct).trim();
    }
    for (const [key, value] of Object.entries(rawPayload)) {
      if (key.toLowerCase().replace(/_/g, " ") !== target) continue;
      if (value == null || value === "") continue;
      if (typeof value === "object") continue;
      const text = String(value).trim();
      if (text) return text;
    }
  }
  return "";
}

function appendShowerEmailAnswers(
  answers: FormAnswer[],
  rawPayload: Record<string, unknown>,
  lead: LeadFormContext | null,
): FormAnswer[] {
  if (!isShowerRepairsLead(lead, rawPayload)) return answers;

  const text = showerEmailText(rawPayload);
  const chooseService =
    payloadFieldValue(rawPayload, [
      "Choose Service",
      "choose_service",
      "Service",
      "service",
    ]) ||
    matchNotificationField(text, "Choose Service") ||
    firstForminatorFieldValue(rawPayload, ["select", "radio"]) ||
    matchNotificationField(text, "Service|Service Type|Job Description") ||
    lead?.service_requested ||
    "";
  const message =
    payloadFieldValue(rawPayload, ["Message", "message"]) ||
    matchNotificationField(
      text,
      "Message|Additional Information|Comments|Details",
    ) ||
    firstForminatorFieldValue(rawPayload, ["textarea"]) ||
    lead?.message ||
    "";

  const hasLabel = (label: string) =>
    answers.some((item) => item.label.toLowerCase() === label.toLowerCase());

  const extra: FormAnswer[] = [];

  if (chooseService && !hasLabel("Choose Service")) {
    extra.push({
      label: humanizeLabel("Choose Service"),
      value: formatDisplayText(chooseService),
    });
  }
  if (message && !hasLabel("Message")) {
    extra.push({
      label: humanizeLabel("Message"),
      value: formatDisplayText(message),
    });
  }

  return extra.length ? [...answers, ...extra] : answers;
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

  let answers: FormAnswer[] = [];

  if (isForminatorPayload(rawPayload)) {
    answers = collectForminatorAnswers(rawPayload, lead);
  } else if (
    Array.isArray(rawPayload.field_data) &&
    rawPayload.field_data.length > 0
  ) {
    answers = collectFacebookAnswers(rawPayload, lead);
  } else {
    answers = collectGenericAnswers(rawPayload, lead);
  }

  return appendShowerEmailAnswers(answers, rawPayload, lead);
}

export function extractServiceRequiredForJob(
  rawPayload: Record<string, unknown> = {},
  lead: LeadFormContext | null = null,
): string {
  const fromFieldData = fieldDataValue(rawPayload, [
    "service_required",
    "service_requested",
    "service",
  ]);
  if (fromFieldData) return formatDisplayText(fromFieldData);

  if (isForminatorPayload(rawPayload)) {
    for (const prefix of ["select", "radio", "hidden"]) {
      for (const key of sortedForminatorKeys(rawPayload, prefix)) {
        const text = String(rawPayload[key] ?? "").trim();
        if (text && isHumanReadableAnswer(text)) {
          return formatDisplayText(text);
        }
      }
    }
  }

  const serviceRequested = lead?.service_requested?.trim() ?? "";
  const formName = String(rawPayload.form_name ?? "").trim();
  if (serviceRequested && serviceRequested !== formName) {
    return formatDisplayText(serviceRequested);
  }

  return "";
}

export function extractMessageForJob(
  rawPayload: Record<string, unknown> = {},
  lead: LeadFormContext | null = null,
): string {
  const answers = formatLeadFormAnswers(rawPayload, lead);
  const messageAnswer = answers.find(
    (item) => item.label.toLowerCase() === "message",
  );
  if (messageAnswer?.value) return messageAnswer.value;

  const message = lead?.message?.trim() ?? "";
  return message ? formatDisplayText(message) : "";
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

/** ServiceM8 rejects job_address / billing_address over 500 characters. */
export const SERVICEM8_ADDRESS_MAX_LENGTH = 500;

/** Real street lines are short; long multi-line text is usually a message pasted into Address. */
const PLAUSIBLE_STREET_MAX_LENGTH = 200;

function isStreetPayloadField(field: string): boolean {
  const normalized = field.toLowerCase().replace(/_/g, " ");
  if (normalized.includes("email") || normalized.includes("page url")) return false;
  if (normalized === "address" || normalized === "job address") return true;
  if (normalized.includes("address")) return true;
  return /^address[-_]?\d+$/i.test(field);
}

export function isPlausibleStreetAddress(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.length > PLAUSIBLE_STREET_MAX_LENGTH) return false;
  if ((text.match(/\n/g) || []).length >= 2) return false;
  return true;
}

export function clampServiceM8Address(address: string): string {
  const text = String(address || "").trim();
  if (!text) return "";
  if (text.length <= SERVICEM8_ADDRESS_MAX_LENGTH) return text;
  return text.slice(0, SERVICEM8_ADDRESS_MAX_LENGTH).trim();
}

function isSuburbPayloadField(field: string): boolean {
  const normalized = field.toLowerCase().replace(/_/g, " ");
  return (
    normalized === "suburb" ||
    normalized === "city" ||
    normalized.includes("suburb")
  );
}

function isPostcodePayloadField(field: string): boolean {
  const normalized = field.toLowerCase().replace(/_/g, " ");
  return (
    normalized === "postcode" ||
    normalized === "post code" ||
    normalized === "post_code" ||
    normalized.includes("postcode")
  );
}

function joinJobAddress(
  street: string,
  suburb: string,
  postcode: string,
): string {
  const streetText = String(street || "").trim();
  const suburbText = String(suburb || "").trim();
  const postcodeText = String(postcode || "").trim();
  const parts: string[] = [];

  if (streetText) parts.push(streetText);

  const locality = [suburbText, postcodeText].filter(Boolean).join(" ");
  if (!locality) return parts.join(", ");

  if (!streetText) {
    parts.push(locality);
    return parts.join(", ");
  }

  const streetLower = streetText.toLowerCase();
  const suburbIncluded = !suburbText || streetLower.includes(suburbText.toLowerCase());
  const postcodeIncluded =
    !postcodeText || streetLower.includes(postcodeText.toLowerCase());

  if (!(suburbIncluded && postcodeIncluded)) {
    parts.push(locality);
  }

  return parts.join(", ");
}

export function extractAddressFromPayload(
  rawPayload: Record<string, unknown> = {},
): string {
  let street = "";
  let suburb = fieldDataValue(rawPayload, ["suburb", "city"]);
  let postcode = fieldDataValue(rawPayload, ["postcode", "post_code"]);

  for (const [field, value] of Object.entries(rawPayload)) {
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    const text = String(value).trim();
    if (!text) continue;

    if (!street && isStreetPayloadField(field) && isPlausibleStreetAddress(text)) {
      street = text;
    } else if (!suburb && isSuburbPayloadField(field)) {
      suburb = text;
    } else if (!postcode && isPostcodePayloadField(field)) {
      postcode = text;
    } else if (!suburb && /^text[-_]?\d+$/i.test(field)) {
      suburb = text;
    } else if (!postcode && /^number[-_]?\d+$/i.test(field) && /^\d{4}$/.test(text)) {
      postcode = text;
    }
  }

  return clampServiceM8Address(joinJobAddress(street, suburb, postcode));
}
