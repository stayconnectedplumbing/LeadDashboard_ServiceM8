import { parseAustralianLocalTime } from "./australian-time.ts";

type FieldEntry = { name?: string; label?: string; id?: string; value?: unknown };
type Payload = Record<string, unknown>;

const FORMINATOR_META = new Set([
  "referer_url",
  "_wp_http_referer",
  "page_id",
  "form_type",
  "current_url",
  "render_id",
  "_forminator_user_ip",
  "form_title",
  "entry_time",
]);

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/_/g, "-");
}

function isForminatorPayload(payload: Payload): boolean {
  if ("form_title" in payload || "entry_time" in payload) return true;
  return Object.keys(payload).some((key) =>
    /^(name|email|phone|textarea|text|select|hidden|number|address|url)-\d+$/i.test(
      normalizeKey(key),
    )
  );
}

function forminatorField(payload: Payload, prefixes: string[]): string {
  for (const [key, value] of Object.entries(payload)) {
    if (FORMINATOR_META.has(key)) continue;
    const normalized = normalizeKey(key);
    for (const prefix of prefixes) {
      if (normalized === prefix || normalized.startsWith(`${prefix}-`)) {
        if (value != null && value !== "") {
          return Array.isArray(value) ? value.join(", ") : String(value);
        }
      }
    }
  }
  return "";
}

function forminatorFieldByLabel(payload: Payload, labels: string[]): string {
  for (const [key, value] of Object.entries(payload)) {
    if (FORMINATOR_META.has(key)) continue;
    const normalized = normalizeKey(key);
    for (const label of labels) {
      if (normalized.includes(label) && value != null && value !== "") {
        return String(value);
      }
    }
  }
  return "";
}

function forminatorTextareas(payload: Payload): string[] {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(payload)) {
    if (FORMINATOR_META.has(key)) continue;
    if (normalizeKey(key).startsWith("textarea-")) {
      const text = value == null ? "" : String(value).trim();
      if (text) parts.push(text);
    }
  }
  return parts;
}

function forminatorSuburb(payload: Payload): string {
  const byLabel = forminatorFieldByLabel(payload, [
    "suburb",
    "city",
    "location",
  ]);
  if (byLabel) return byLabel;

  return field(payload, ["suburb", "city", "location"]);
}

function forminatorMessage(payload: Payload): string {
  const parts: string[] = [];

  const suburb = forminatorSuburb(payload);
  if (suburb) parts.push(`Suburb: ${suburb}`);

  const additional = forminatorTextareas(payload).join("\n\n") ||
    field(payload, [
      "additional information",
      "additional_information",
      "message",
      "comments",
      "details",
    ]) ||
    forminatorFieldByLabel(payload, ["additional", "message", "comments"]);

  if (additional) parts.push(additional);

  const pageUrl = String(payload.current_url ?? payload.page_url ?? "").trim();
  if (pageUrl) parts.push(`Page: ${pageUrl}`);

  return parts.join("\n\n");
}

function forminatorSubmissionId(payload: Payload): string {
  const hiddenId = forminatorField(payload, ["hidden"]);
  if (hiddenId && /^\d+$/.test(hiddenId)) return hiddenId;

  const pageId = payload.page_id;
  const entryTime = payload.entry_time;
  if (pageId != null && entryTime != null) {
    return `${pageId}-${entryTime}`;
  }

  return "";
}

function field(data: Payload, names: string[]): string {
  if (!data || typeof data !== "object") return "";

  const wanted = names.map((name) => name.toLowerCase());

  for (const [key, value] of Object.entries(data)) {
    if (wanted.includes(key.toLowerCase()) && value != null && value !== "") {
      return Array.isArray(value) ? value.join(", ") : String(value);
    }
  }

  const fields = data.fields;
  if (Array.isArray(fields)) {
    for (const entry of fields as FieldEntry[]) {
      const label = String(entry.name || entry.label || entry.id || "")
        .toLowerCase();
      if (wanted.some((name) => label.includes(name) || name.includes(label))) {
        const value = entry.value;
        return value == null ? "" : String(value);
      }
    }
  }

  const fieldData = data.field_data;
  if (Array.isArray(fieldData)) {
    for (const entry of fieldData as { name?: string; values?: unknown[] }[]) {
      if (wanted.includes(String(entry.name ?? "").toLowerCase())) {
        const value = entry.values?.[0];
        return value == null ? "" : String(value);
      }
    }
  }

  return "";
}

function buildExternalId(payload: Payload, forminator: boolean): string {
  if (forminator) {
    const forminatorId = forminatorSubmissionId(payload);
    if (forminatorId) return forminatorId;
  }

  const id = payload.entry_id ??
    payload.entryId ??
    payload.submission_id ??
    payload.submissionId ??
    payload.id ??
    payload.token;

  if (id != null && id !== "") return String(id);
  return `wp-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
}

export function normalizeWordPressPayload(payload: Payload) {
  const forminator = isForminatorPayload(payload);

  const fullName = (forminator
    ? forminatorField(payload, ["name"]) ||
      forminatorFieldByLabel(payload, ["name"])
    : field(payload, [
      "full_name",
      "name",
      "your-name",
      "your name",
      "customer name",
    ])) ||
    field(payload, ["first_name", "firstname", "fname"]);

  const email = (forminator
    ? forminatorField(payload, ["email"]) ||
      forminatorFieldByLabel(payload, ["email"])
    : field(payload, ["email", "your-email", "e-mail"]));

  const phone = (forminator
    ? forminatorField(payload, ["phone"]) ||
      forminatorFieldByLabel(payload, ["phone", "mobile", "tel"])
    : field(payload, [
      "phone",
      "phone number",
      "phone_number",
      "mobile",
      "tel",
      "your-phone",
    ]));

  const serviceRequested = (forminator
    ? forminatorField(payload, ["select", "radio"]) ||
      forminatorFieldByLabel(payload, ["service"]) ||
      field(payload, ["service type", "service_type"])
    : field(payload, [
      "service",
      "service_requested",
      "service type",
      "subject",
      "requested service",
      "job description",
    ]));

  const message = forminator
    ? forminatorMessage(payload)
    : field(payload, [
      "message",
      "comments",
      "details",
      "your-message",
      "additional information",
      "enquiry",
      "project summary",
    ]);

  const receivedAtRaw = forminator
    ? payload.entry_time ?? payload.submitted_at
    : payload.date ?? payload.submitted_at ?? payload.created_at;

  const receivedAt =
    parseAustralianLocalTime(receivedAtRaw) ?? new Date().toISOString();

  return {
    source: "wordpress" as const,
    external_id: buildExternalId(payload, forminator),
    full_name: fullName || null,
    email: email || null,
    phone: phone || null,
    service_requested: serviceRequested || null,
    message: message || null,
    raw_payload: payload,
    received_at: String(receivedAt),
  };
}
