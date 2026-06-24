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

var SKIP_PAYLOAD_KEYS = new Set([
  "field_data", "form_name", "form_id", "page_id", "leadgen_id", "ad_id",
  "adgroup_id", "created_time", "id", "meta_test", "graph_fetch_error",
  "current_url", "page_url", "referer_url", "form_title", "entry_time",
  "form_type", "render_id", "_wp_http_referer", "_forminator_user_ip",
  "webhook_secret", "_webhook_secret",
]);

function humanizeLabel(name) {
  return String(name)
    .replace(/[_/-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, function (char) { return char.toUpperCase(); });
}

var SKIP_FIELD_NAMES = new Set([
  "full_name", "name", "first_name", "last_name", "email",
  "phone_number", "phone", "mobile", "service", "service_requested",
  "message", "comments", "details",
]);

var FORMINATOR_FIELD_KEY =
  /^(name|email|phone|textarea|text|select|radio|checkbox|hidden|number|address|url)[-_]?\d+$/i;

function normalizePhone(value) {
  return String(value).replace(/\D/g, "");
}

function isUrl(value) {
  var text = String(value).trim();
  return /^https?:\/\//i.test(text) || text.indexOf("//") === 0 || /^www\./i.test(text);
}

function isTrackingToken(value) {
  var text = String(value).trim();
  if (!text) return true;
  if (text.length > 50 && !/\s/.test(text) && text.indexOf("@") === -1) return true;
  if (/^[A-Za-z0-9+/=_-]{40,}$/.test(text)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return true;
  return false;
}

function isNumericId(value) {
  return /^\d{4,}$/.test(String(value).trim());
}

function isHumanReadableAnswer(value, allowLongText) {
  var text = String(value).trim();
  var maxLength = allowLongText ? 5000 : 250;
  if (!text) return false;
  if (text.length < 2 || text.length > maxLength) return false;
  if (isUrl(text)) return false;
  if (isTrackingToken(text)) return false;
  if (isNumericId(text)) return false;
  if (!/[a-zA-Z]/.test(text)) return false;
  if (/^page:\s*/i.test(text)) return false;
  return true;
}

function isForminatorPayload(rawPayload) {
  var keys = Object.keys(rawPayload);
  for (var i = 0; i < keys.length; i++) {
    if (FORMINATOR_FIELD_KEY.test(keys[i])) return true;
  }
  return false;
}

function sortedForminatorKeys(rawPayload, prefix) {
  var pattern = new RegExp("^" + prefix + "[-_]?\\d+$", "i");
  return Object.keys(rawPayload)
    .filter(function (key) { return pattern.test(key); })
    .sort(function (left, right) {
      var leftNum = Number((left.match(/(\d+)$/) || [])[1] || 0);
      var rightNum = Number((right.match(/(\d+)$/) || [])[1] || 0);
      return leftNum - rightNum;
    });
}

function valueMatchesLead(value, lead, skipMessageMatch) {
  if (!lead) return false;
  var text = String(value).trim();
  if (!text) return false;
  var lower = text.toLowerCase();

  if (lead.full_name && lower === String(lead.full_name).trim().toLowerCase()) return true;
  if (lead.email && lower === String(lead.email).trim().toLowerCase()) return true;
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
  if (lead.message && !skipMessageMatch) {
    var message = String(lead.message).trim().toLowerCase();
    if (lower === message) return true;
    if (message.indexOf("suburb: " + lower) !== -1 || message.indexOf("postcode: " + lower) !== -1) {
      return false;
    }
    if (message.indexOf(lower) !== -1 && text.length >= 4) return true;
  }

  var payload = lead.raw_payload || {};
  var pageUrl = String(payload.current_url || payload.page_url || "").trim();
  if (pageUrl && (text === pageUrl || pageUrl.indexOf(text) !== -1 || text.indexOf(pageUrl) !== -1)) {
    return true;
  }

  return false;
}

function pushFormAnswer(lines, label, value, seen, valueSeen, lead, options) {
  options = options || {};
  var text = value == null ? "" : String(value).trim();
  if (!label || !text) return;
  if (!isHumanReadableAnswer(text, options.allowLongText)) return;
  if (valueMatchesLead(text, lead, options.skipMessageMatch)) return;

  var valueKey = text.toLowerCase();
  if (valueSeen.has(valueKey)) return;

  var key = label + ":" + text;
  if (seen.has(key)) return;
  seen.add(key);
  valueSeen.add(valueKey);
  lines.push({ label: humanizeLabel(label), value: text });
}

function collectForminatorAnswers(rawPayload, lead) {
  var lines = [];
  var seen = new Set();
  var valueSeen = new Set();
  var hasService = Boolean(lead && lead.service_requested);
  var keys;
  var i;
  var before;

  keys = sortedForminatorKeys(rawPayload, "text");
  for (i = 0; i < keys.length; i++) {
    pushFormAnswer(lines, "Suburb", rawPayload[keys[i]], seen, valueSeen, lead);
  }

  keys = sortedForminatorKeys(rawPayload, "select");
  for (i = 0; i < keys.length; i++) {
    if (hasService) continue;
    before = lines.length;
    pushFormAnswer(lines, "Service", rawPayload[keys[i]], seen, valueSeen, lead);
    if (lines.length > before) hasService = true;
  }

  keys = sortedForminatorKeys(rawPayload, "radio");
  for (i = 0; i < keys.length; i++) {
    if (hasService) continue;
    before = lines.length;
    pushFormAnswer(lines, "Service", rawPayload[keys[i]], seen, valueSeen, lead);
    if (lines.length > before) hasService = true;
  }

  keys = sortedForminatorKeys(rawPayload, "hidden");
  for (i = 0; i < keys.length; i++) {
    if (hasService) continue;
    before = lines.length;
    pushFormAnswer(lines, "Service", rawPayload[keys[i]], seen, valueSeen, lead);
    if (lines.length > before) hasService = true;
  }

  keys = sortedForminatorKeys(rawPayload, "checkbox");
  for (i = 0; i < keys.length; i++) {
    pushFormAnswer(lines, "Services", rawPayload[keys[i]], seen, valueSeen, lead);
  }

  keys = sortedForminatorKeys(rawPayload, "address");
  for (i = 0; i < keys.length; i++) {
    pushFormAnswer(lines, "Address", rawPayload[keys[i]], seen, valueSeen, lead);
  }

  keys = sortedForminatorKeys(rawPayload, "number");
  for (i = 0; i < keys.length; i++) {
    var numberText = String(rawPayload[keys[i]] || "").trim();
    if (/^\d{4}$/.test(numberText)) {
      pushFormAnswer(lines, "Postcode", numberText, seen, valueSeen, lead);
    }
  }

  keys = sortedForminatorKeys(rawPayload, "textarea");
  for (i = 0; i < keys.length; i++) {
    pushFormAnswer(lines, "Message", rawPayload[keys[i]], seen, valueSeen, lead, {
      allowLongText: true,
      skipMessageMatch: true,
    });
  }

  return lines;
}

function collectFacebookAnswers(rawPayload, lead) {
  var lines = [];
  var seen = new Set();
  var valueSeen = new Set();
  var fieldData = rawPayload.field_data;
  var i;

  if (!Array.isArray(fieldData)) return lines;

  for (i = 0; i < fieldData.length; i++) {
    var entry = fieldData[i] || {};
    var name = String(entry.name || "").trim();
    if (!name || SKIP_FIELD_NAMES.has(name.toLowerCase())) continue;
    pushFormAnswer(lines, name, entry.values && entry.values[0], seen, valueSeen, lead);
  }

  return lines;
}

function collectGenericAnswers(rawPayload, lead) {
  var lines = [];
  var seen = new Set();
  var valueSeen = new Set();
  var key;
  var value;

  for (key in rawPayload) {
    if (!Object.prototype.hasOwnProperty.call(rawPayload, key)) continue;
    if (SKIP_PAYLOAD_KEYS.has(key)) continue;
    value = rawPayload[key];
    if (value == null || value === "") continue;
    if (typeof value === "object") continue;
    if (FORMINATOR_FIELD_KEY.test(key)) continue;
    if (!/^(suburb|postcode|post_code|location|city|address|job_address)$/i.test(key)) continue;
    pushFormAnswer(lines, key, value, seen, valueSeen, lead);
  }

  return lines;
}

function fieldDataValue(rawPayload, names) {
  var fieldData = rawPayload.field_data;
  if (!Array.isArray(fieldData)) return "";

  var wanted = names.map(function (name) { return name.toLowerCase(); });
  var i;
  for (i = 0; i < fieldData.length; i++) {
    var entry = fieldData[i] || {};
    var name = String(entry.name || "").toLowerCase();
    if (wanted.indexOf(name) === -1) continue;
    var value = entry.values && entry.values[0];
    return value == null ? "" : String(value).trim();
  }
  return "";
}

function formatLeadFormAnswers(rawPayload, lead) {
  rawPayload = rawPayload || {};
  if (typeof rawPayload !== "object") return [];

  if (isForminatorPayload(rawPayload)) {
    return collectForminatorAnswers(rawPayload, lead);
  }

  if (Array.isArray(rawPayload.field_data) && rawPayload.field_data.length > 0) {
    return collectFacebookAnswers(rawPayload, lead);
  }

  return collectGenericAnswers(rawPayload, lead);
}

function extractAddressFromPayload(rawPayload) {
  rawPayload = rawPayload || {};
  var suburb = fieldDataValue(rawPayload, ["suburb", "city"]);
  var postcode = fieldDataValue(rawPayload, ["postcode", "post_code"]);
  var address = "";

  if (!suburb || !postcode) {
    for (var field in rawPayload) {
      if (!Object.prototype.hasOwnProperty.call(rawPayload, field)) continue;
      var value = rawPayload[field];
      if (value == null || value === "") continue;
      var text = String(value).trim();
      if (!text) continue;
      var normalized = field.toLowerCase();

      if (!suburb && (normalized.indexOf("suburb") !== -1 || normalized.indexOf("city") !== -1)) {
        suburb = text;
      } else if (
        !postcode &&
        (normalized.indexOf("postcode") !== -1 || normalized.indexOf("post_code") !== -1)
      ) {
        postcode = text;
      } else if (!address && normalized.indexOf("address") !== -1) {
        address = text;
      } else if (!suburb && /^text[-_]?\d+$/i.test(field)) {
        suburb = text;
      } else if (!postcode && /^number[-_]?\d+$/i.test(field) && /^\d{4}$/.test(text)) {
        postcode = text;
      }
    }
  }

  if (suburb && postcode) return suburb + " " + postcode;
  if (suburb) return suburb;
  if (postcode) return postcode;
  if (address) return address;
  return "";
}

function extractAddress(lead) {
  return extractAddressFromPayload(lead.raw_payload || {});
}

function buildJobDescription(lead) {
  var lines = [];
  var formAnswers = formatLeadFormAnswers(lead.raw_payload || {}, lead);
  var i;

  if (lead.service_requested) lines.push("Service: " + lead.service_requested);
  for (i = 0; i < formAnswers.length; i++) {
    lines.push(formAnswers[i].label + ": " + formAnswers[i].value);
  }
  if (lead.message && formAnswers.length === 0) lines.push("Message: " + lead.message);
  if (lead.notes) lines.push("Notes: " + lead.notes);
  lines.push("Lead source: " + lead.source);
  lines.push("Lead ID: " + lead.id);
  return lines.join("\n") || "New lead from dashboard";
}

function isDuplicateNameError(message) {
  return String(message).toLowerCase().indexOf("name must be unique") !== -1;
}

var SERVICEM8_CATEGORY_UUIDS = {
  same_day_home_services: "56ede18b-65c7-4a1f-a1cc-2420756f929b",
  same_day_shower_repairs: "56ede18b-65c7-4a1f-a1cc-2420756f929b",
  stay_connected_plumbing: "bdbbb658-6e05-4a09-aeab-1e4fcc4e61bb",
  facebook: "0e38598c-fbfe-4f0f-93d9-21fa78f83a5b",
};

var SHOWER_REPAIRS_HOST = "samedayshowerrepairs.com.au";

var SAME_DAY_HOSTS = [
  "samedayhomeservices.com.au",
  "emergencyplumbingrepairs.com.au",
];

function resolveLeadCategory(source, rawPayload) {
  rawPayload = rawPayload || {};
  if (source === "facebook") return "facebook";

  var url = String(
    rawPayload.current_url || rawPayload.page_url || rawPayload.referer_url || "",
  ).trim().toLowerCase();
  if (!url) {
    var key;
    for (key in rawPayload) {
      if (!Object.prototype.hasOwnProperty.call(rawPayload, key)) continue;
      var normalized = String(key).toLowerCase().replace(/_/g, " ").trim();
      if (
        normalized === "page url" ||
        normalized === "pageurl" ||
        normalized === "current url"
      ) {
        var pageUrl = rawPayload[key];
        if (pageUrl != null && pageUrl !== "") {
          url = String(pageUrl).toLowerCase();
          break;
        }
      }
    }
  }
  if (url.indexOf("stayconnectedplumbing.com.au") !== -1) {
    return "stay_connected_plumbing";
  }
  if (url.indexOf(SHOWER_REPAIRS_HOST) !== -1) {
    return "same_day_shower_repairs";
  }
  for (var i = 0; i < SAME_DAY_HOSTS.length; i++) {
    if (url.indexOf(SAME_DAY_HOSTS[i]) !== -1) return "same_day_home_services";
  }

  if (source === "stay_connected_plumbing") return "stay_connected_plumbing";
  if (source === "same_day_shower_repairs") return "same_day_shower_repairs";
  if (
    source === "same_day_home_services" ||
    source === "emergency_plumbing_sydney"
  ) {
    return "same_day_home_services";
  }

  return "same_day_home_services";
}

function resolveServiceM8CategoryUuid(source, rawPayload) {
  return SERVICEM8_CATEGORY_UUIDS[resolveLeadCategory(source, rawPayload)];
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
    category_uuid: resolveServiceM8CategoryUuid(lead.source, lead.raw_payload),
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
