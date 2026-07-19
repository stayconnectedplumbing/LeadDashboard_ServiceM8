import { parseAustralianLocalTime } from "./australian-time.ts";

type JsonRecord = Record<string, unknown>;

function pickString(payload: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = payload[key];
    if (value === undefined || value === null || value === "") continue;
    return String(value).trim();
  }
  return null;
}

function pickNumber(payload: JsonRecord, keys: string[]): number | null {
  for (const key of keys) {
    const value = payload[key];
    if (value === undefined || value === null || value === "") continue;
    const parsed = Number(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function pickBoolean(payload: JsonRecord, keys: string[]): boolean | null {
  for (const key of keys) {
    const value = payload[key];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value === "boolean") return value;
    const normalized = String(value).trim().toLowerCase();
    if (["yes", "true", "1"].includes(normalized)) return true;
    if (["no", "false", "0"].includes(normalized)) return false;
  }
  return null;
}

function pickUtcTimestamp(payload: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const parsed = parseAustralianLocalTime(payload[key]);
    if (parsed) return parsed;
  }
  return null;
}

function pickGmtTimestamp(payload: JsonRecord, keys: string[]): string | null {
  for (const key of keys) {
    const value = pickString(payload, [key]);
    if (!value) continue;

    const normalized = value.includes("T")
      ? value
      : `${value.replace(" ", "T")}Z`;
    const parsed = parseAustralianLocalTime(normalized);
    if (parsed) return parsed;
  }
  return null;
}

function pickWildJarCallTime(payload: JsonRecord, kind: "start" | "end"): string | null {
  if (kind === "start") {
    return (
      pickUtcTimestamp(payload, ["dateStartISO", "date_start_iso"]) ??
      pickGmtTimestamp(payload, ["dateStartGMT", "date_start_gmt"]) ??
      pickUtcTimestamp(payload, [
        "dateStartLocal",
        "date_start_local",
        "dateStartUser",
        "date_start_user",
        "date",
        "localTime",
        "call_started_at",
        "started_at",
      ])
    );
  }

  return (
    pickUtcTimestamp(payload, ["dateStopISO", "date_stop_iso"]) ??
    pickGmtTimestamp(payload, ["dateStopGMT", "date_stop_gmt"]) ??
    pickUtcTimestamp(payload, [
      "dateStopLocal",
      "date_stop_local",
      "dateStopUser",
      "date_stop_user",
      "call_ended_at",
      "ended_at",
    ])
  );
}

function pickWebAttribution(payload: JsonRecord) {
  const web = payload.web;
  if (!web || typeof web !== "object" || Array.isArray(web)) {
    return { web_source: null, web_medium: null };
  }

  const record = web as JsonRecord;
  return {
    web_source: pickString(record, ["source", "utm_source", "web_source"]),
    web_medium: pickString(record, ["medium", "utm_medium", "web_medium"]),
  };
}

export function unwrapWildJarPayload(body: JsonRecord): JsonRecord {
  if (body.data && typeof body.data === "object" && !Array.isArray(body.data)) {
    return {
      ...(body.data as JsonRecord),
      event: body.event ?? body.type ?? body.event_type,
    };
  }
  return body;
}

export function resolveBrand(
  trackingSource: string | null,
  accountName: string | null,
): string | null {
  const haystack = `${trackingSource ?? ""} ${accountName ?? ""}`.toLowerCase();

  if (haystack.includes("stay connected")) return "Stay Connected Plumbing";
  if (haystack.includes("same day")) return "Same Day Home Services";
  if (trackingSource) return trackingSource;
  if (accountName) return accountName;
  return null;
}

export function normalizeWildJarPayload(payload: JsonRecord) {
  const wildjarCallId = pickString(payload, [
    "id",
    "call_id",
    "callId",
    "callID",
  ]);

  if (!wildjarCallId) {
    throw new Error("Missing WildJar call id");
  }

  const trackingSource = pickString(payload, [
    "source",
    "tracking_source",
    "trackingSource",
    "call_source",
  ]);
  const accountName = pickString(payload, [
    "accountName",
    "account_name",
    "account",
  ]);

  const eventType = pickString(payload, [
    "event",
    "event_type",
    "eventType",
    "type",
  ]);

  const callStatus = pickString(payload, [
    "status",
    "call_status",
    "callStatus",
  ]);

  const isCompleted = eventType?.toLowerCase().includes("complet") ||
    eventType?.toLowerCase().includes("end") ||
    Boolean(callStatus) ||
    pickNumber(payload, ["duration", "duration_seconds", "call_duration"]) !== null;

  const normalizedStatus = callStatus?.toLowerCase() ?? null;
  const webAttribution = pickWebAttribution(payload);

  return {
    wildjar_call_id: wildjarCallId,
    event_type: eventType,
    caller_phone: pickString(payload, [
      "caller",
      "caller_id",
      "callerId",
      "caller_phone",
      "from",
    ]),
    tracking_number: pickString(payload, [
      "did",
      "tracking_number",
      "trackingNumber",
      "tracking_num",
    ]),
    tracking_source: trackingSource,
    call_status: normalizedStatus,
    duration_seconds: pickNumber(payload, [
      "duration",
      "duration_seconds",
      "call_duration",
      "callDuration",
    ]),
    talk_time_seconds: pickNumber(payload, [
      "talk_time",
      "talkTime",
      "call_talk_time",
      "callTalkTime",
    ]),
    first_time_caller: pickBoolean(payload, [
      "firstTimeCaller",
      "first_time_caller",
      "first_time",
    ]),
    caller_area: pickString(payload, ["area", "caller_area", "callerArea"]),
    web_source:
      pickString(payload, ["web_source", "webSource", "utm_source"]) ??
      webAttribution.web_source,
    web_medium:
      pickString(payload, ["web_medium", "webMedium", "utm_medium"]) ??
      webAttribution.web_medium,
    ivr_option: pickString(payload, [
      "IVR:name",
      "ivr_option",
      "ivrOption",
      "IVR_name",
    ]),
    account_name: accountName,
    brand: resolveBrand(trackingSource, accountName),
    call_started_at: pickWildJarCallTime(payload, "start"),
    call_ended_at: pickWildJarCallTime(payload, "end"),
    raw_payload: payload,
    followed_up: isCompleted && normalizedStatus === "answered",
    received_at: new Date().toISOString(),
  };
}
