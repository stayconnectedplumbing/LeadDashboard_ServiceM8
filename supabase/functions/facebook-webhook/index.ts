import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import {
  buildMetaTestLeadRow,
  buildWebhookOnlyLeadRow,
  extractLeadgenChanges,
  isMetaTestLeadgenId,
  normalizeFacebookLead,
} from "../_shared/normalize-facebook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-hub-signature-256",
};

const GRAPH_API_VERSION = "v20.0";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function trim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

async function verifySignature(
  req: Request,
  rawBody: string,
): Promise<boolean> {
  const appSecret = trim(Deno.env.get("FACEBOOK_APP_SECRET"));
  if (!appSecret) return true;

  const signature = trim(req.headers.get("X-Hub-Signature-256"));
  if (!signature) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(rawBody),
  );
  const expected = "sha256=" +
    [...new Uint8Array(sig)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");

  return signature === expected;
}

async function fetchFacebookLead(
  leadgenId: string,
  accessToken: string,
): Promise<Record<string, unknown>> {
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${leadgenId}`,
  );
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const body = await response.json();

  if (!response.ok) {
    const detail = typeof body === "object" && body !== null
      ? JSON.stringify(body)
      : String(body);
    throw new Error(`Graph API error for ${leadgenId}: ${detail}`);
  }

  return body as Record<string, unknown>;
}

async function fetchFormName(
  formId: string,
  accessToken: string,
): Promise<string | null> {
  const url = new URL(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${formId}`,
  );
  url.searchParams.set("fields", "name");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url);
  const body = await response.json();

  if (!response.ok) return null;

  const name = (body as { name?: string }).name;
  return name?.trim() || null;
}

type TokenCheck = {
  token_valid: boolean;
  page_id?: string;
  page_name?: string;
  has_leads_retrieval?: boolean;
  expires_at?: number | null;
  error?: string;
};

async function checkPageToken(accessToken: string): Promise<TokenCheck> {
  if (!accessToken) {
    return { token_valid: false, error: "META_PAGE_ACCESS_TOKEN not set" };
  }

  const meUrl = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/me`);
  meUrl.searchParams.set("fields", "id,name");
  meUrl.searchParams.set("access_token", accessToken);

  const meRes = await fetch(meUrl);
  const meBody = await meRes.json();

  if (!meRes.ok) {
    const err = (meBody as { error?: { message?: string } }).error?.message ??
      JSON.stringify(meBody);
    return { token_valid: false, error: err };
  }

  const pageId = String((meBody as { id?: string }).id ?? "");
  const pageName = String((meBody as { name?: string }).name ?? "");

  const appId = trim(Deno.env.get("FACEBOOK_APP_ID"));
  const appSecret = trim(Deno.env.get("FACEBOOK_APP_SECRET"));
  let hasLeadsRetrieval: boolean | undefined;
  let expiresAt: number | null | undefined;

  if (appId && appSecret) {
    const debugUrl = new URL(
      `https://graph.facebook.com/${GRAPH_API_VERSION}/debug_token`,
    );
    debugUrl.searchParams.set("input_token", accessToken);
    debugUrl.searchParams.set("access_token", `${appId}|${appSecret}`);

    const debugRes = await fetch(debugUrl);
    const debugBody = await debugRes.json();
    const data = (debugBody as { data?: { scopes?: string[]; expires_at?: number } }).data;

    if (data?.scopes) {
      hasLeadsRetrieval = data.scopes.includes("leads_retrieval");
    }
    expiresAt = data?.expires_at ?? null;
  }

  return {
    token_valid: true,
    page_id: pageId,
    page_name: pageName,
    has_leads_retrieval: hasLeadsRetrieval,
    expires_at: expiresAt,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const verifyToken = trim(Deno.env.get("FACEBOOK_VERIFY_TOKEN"));
  const pageAccessToken = trim(Deno.env.get("META_PAGE_ACCESS_TOKEN"));

  if (req.method === "GET") {
    const url = new URL(req.url);
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    const action = url.searchParams.get("action");

    if (action === "health") {
      const healthToken = url.searchParams.get("token");
      if (!verifyToken || healthToken !== verifyToken) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }

      const tokenCheck = await checkPageToken(pageAccessToken);
      return jsonResponse({
        page_token_set: Boolean(pageAccessToken),
        ...tokenCheck,
        hint: !tokenCheck.token_valid
          ? "META_PAGE_ACCESS_TOKEN expired or invalid. See facebook/TOKEN.md"
          : tokenCheck.has_leads_retrieval === false
          ? "Token missing leads_retrieval. Regenerate System User token."
          : "Subscribe Page: POST /{page-id}/subscribed_apps?subscribed_fields=leadgen",
      });
    }

    if (!verifyToken) {
      return jsonResponse(
        {
          error: "Server misconfigured",
          detail: "Set FACEBOOK_VERIFY_TOKEN and redeploy.",
        },
        503,
      );
    }

    if (mode === "subscribe" && token === verifyToken && challenge) {
      return new Response(challenge, {
        status: 200,
        headers: corsHeaders,
      });
    }

    return jsonResponse({ error: "Forbidden" }, 403);
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  if (!pageAccessToken) {
    return jsonResponse(
      {
        error: "Server misconfigured",
        detail: "Set META_PAGE_ACCESS_TOKEN and redeploy.",
      },
      503,
    );
  }

  const tokenCheck = await checkPageToken(pageAccessToken);
  if (!tokenCheck.token_valid) {
    console.error("facebook-webhook: page token invalid", tokenCheck.error);
  } else if (tokenCheck.has_leads_retrieval === false) {
    console.error("facebook-webhook: page token missing leads_retrieval scope");
  }

  const rawBody = await req.text();

  if (!await verifySignature(req, rawBody)) {
    console.error("facebook-webhook: invalid X-Hub-Signature-256");
    return jsonResponse({
      error: "Invalid signature",
      hint:
        "Check FACEBOOK_APP_SECRET matches Meta App settings → Basic → App secret. " +
        "Temporarily delete that secret in Supabase and redeploy to test without signatures.",
    }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody) as Record<string, unknown>;
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400);
  }

  const leadgenChanges = extractLeadgenChanges(payload);
  console.log(
    "facebook-webhook: leadgen events",
    leadgenChanges.length,
    leadgenChanges.map((c) => c.leadgen_id),
  );

  if (leadgenChanges.length === 0) {
    console.warn("facebook-webhook: no leadgen changes in payload", Object.keys(payload));
    return jsonResponse({ ok: true, processed: 0, hint: "No leadgen field in payload" });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const leads: Array<{ id: string; external_id: string }> = [];
  const errors: string[] = [];

  for (const change of leadgenChanges) {
    try {
      let row;

      if (isMetaTestLeadgenId(change.leadgen_id)) {
        row = buildMetaTestLeadRow(change);
      } else {
        try {
          const graphLead = await fetchFacebookLead(
            change.leadgen_id,
            pageAccessToken,
          );

          const formId = change.form_id ||
            (graphLead.form_id ? String(graphLead.form_id) : "");
          const formName = formId
            ? await fetchFormName(formId, pageAccessToken)
            : null;

          row = normalizeFacebookLead(graphLead, { form_name: formName });
        } catch (fetchError) {
          const fetchMessage = fetchError instanceof Error
            ? fetchError.message
            : String(fetchError);
          console.error("facebook-webhook: Graph API fetch failed", fetchMessage);
          row = buildWebhookOnlyLeadRow(change, fetchMessage);
        }
      }

      const { data, error } = await supabase
        .from("leads")
        .upsert(row, { onConflict: "source,external_id" })
        .select("id, external_id")
        .single();

      if (error) {
        console.error("facebook-webhook: supabase upsert failed", error.message);
        errors.push(`${change.leadgen_id}: ${error.message}`);
        continue;
      }

      if (data) {
        leads.push({ id: data.id, external_id: data.external_id });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("facebook-webhook: lead processing failed", message);
      errors.push(`${change.leadgen_id}: ${message}`);
    }
  }

  const responseBody = {
    ok: true,
    processed: leads.length,
    leads,
    errors: errors.length > 0 ? errors : undefined,
  };
  console.log("facebook-webhook: done", JSON.stringify(responseBody));

  return jsonResponse(responseBody);
});
