import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { resolveLeadCategory } from "../_shared/lead-category.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type LeadPayload = {
  source: string;
  external_id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  service_requested?: string | null;
  message?: string | null;
  raw_payload?: Record<string, unknown>;
  received_at?: string;
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

  const ingestSecret = Deno.env.get("INGEST_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  const expectedAuth = ingestSecret ? `Bearer ${ingestSecret}` : "";

  if (!ingestSecret || authHeader !== expectedAuth) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let payload: LeadPayload;
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  if (!payload.source || !payload.external_id) {
    return jsonResponse(
      { error: "source and external_id are required" },
      400,
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const row = {
    source: resolveLeadCategory(
      payload.source,
      (payload.raw_payload ?? {}) as Record<string, unknown>,
    ),
    external_id: payload.external_id,
    full_name: payload.full_name ?? null,
    email: payload.email ?? null,
    phone: payload.phone ?? null,
    service_requested: payload.service_requested ?? null,
    message: payload.message ?? null,
    raw_payload: payload.raw_payload ?? {},
    received_at: payload.received_at ?? new Date().toISOString(),
    hidden: false,
  };

  const { data, error } = await supabase
    .from("leads")
    .upsert(row, { onConflict: "source,external_id" })
    .select("id, source, external_id")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ ok: true, lead: data });
});
