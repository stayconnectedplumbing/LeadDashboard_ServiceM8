"use strict";

// Paste this ENTIRE file into ServiceM8 → Add-on → Edit Function.

const DASHBOARD_URL = "https://leaddashboard-production-adcb.up.railway.app";
const SERVICEM8_API = "https://api.servicem8.com/api_1.0";

function splitName(fullName) {
  var parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Lead", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function escapeFilterValue(value) {
  return String(value).replace(/'/g, "''");
}

function extractAddress(lead) {
  var payload = lead.raw_payload || {};
  var keys = ["suburb", "city", "location", "address", "job_address"];
  var field, value, i;

  for (i = 0; i < keys.length; i++) {
    for (field in payload) {
      if (!Object.prototype.hasOwnProperty.call(payload, field)) continue;
      value = payload[field];
      if (
        field.toLowerCase().indexOf(keys[i]) !== -1 &&
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
  var lines = [];
  if (lead.service_requested) lines.push("Service: " + lead.service_requested);
  if (lead.message) lines.push("Message: " + lead.message);
  if (lead.notes) lines.push("Notes: " + lead.notes);
  lines.push("Lead source: " + lead.source);
  lines.push("Lead ID: " + lead.id);
  return lines.join("\n") || "New lead from dashboard";
}

function isDuplicateNameError(message) {
  return String(message).toLowerCase().indexOf("name must be unique") !== -1;
}

async function servicem8Get(accessToken, path, query) {
  var url = SERVICEM8_API + "/" + path;
  if (query) url += "?" + query;

  var response = await fetch(url, {
    headers: { Authorization: "Bearer " + accessToken },
  });

  var responseText = await response.text();
  if (!response.ok) {
    throw new Error("ServiceM8 GET " + path + " failed (" + response.status + "): " + responseText);
  }

  if (!responseText) return [];
  var parsed = JSON.parse(responseText);
  return Array.isArray(parsed) ? parsed : [];
}

async function servicem8Post(accessToken, path, body) {
  var response = await fetch(SERVICEM8_API + "/" + path, {
    method: "POST",
    headers: {
      Authorization: "Bearer " + accessToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  var responseText = await response.text();
  if (!response.ok) {
    throw new Error("ServiceM8 " + path + " failed (" + response.status + "): " + responseText);
  }

  var recordUuid = response.headers.get("x-record-uuid");
  if (!recordUuid) {
    throw new Error("ServiceM8 " + path + " did not return x-record-uuid");
  }

  return recordUuid;
}

async function findCompanyByName(accessToken, name) {
  var filter = "$filter=" + encodeURIComponent("name eq '" + escapeFilterValue(name) + "'");
  var companies = await servicem8Get(accessToken, "company.json", filter);
  return companies[0] && companies[0].uuid ? companies[0].uuid : null;
}

async function findOrCreateCompany(accessToken, name) {
  var existing = await findCompanyByName(accessToken, name);
  if (existing) return existing;

  try {
    return await servicem8Post(accessToken, "company.json", { name: name });
  } catch (error) {
    var message = error instanceof Error ? error.message : String(error);
    if (isDuplicateNameError(message)) {
      var retry = await findCompanyByName(accessToken, name);
      if (retry) return retry;
    }
    throw error;
  }
}

async function findJobByLeadId(accessToken, leadId) {
  try {
    var poFilter = "$filter=" + encodeURIComponent(
      "purchase_order_number eq '" + escapeFilterValue(leadId) + "'"
    );
    var jobsByPo = await servicem8Get(accessToken, "job.json", poFilter);
    return jobsByPo[0] && jobsByPo[0].uuid ? jobsByPo[0].uuid : null;
  } catch (e) {
    return null;
  }
}

async function createServiceM8JobFromLead(accessToken, lead) {
  if (lead.servicem8_job_uuid) {
    return {
      jobUuid: lead.servicem8_job_uuid,
      alreadyExists: true,
    };
  }

  var existingJob = await findJobByLeadId(accessToken, lead.id);
  if (existingJob) {
    return {
      jobUuid: existingJob,
      alreadyExists: true,
    };
  }

  var names = splitName(lead.full_name);
  var first = names.first;
  var last = names.last;
  var jobDescription = buildJobDescription(lead);
  var jobAddress = extractAddress(lead);
  var companyName = String(lead.full_name || "").trim() || "Unknown Lead";

  var companyUuid = await findOrCreateCompany(accessToken, companyName);

  var jobBody = {
    status: "Quote",
    company_uuid: companyUuid,
    job_description: jobDescription,
    purchase_order_number: lead.id,
  };
  if (jobAddress) jobBody.job_address = jobAddress;

  var jobUuid = await servicem8Post(accessToken, "job.json", jobBody);

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

  return {
    jobUuid: jobUuid,
    companyUuid: companyUuid,
    alreadyExists: false,
  };
}

exports.handler = async function (event) {
  if (event.eventName === "push_lead_to_job") {
    var accessToken = event.auth && event.auth.accessToken;
    if (!accessToken) {
      return { eventResponse: JSON.stringify({ error: "Missing ServiceM8 access token" }) };
    }

    var lead = event.eventArgs && event.eventArgs.lead;
    if (!lead || !lead.id) {
      return { eventResponse: JSON.stringify({ error: "Lead data is required" }) };
    }

    try {
      var result = await createServiceM8JobFromLead(accessToken, lead);
      return {
        eventResponse: JSON.stringify({
          ok: true,
          already_pushed: Boolean(result.alreadyExists),
          job_uuid: result.jobUuid,
          job_url: "https://go.servicem8.com/openjob/" + result.jobUuid,
        }),
      };
    } catch (error) {
      var message = error instanceof Error ? error.message : String(error);
      return { eventResponse: JSON.stringify({ error: message }) };
    }
  }

  if (event.eventName !== "show_lead_dashboard") {
    return {};
  }

  var html =
    "<!DOCTYPE html>" +
    "<html lang=\"en\">" +
    "<head>" +
    "<meta charset=\"UTF-8\" />" +
    "<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />" +
    "<link rel=\"stylesheet\" href=\"https://platform.servicem8.com/sdk/1.0/sdk.css\" />" +
    "<script src=\"https://platform.servicem8.com/sdk/1.0/sdk.js\"></script>" +
    "<script>" +
    "var client = SMClient.init();" +
    "client.resizeWindow(1400, 900);" +
    "window.addEventListener(\"message\", function (event) {" +
    "  if (!event.data || event.data.type !== \"PUSH_LEAD\") return;" +
    "  client.invoke(\"push_lead_to_job\", { lead: event.data.payload })" +
    "    .then(function (result) {" +
    "      var parsed = result;" +
    "      if (typeof result === \"string\") {" +
    "        try { parsed = JSON.parse(result); } catch (e) { parsed = { raw: result }; }" +
    "      }" +
    "      event.source.postMessage({" +
    "        type: \"PUSH_LEAD_RESULT\"," +
    "        requestId: event.data.requestId," +
    "        result: parsed" +
    "      }, event.origin);" +
    "    })" +
    "    .catch(function (error) {" +
    "      event.source.postMessage({" +
    "        type: \"PUSH_LEAD_RESULT\"," +
    "        requestId: event.data.requestId," +
    "        error: error && error.message ? error.message : String(error)" +
    "      }, event.origin);" +
    "    });" +
    "});" +
    "</script>" +
    "<style>" +
    "html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; background: #f4f6f8; }" +
    "iframe { width: 100%; height: 100%; border: 0; display: block; }" +
    "</style>" +
    "</head>" +
    "<body>" +
    "<iframe src=\"" + DASHBOARD_URL + "\" title=\"Lead Dashboard\"></iframe>" +
    "</body>" +
    "</html>";

  return {
    eventResponse: html,
  };
};

    