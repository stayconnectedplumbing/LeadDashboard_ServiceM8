import { hasSupabaseConfig, supabase } from "./supabaseClient";

export function isInServiceM8Iframe() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

function tryParseJson(value) {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function normalizePushResult(result) {
  let parsed = tryParseJson(result);

  if (parsed && typeof parsed === "object" && parsed.raw) {
    parsed = tryParseJson(parsed.raw);
  }

  if (parsed && typeof parsed === "object" && parsed.eventResponse) {
    parsed = tryParseJson(parsed.eventResponse);
  }

  if (typeof parsed === "string") {
    parsed = tryParseJson(parsed);
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unexpected response from ServiceM8");
  }

  if (parsed.error) {
    throw new Error(parsed.error);
  }

  if (!parsed.job_uuid) {
    throw new Error("ServiceM8 did not return a job ID");
  }

  return parsed;
}

function normalizeSyncResult(data) {
  const parsed = tryParseJson(data);
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Unexpected sync response");
  }
  if (parsed.error) {
    throw new Error(parsed.error);
  }
  return parsed;
}

function postMessageBridge(requestType, responseType, payload) {
  return new Promise((resolve, reject) => {
    const requestId = crypto.randomUUID();
    const timeout = setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(
        new Error(
          "ServiceM8 request timed out. Open the dashboard from the ServiceM8 add-on menu.",
        ),
      );
    }, 30000);

    function onMessage(event) {
      if (event.data?.type !== responseType || event.data.requestId !== requestId) {
        return;
      }

      window.removeEventListener("message", onMessage);
      clearTimeout(timeout);

      if (event.data.error) {
        reject(new Error(event.data.error));
        return;
      }

      try {
        resolve(normalizeSyncResult(event.data.result));
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    window.addEventListener("message", onMessage);
    window.parent.postMessage({ type: requestType, requestId, payload }, "*");
  });
}

export function lookupLeadViaServiceM8Bridge(leadId) {
  return postMessageBridge("LOOKUP_LEAD", "LOOKUP_LEAD_RESULT", {
    lead_id: leadId,
  });
}

export function pushLeadViaServiceM8Bridge(lead) {
  return postMessageBridge("PUSH_LEAD", "PUSH_LEAD_RESULT", {
    id: lead.id,
    source: lead.source,
    full_name: lead.full_name,
    email: lead.email,
    phone: lead.phone,
    service_requested: lead.service_requested,
    message: lead.message,
    notes: lead.notes,
    raw_payload: lead.raw_payload,
    servicem8_job_uuid: lead.servicem8_job_uuid,
  }).then(normalizePushResult);
}

export async function syncServiceM8Link(leadId, jobUuid) {
  if (!hasSupabaseConfig) {
    return { ok: true, synced: Boolean(jobUuid), job_uuid: jobUuid || null };
  }

  const body = { lead_id: leadId };
  if (jobUuid) body.job_uuid = jobUuid;

  const { data, error: invokeError } = await supabase.functions.invoke(
    "sync-servicem8-link",
    { body },
  );

  if (invokeError) {
    throw new Error(invokeError.message);
  }

  return normalizeSyncResult(data);
}

export async function reconcileLeadServiceM8Link(lead) {
  if (lead.servicem8_job_uuid) {
    return { synced: false, lead };
  }

  if (!hasSupabaseConfig) {
    return { synced: false, lead };
  }

  let result;

  if (isInServiceM8Iframe()) {
    result = await lookupLeadViaServiceM8Bridge(lead.id);
    if (result.job_uuid) {
      result = await syncServiceM8Link(lead.id, result.job_uuid);
    }
  } else {
    result = await syncServiceM8Link(lead.id);
  }

  if (!result.job_uuid) {
    return { synced: false, lead };
  }

  const patchedLead = {
    ...lead,
    servicem8_job_uuid: result.job_uuid,
    servicem8_pushed_at: lead.servicem8_pushed_at || new Date().toISOString(),
  };

  return { synced: Boolean(result.synced), lead: patchedLead, result };
}

const RECONCILE_BATCH_SIZE = 5;
const RECONCILE_MAX_LEADS = 30;

export async function reconcileUnlinkedLeads(leads, onLeadSynced) {
  const candidates = leads
    .filter((lead) => !lead.servicem8_job_uuid)
    .slice(0, RECONCILE_MAX_LEADS);

  for (let index = 0; index < candidates.length; index += RECONCILE_BATCH_SIZE) {
    const batch = candidates.slice(index, index + RECONCILE_BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((lead) => reconcileLeadServiceM8Link(lead)),
    );

    results.forEach((outcome, batchIndex) => {
      if (outcome.status !== "fulfilled" || !outcome.value.synced) return;
      onLeadSynced(outcome.value.lead, batch[batchIndex]);
    });
  }
}
