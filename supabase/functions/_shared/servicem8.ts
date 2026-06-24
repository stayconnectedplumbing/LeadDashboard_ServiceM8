import { resolveServiceM8CategoryUuid } from "./servicem8-categories.ts";
import {
  extractAddressFromPayload,
  formatLeadFormAnswers,
} from "./lead-form-answers.ts";

const SERVICEM8_API = "https://api.servicem8.com/api_1.0";
const GENERAL_WORK_TEMPLATE_MATCH = /general\s+work/i;

export type LeadRecord = {
  id: string;
  source: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  service_requested?: string | null;
  message?: string | null;
  notes?: string | null;
  raw_payload?: Record<string, unknown>;
  servicem8_job_uuid?: string | null;
};

export type PushJobResult = {
  jobUuid: string;
  companyUuid?: string | null;
  alreadyExists?: boolean;
};

function splitName(fullName?: string | null): { first: string; last: string } {
  const parts = (fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Lead", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function escapeFilterValue(value: string): string {
  return value.replace(/'/g, "''");
}

function extractAddress(lead: LeadRecord): string {
  return extractAddressFromPayload(lead.raw_payload ?? {});
}

function buildJobDescription(lead: LeadRecord): string {
  const formAnswers = formatLeadFormAnswers(lead.raw_payload ?? {}, lead);
  const lines = [
    lead.service_requested ? `Service: ${lead.service_requested}` : "",
    ...formAnswers.map((item) => `${item.label}: ${item.value}`),
    lead.message && formAnswers.length === 0 ? `Message: ${lead.message}` : "",
    lead.notes ? `Notes: ${lead.notes}` : "",
    `Lead source: ${lead.source}`,
    `Lead ID: ${lead.id}`,
  ].filter(Boolean);
  return lines.join("\n") || "New lead from dashboard";
}

function isDuplicateNameError(message: string): boolean {
  return message.toLowerCase().includes("name must be unique");
}

async function servicem8Get(
  accessToken: string,
  path: string,
  query?: string,
): Promise<Record<string, unknown>[]> {
  const url = query
    ? `${SERVICEM8_API}/${path}?${query}`
    : `${SERVICEM8_API}/${path}`;

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `ServiceM8 GET ${path} failed (${response.status}): ${responseText}`,
    );
  }

  if (!responseText) return [];
  const parsed = JSON.parse(responseText);
  return Array.isArray(parsed) ? parsed : [];
}

async function servicem8Update(
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
): Promise<void> {
  const response = await fetch(`${SERVICEM8_API}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `ServiceM8 POST ${path} failed (${response.status}): ${responseText}`,
    );
  }
}

async function servicem8Post(
  accessToken: string,
  path: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(`${SERVICEM8_API}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `ServiceM8 ${path} failed (${response.status}): ${responseText}`,
    );
  }

  const recordUuid = response.headers.get("x-record-uuid");
  if (!recordUuid) {
    throw new Error(`ServiceM8 ${path} did not return x-record-uuid`);
  }

  return recordUuid;
}

async function findCompanyByName(
  accessToken: string,
  name: string,
): Promise<string | null> {
  const filter = `$filter=${encodeURIComponent(
    `name eq '${escapeFilterValue(name)}'`,
  )}`;
  const companies = await servicem8Get(accessToken, "company.json", filter);
  const uuid = companies[0]?.uuid;
  return typeof uuid === "string" ? uuid : null;
}

async function findOrCreateCompany(
  accessToken: string,
  name: string,
): Promise<string> {
  const existing = await findCompanyByName(accessToken, name);
  if (existing) return existing;

  try {
    return await servicem8Post(accessToken, "company.json", { name });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isDuplicateNameError(message)) {
      const retry = await findCompanyByName(accessToken, name);
      if (retry) return retry;
    }
    throw error;
  }
}

function isTemplateActive(template: Record<string, unknown>): boolean {
  const active = template.active;
  return active !== 0 && active !== "0";
}

function templateNameRank(name: string): number {
  const trimmed = name.trim();
  if (/^(\d+\.\s*)?general work$/i.test(trimmed)) return 0;
  if (/^general work\b/i.test(trimmed)) return 1;
  return 2;
}

async function resolveGeneralWorkTemplateCandidates(
  accessToken: string,
): Promise<string[]> {
  const fromEnv = Deno.env.get("SERVICEM8_JOB_TEMPLATE_UUID")?.trim();
  if (fromEnv) return [fromEnv];

  const templates = await servicem8Get(accessToken, "jobtemplate.json");
  const matches = templates
    .filter(isTemplateActive)
    .filter((template) => {
      const name = typeof template.name === "string" ? template.name : "";
      return GENERAL_WORK_TEMPLATE_MATCH.test(name);
    })
    .sort((left, right) => {
      const leftName = String(left.name || "");
      const rightName = String(right.name || "");
      const rankDiff =
        templateNameRank(leftName) - templateNameRank(rightName);
      if (rankDiff !== 0) return rankDiff;
      return leftName.localeCompare(rightName);
    });

  const uuids = matches
    .map((template) => template.uuid)
    .filter((uuid): uuid is string => typeof uuid === "string");

  if (uuids.length === 0) {
    throw new Error(
      'Active General Work job template not found. Enable Job Templates in ServiceM8 and ensure an active template includes "General Work" in the name.',
    );
  }

  return uuids;
}

async function servicem8CreateJobFromTemplate(
  accessToken: string,
  templateUuid: string,
  body: Record<string, unknown>,
): Promise<string> {
  const path = `jobtemplate/${templateUuid}/job.json`;
  const response = await fetch(`${SERVICEM8_API}/${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(
      `ServiceM8 ${path} failed (${response.status}): ${responseText}`,
    );
  }

  const headerUuid = response.headers.get("x-record-uuid");
  if (headerUuid) return headerUuid;

  if (responseText) {
    const parsed = JSON.parse(responseText) as Record<string, unknown>;
    if (typeof parsed.jobUUID === "string") return parsed.jobUUID;
    if (typeof parsed.job_uuid === "string") return parsed.job_uuid;
  }

  throw new Error(`ServiceM8 ${path} did not return a job UUID`);
}

function isTemplateNotFoundError(message: string): boolean {
  return message.includes("404") && message.includes("Job template not found");
}

async function createJobFromGeneralWorkTemplate(
  accessToken: string,
  templateBody: Record<string, unknown>,
): Promise<string> {
  const templateUuids = await resolveGeneralWorkTemplateCandidates(accessToken);
  let lastError: Error | null = null;

  for (const templateUuid of templateUuids) {
    try {
      return await servicem8CreateJobFromTemplate(
        accessToken,
        templateUuid,
        templateBody,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isTemplateNotFoundError(message)) {
        lastError = error instanceof Error ? error : new Error(message);
        continue;
      }
      throw error;
    }
  }

  throw (
    lastError ??
    new Error(
      'Active General Work job template not found. Enable Job Templates in ServiceM8 and ensure an active template includes "General Work" in the name.',
    )
  );
}

async function findJobByLeadId(
  accessToken: string,
  leadId: string,
): Promise<string | null> {
  try {
    const poFilter = `$filter=${encodeURIComponent(
      `purchase_order_number eq '${escapeFilterValue(leadId)}'`,
    )}`;
    const jobsByPo = await servicem8Get(accessToken, "job.json", poFilter);
    const poMatch = jobsByPo[0]?.uuid;
    return typeof poMatch === "string" ? poMatch : null;
  } catch {
    return null;
  }
}

export async function createServiceM8JobFromLead(
  accessToken: string,
  lead: LeadRecord,
): Promise<PushJobResult> {
  if (lead.servicem8_job_uuid) {
    return { jobUuid: lead.servicem8_job_uuid, alreadyExists: true };
  }

  const existingJob = await findJobByLeadId(accessToken, lead.id);
  if (existingJob) {
    return { jobUuid: existingJob, alreadyExists: true };
  }

  const { first, last } = splitName(lead.full_name);
  const jobDescription = buildJobDescription(lead);
  const jobAddress = extractAddress(lead);
  const companyName = lead.full_name?.trim() || "Unknown Lead";

  const companyUuid = await findOrCreateCompany(accessToken, companyName);

  const templateBody: Record<string, unknown> = {
    company_uuid: companyUuid,
    job_description: jobDescription,
  };
  if (jobAddress) templateBody.job_address = jobAddress;

  const jobUuid = await createJobFromGeneralWorkTemplate(
    accessToken,
    templateBody,
  );

  await servicem8Update(accessToken, `job/${jobUuid}.json`, {
    purchase_order_number: lead.id,
    category_uuid: resolveServiceM8CategoryUuid(
      lead.source,
      lead.raw_payload ?? {},
    ),
  });

  if (first || last || lead.email || lead.phone) {
    await servicem8Post(accessToken, "jobcontact.json", {
      job_uuid: jobUuid,
      first: first || "Lead",
      last: last || "",
      email: lead.email || "",
      mobile: lead.phone || "",
      type: "JOB",
      is_primary_contact: "1",
    });
  }

  return { jobUuid, companyUuid, alreadyExists: false };
}
