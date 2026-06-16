import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  normalizeWildJarPayload,
  unwrapWildJarPayload,
} from "../_shared/normalize-wildjar.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function trim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function getAcceptedSecrets(): string[] {
  const secrets = [
    Deno.env.get("WILDJAR_WEBHOOK_SECRET"),
    Deno.env.get("SUPABASE_ANON_KEY"),
  ]
    .map(trim)
    .filter(Boolean);

  return [...new Set(secrets)];
}

function getProvidedSecrets(req: Request): string[] {
  const url = new URL(req.url);
  const authHeader = trim(req.headers.get("Authorization"));
  const bearer = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";

  return [
    url.searchParams.get("secret"),
    url.searchParams.get("token"),
    req.headers.get("X-Webhook-Secret"),
    bearer,
    req.headers.get("apikey"),
  ]
    .map(trim)
    .filter(Boolean);
}

function isAuthorized(req: Request): boolean {
  const accepted = getAcceptedSecrets();
  if (accepted.length === 0) return false;

  const provided = getProvidedSecrets(req);
  return provided.some((candidate) => accepted.includes(candidate));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const accepted = getAcceptedSecrets();
  if (accepted.length === 0) {
    return jsonResponse(
      {
        error: "Server misconfigured",
        detail: "No webhook secret available. Set WILDJAR_WEBHOOK_SECRET and redeploy.",
      },
      503,
    );
  }

  if (!isAuthorized(req)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const payload = unwrapWildJarPayload(body);

  let row;
  try {
    row = normalizeWildJarPayload(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid payload";
    return jsonResponse({ error: message }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const { data: existing } = await supabase
    .from("phone_calls")
    .select("id, followed_up, notes")
    .eq("wildjar_call_id", row.wildjar_call_id)
    .maybeSingle();

  const upsertRow = {
    ...row,
    notes: existing?.notes ?? "",
    followed_up: existing?.followed_up ?? row.followed_up,
  };

  const { data, error } = await supabase
    .from("phone_calls")
    .upsert(upsertRow, { onConflict: "wildjar_call_id" })
    .select("id, wildjar_call_id, call_status, event_type")
    .single();

  if (error) {
    return jsonResponse({ error: error.message }, 400);
  }

  return jsonResponse({ ok: true, call: data });
});
