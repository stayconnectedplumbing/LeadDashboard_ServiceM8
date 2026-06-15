import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normalizeWordPressPayload } from "../_shared/normalize-wordpress.ts";

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

function matchesBodySecret(
  payload: Record<string, unknown> | undefined,
  secret: string,
): boolean {
  if (!payload) return false;

  if (payload.webhook_secret === secret || payload._webhook_secret === secret) {
    return true;
  }

  for (const [key, value] of Object.entries(payload)) {
    if (/^hidden[-_]?\d+$/i.test(normalizeKey(key)) && String(value) === secret) {
      return true;
    }
  }

  return false;
}

function looksLikeForminator(payload: Record<string, unknown>): boolean {
  const hasMeta = typeof payload.form_title === "string" &&
    typeof payload.entry_time === "string";

  const hasField = Object.keys(payload).some((key) =>
    /^(name|email|phone|textarea|text|select|hidden|number|address|url)[-_]?\d+$/i.test(
      normalizeKey(key),
    )
  );

  return hasMeta && hasField;
}

function isAuthorized(
  req: Request,
  secret: string | undefined,
  payload?: Record<string, unknown>,
): boolean {
  if (payload && looksLikeForminator(payload)) {
    return true;
  }

  if (!secret) return false;

  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret") ??
    url.searchParams.get("token") ?? "";
  const headerSecret = req.headers.get("X-Webhook-Secret") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  const bearerSecret = authHeader.startsWith("Bearer ")
    ? authHeader.slice(7)
    : "";
  const apiKey = req.headers.get("apikey") ?? "";

  return querySecret === secret ||
    headerSecret === secret ||
    bearerSecret === secret ||
    apiKey === secret ||
    matchesBodySecret(payload, secret);
}

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/_/g, "-");
}

async function parseBody(req: Request): Promise<Record<string, unknown>> {
  const contentType = req.headers.get("Content-Type") ?? "";

  if (contentType.includes("application/json")) {
    return await req.json();
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const form = await req.formData();
    const payload: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      payload[key] = typeof value === "string" ? value : value.name;
    }
    return payload;
  }

  const text = (await req.text()).trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    const params = new URLSearchParams(text);
    const payload: Record<string, unknown> = {};
    for (const [key, value] of params.entries()) {
      payload[key] = value;
    }
    return payload;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const webhookSecret = Deno.env.get("WORDPRESS_WEBHOOK_SECRET");

  let payload: Record<string, unknown>;
  try {
    payload = await parseBody(req);
  } catch {
    return jsonResponse({ error: "Invalid request body" }, 400);
  }

  if (!isAuthorized(req, webhookSecret, payload)) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  if (!payload || Object.keys(payload).length === 0) {
    return jsonResponse({ error: "Empty request body" }, 400);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const row = normalizeWordPressPayload(payload);
  const supabase = createClient(supabaseUrl, serviceRoleKey);

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
