// Reference copy only — do NOT upload this file to ServiceM8 separately.
// ServiceM8's add-on editor accepts ONE file: use addon-function.js (logic is inlined there).
// This file mirrors the same job-creation logic used by the Supabase Edge Function.

"use strict";

const SERVICEM8_API = "https://api.servicem8.com/api_1.0";

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Lead", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function extractAddress(lead) {
  const payload = lead.raw_payload || {};
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

function buildJobDescription(lead) {
  const lines = [
    lead.service_requested ? `Service: ${lead.service_requested}` : "",
    lead.message ? `Message: ${lead.message}` : "",
    lead.notes ? `Notes: ${lead.notes}` : "",
    `Lead source: ${lead.source}`,
    `Lead ID: ${lead.id}`,
  ].filter(Boolean);
  return lines.join("\n") || "New lead from dashboard";
}

async function servicem8Post(accessToken, path, body) {
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

async function createServiceM8JobFromLead(accessToken, lead) {
  const { first, last } = splitName(lead.full_name);
  const jobDescription = buildJobDescription(lead);
  const jobAddress = extractAddress(lead);
  const companyName = (lead.full_name || "").trim() || "Unknown Lead";

  const companyUuid = await servicem8Post(accessToken, "company.json", {
    name: companyName,
  });

  const jobBody = {
    status: "Quote",
    company_uuid: companyUuid,
    job_description: jobDescription,
  };
  if (jobAddress) jobBody.job_address = jobAddress;

  const jobUuid = await servicem8Post(accessToken, "job.json", jobBody);

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

  return { jobUuid, companyUuid };
}

module.exports = { createServiceM8JobFromLead };
