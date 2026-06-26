import { formatDisplayText } from "./lead-form-answers.ts";

export type FacebookLeadgenChange = {
  leadgen_id: string;
  page_id?: string;
  form_id?: string;
};

export type FacebookLeadRow = {
  source: "facebook";
  external_id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  service_requested: string | null;
  message: string | null;
  raw_payload: Record<string, unknown>;
  received_at: string;
};

type FieldEntry = { name?: string; values?: string[] };

const META_TEST_LEADGEN_IDS = new Set([
  "0",
  "444444444",
  "1234567890",
  "123456789",
]);

function field(fields: FieldEntry[], names: string[]): string {
  const wanted = names.map((name) => name.toLowerCase());
  const found = fields.find((entry) =>
    wanted.includes(String(entry.name ?? "").toLowerCase())
  );
  const raw = found?.values?.[0]?.trim() ?? "";
  return raw ? formatDisplayText(raw) : "";
}

export function isMetaTestLeadgenId(leadgenId: string): boolean {
  const id = leadgenId.trim();
  return META_TEST_LEADGEN_IDS.has(id) || id.startsWith("test_");
}

export function buildMetaTestLeadRow(
  change: FacebookLeadgenChange,
): FacebookLeadRow {
  const receivedAt = new Date().toISOString();
  return {
    source: "facebook",
    external_id: `meta-test-${change.leadgen_id}`,
    full_name: "Meta Webhook Test Lead",
    email: "test@example.com",
    phone: "0400000000",
    service_requested: "Webhook test (not a real submission)",
    message:
      "Created from Meta's leadgen test button. Use Lead Ads form preview for a real test.",
    raw_payload: {
      meta_test: true,
      leadgen_id: change.leadgen_id,
      page_id: change.page_id ?? null,
      form_id: change.form_id ?? null,
    },
    received_at: receivedAt,
  };
}

/** Saved when Graph API cannot return lead details (bad token, test ID, etc.) */
export function buildWebhookOnlyLeadRow(
  change: FacebookLeadgenChange,
  graphError: string,
): FacebookLeadRow {
  const receivedAt = new Date().toISOString();
  const isTest = isMetaTestLeadgenId(change.leadgen_id);

  return {
    source: "facebook",
    external_id: isTest ? `meta-test-${change.leadgen_id}` : change.leadgen_id,
    full_name: isTest ? "Meta Webhook Test Lead" : null,
    email: isTest ? "test@example.com" : null,
    phone: isTest ? "0400000000" : null,
    service_requested: change.form_id ? `Form ID ${change.form_id}` : null,
    message: isTest
      ? "Meta test webhook — use Lead Ads form preview for a real test."
      : `Lead received from Facebook but details could not be fetched. Fix META_PAGE_ACCESS_TOKEN (needs leads_retrieval). Error: ${graphError}`,
    raw_payload: {
      leadgen_id: change.leadgen_id,
      page_id: change.page_id ?? null,
      form_id: change.form_id ?? null,
      graph_fetch_error: graphError,
      meta_test: isTest,
    },
    received_at: receivedAt,
  };
}

function pushLeadgenChange(
  changes: FacebookLeadgenChange[],
  value: Record<string, unknown>,
): void {
  const leadgenId = String(value.leadgen_id ?? "").trim();
  if (!leadgenId) return;

  changes.push({
    leadgen_id: leadgenId,
    page_id: value.page_id ? String(value.page_id) : undefined,
    form_id: value.form_id ? String(value.form_id) : undefined,
  });
}

export function extractLeadgenChanges(
  payload: Record<string, unknown>,
): FacebookLeadgenChange[] {
  const changes: FacebookLeadgenChange[] = [];
  const entries = Array.isArray(payload.entry) ? payload.entry : [];

  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const entryChanges = Array.isArray((entry as { changes?: unknown }).changes)
      ? (entry as { changes: unknown[] }).changes
      : [];

    for (const change of entryChanges) {
      if (!change || typeof change !== "object") continue;
      const record = change as { field?: string; value?: Record<string, unknown> };
      if (record.field !== "leadgen" || !record.value) continue;
      pushLeadgenChange(changes, record.value);
    }
  }

  if (changes.length > 0) return changes;

  if (payload.field === "leadgen" && payload.value && typeof payload.value === "object") {
    pushLeadgenChange(changes, payload.value as Record<string, unknown>);
  }

  return changes;
}

export function normalizeFacebookLead(
  lead: Record<string, unknown>,
  options?: { form_name?: string },
): FacebookLeadRow {
  const fields = Array.isArray(lead.field_data)
    ? (lead.field_data as FieldEntry[])
    : [];

  const externalId = String(lead.id ?? "").trim();
  if (!externalId) {
    throw new Error("Facebook lead missing id");
  }

  const receivedAt = lead.created_time
    ? String(lead.created_time)
    : new Date().toISOString();

  const serviceFromFields = field(fields, [
    "service",
    "service_requested",
    "service_required",
  ]);
  const serviceRequested = serviceFromFields ||
    (options?.form_name?.trim() || "") ||
    null;

  return {
    source: "facebook",
    external_id: externalId,
    full_name: field(fields, ["full_name", "name", "first_name"]) || null,
    email: field(fields, ["email"]) || null,
    phone: field(fields, ["phone_number", "phone", "mobile"]) || null,
    service_requested: serviceRequested,
    message: field(fields, ["message", "comments", "details"]) || null,
    raw_payload: {
      ...lead,
      form_name: options?.form_name ?? null,
    },
    received_at: receivedAt,
  };
}
