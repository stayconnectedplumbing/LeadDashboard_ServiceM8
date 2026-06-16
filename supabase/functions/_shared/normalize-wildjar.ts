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

function pickDate(payload: JsonRecord, keys: string[]): string | null {
  const value = pickString(payload, keys);
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
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
    call_status: callStatus?.toLowerCase() ?? null,
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
    web_source: pickString(payload, ["web_source", "webSource", "utm_source"]),
    web_medium: pickString(payload, ["web_medium", "webMedium", "utm_medium"]),
    ivr_option: pickString(payload, [
      "IVR:name",
      "ivr_option",
      "ivrOption",
      "IVR_name",
    ]),
    account_name: accountName,
    brand: resolveBrand(trackingSource, accountName),
    call_started_at: pickDate(payload, [
      "dateStartLocal",
      "date_start_local",
      "date",
      "localTime",
      "call_started_at",
      "started_at",
    ]),
    call_ended_at: pickDate(payload, [
      "dateStopLocal",
      "date_stop_local",
      "call_ended_at",
      "ended_at",
    ]),
    raw_payload: payload,
    followed_up: isCompleted && callStatus === "answered",
    received_at: new Date().toISOString(),
  };
}
