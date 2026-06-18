import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { normalizeFacebookLead } from "../_shared/normalize-facebook.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const GRAPH_API_VERSION = "v20.0";
const DEFAULT_PAGE_ID = "114076763756442";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function trim(value: string | null | undefined): string {
  return (value ?? "").trim();
}

type GraphList<T> = { data?: T[]; error?: { message?: string } };

async function graphGet<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
): Promise<T> {
  const url = new URL(`https://graph.facebook.com/${GRAPH_API_VERSION}/${path}`);
  url.searchParams.set("access_token", accessToken);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url);
  const body = await response.json();

  if (!response.ok) {
    const message = (body as { error?: { message?: string } }).error?.message ??
      JSON.stringify(body);
    throw new Error(message);
  }

  return body as T;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const verifyToken = trim(Deno.env.get("FACEBOOK_VERIFY_TOKEN"));
  const url = new URL(req.url);
  const providedToken = trim(url.searchParams.get("token"));

  if (!verifyToken || providedToken !== verifyToken) {
    return jsonResponse({ error: "Forbidden" }, 403);
  }

  const pageToken = trim(Deno.env.get("META_PAGE_ACCESS_TOKEN"));
  if (!pageToken) {
    return jsonResponse({ error: "META_PAGE_ACCESS_TOKEN not set" }, 503);
  }

  const pageId = trim(url.searchParams.get("page_id")) ||
    trim(Deno.env.get("FACEBOOK_PAGE_ID")) ||
    DEFAULT_PAGE_ID;
  const limit = Math.min(
    Number(url.searchParams.get("limit") || "25") || 25,
    100,
  );

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: "Server misconfigured" }, 500);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);
  const synced: Array<{ id: string; external_id: string; full_name: string | null }> = [];
  const errors: string[] = [];

  try {
    const forms = await graphGet<GraphList<{ id: string; name?: string }>>(
      `${pageId}/leadgen_forms`,
      pageToken,
      { fields: "id,name", limit: "50" },
    );

    for (const form of forms.data ?? []) {
      let leadsResponse: GraphList<Record<string, unknown>>;
      try {
        leadsResponse = await graphGet<GraphList<Record<string, unknown>>>(
          `${form.id}/leads`,
          pageToken,
          { fields: "id,created_time,field_data", limit: String(limit) },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        errors.push(`form ${form.id}: ${message}`);
        continue;
      }

      for (const lead of leadsResponse.data ?? []) {
        try {
          const row = normalizeFacebookLead(lead, {
            form_name: form.name,
          });

          const { data, error } = await supabase
            .from("leads")
            .upsert(row, { onConflict: "source,external_id" })
            .select("id, external_id, full_name")
            .single();

          if (error) {
            errors.push(`lead ${lead.id}: ${error.message}`);
            continue;
          }

          if (data) {
            synced.push(data);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errors.push(`lead ${lead.id}: ${message}`);
        }
      }
    }

    return jsonResponse({
      ok: true,
      page_id: pageId,
      forms_checked: forms.data?.length ?? 0,
      synced: synced.length,
      leads: synced,
      errors: errors.length > 0 ? errors : undefined,
      hint: synced.length === 0
        ? "No leads returned from Facebook API. Submit a Test form lead, or check app Live mode + leads_retrieval Advanced Access."
        : "Leads pulled from Facebook API. Webhooks may still need app Live mode for real-time delivery.",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return jsonResponse({ error: message }, 400);
  }
});
