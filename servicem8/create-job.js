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

function fieldDataValue(payload, names) {
  const fieldData = payload.field_data;
  if (!Array.isArray(fieldData)) return "";

  const wanted = names.map((name) => name.toLowerCase());
  for (const entry of fieldData) {
    const name = String(entry?.name ?? "").toLowerCase();
    if (!wanted.includes(name)) continue;
    const value = entry?.values?.[0];
    return value == null ? "" : String(value).trim();
  }

  return "";
}

function isStreetPayloadField(field) {
  const normalized = field.toLowerCase().replace(/_/g, " ");
  if (normalized.includes("email") || normalized.includes("page url")) return false;
  if (normalized === "address" || normalized === "job address") return true;
  if (normalized.includes("address")) return true;
  return /^address[-_]?\d+$/i.test(field);
}

/** ServiceM8 rejects job_address / billing_address over 500 characters. */
const SERVICEM8_ADDRESS_MAX_LENGTH = 500;
const PLAUSIBLE_STREET_MAX_LENGTH = 200;

function isPlausibleStreetAddress(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  if (text.length > PLAUSIBLE_STREET_MAX_LENGTH) return false;
  if ((text.match(/\n/g) || []).length >= 2) return false;
  return true;
}

function clampServiceM8Address(address) {
  const text = String(address || "").trim();
  if (!text) return "";
  if (text.length <= SERVICEM8_ADDRESS_MAX_LENGTH) return text;
  return text.slice(0, SERVICEM8_ADDRESS_MAX_LENGTH).trim();
}

function isSuburbPayloadField(field) {
  const normalized = field.toLowerCase().replace(/_/g, " ");
  return (
    normalized === "suburb" ||
    normalized === "city" ||
    normalized.includes("suburb")
  );
}

function isPostcodePayloadField(field) {
  const normalized = field.toLowerCase().replace(/_/g, " ");
  return (
    normalized === "postcode" ||
    normalized === "post code" ||
    normalized === "post_code" ||
    normalized.includes("postcode")
  );
}

function joinJobAddress(street, suburb, postcode) {
  const streetText = String(street || "").trim();
  const suburbText = String(suburb || "").trim();
  const postcodeText = String(postcode || "").trim();
  const parts = [];

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

function extractAddressFromPayload(payload) {
  let street = "";
  let suburb = fieldDataValue(payload, ["suburb", "city"]);
  let postcode = fieldDataValue(payload, ["postcode", "post_code"]);

  for (const [field, value] of Object.entries(payload)) {
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

function extractAddress(lead) {
  return extractAddressFromPayload(lead.raw_payload || {});
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
