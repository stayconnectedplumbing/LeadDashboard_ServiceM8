import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { findJobByLeadId } from "../_shared/servicem8.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  let body: { lead_id?: string; job_uuid?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!body.lead_id) {
    return jsonResponse({ error: "lead_id is required" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const accessToken = Deno.env.get("SERVICEM8_ACCESS_TOKEN");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: lead, error: loadError } = await supabase
    .from("leads")
    .select("id, servicem8_job_uuid, servicem8_pushed_at")
    .eq("id", body.lead_id)
    .single();

  if (loadError || !lead) {
    return jsonResponse({ error: "Lead not found" }, 404);
  }

  if (lead.servicem8_job_uuid) {
    return jsonResponse({
      ok: true,
      synced: false,
      already_linked: true,
      job_uuid: lead.servicem8_job_uuid,
      job_url: `https://go.servicem8.com/openjob/${lead.servicem8_job_uuid}`,
    });
  }

  let jobUuid = body.job_uuid?.trim() || null;

  if (!jobUuid) {
    if (!accessToken) {
      return jsonResponse({
        ok: true,
        synced: false,
        job_uuid: null,
        message:
          "ServiceM8 lookup unavailable. Open the dashboard from the ServiceM8 add-on, or set SERVICEM8_ACCESS_TOKEN on sync-servicem8-link.",
      });
    }

    jobUuid = await findJobByLeadId(accessToken, body.lead_id);
  }

  if (!jobUuid) {
    return jsonResponse({ ok: true, synced: false, job_uuid: null });
  }

  const { error: updateError } = await supabase
    .from("leads")
    .update({
      servicem8_job_uuid: jobUuid,
      servicem8_pushed_at: lead.servicem8_pushed_at ?? new Date().toISOString(),
    })
    .eq("id", body.lead_id);

  if (updateError) {
    return jsonResponse(
      {
        error: `Found ServiceM8 job but failed to save link: ${updateError.message}`,
        job_uuid: jobUuid,
      },
      500,
    );
  }

  return jsonResponse({
    ok: true,
    synced: true,
    job_uuid: jobUuid,
    job_url: `https://go.servicem8.com/openjob/${jobUuid}`,
  });
});
