"use strict";

// Paste this ENTIRE file into ServiceM8 → Add-on → Edit Function.
// ServiceM8 only supports one function file (no require/import of other files).

const DASHBOARD_URL = "https://leaddashboard-production-adcb.up.railway.app";
const SERVICEM8_API = "https://api.servicem8.com/api_1.0";

function splitName(fullName) {
  var parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: "Lead", last: "" };
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts[0], last: parts.slice(1).join(" ") };
}

function extractAddress(lead) {
  var payload = lead.raw_payload || {};
  var keys = ["suburb", "city", "location", "address", "job_address"];
  var field, value, i, j;

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

async function createServiceM8JobFromLead(accessToken, lead) {
  var names = splitName(lead.full_name);
  var first = names.first;
  var last = names.last;
  var jobDescription = buildJobDescription(lead);
  var jobAddress = extractAddress(lead);
  var companyName = String(lead.full_name || "").trim() || "Unknown Lead";

  var companyUuid = await servicem8Post(accessToken, "company.json", {
    name: companyName,
  });

  var jobBody = {
    status: "Quote",
    company_uuid: companyUuid,
    job_description: jobDescription,
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

  return { jobUuid: jobUuid, companyUuid: companyUuid };
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

    if (lead.servicem8_job_uuid) {
      return {
        eventResponse: JSON.stringify({
          ok: true,
          already_pushed: true,
          job_uuid: lead.servicem8_job_uuid,
          job_url: "https://go.servicem8.com/openjob/" + lead.servicem8_job_uuid,
        }),
      };
    }

    try {
      var result = await createServiceM8JobFromLead(accessToken, lead);
      return {
        eventResponse: JSON.stringify({
          ok: true,
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
