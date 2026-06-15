import { createClient } from "@supabase/supabase-js";

export function createSupabaseAdmin(config) {
  return createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function upsertLead(supabase, lead) {
  const { data, error } = await supabase
    .from("leads")
    .upsert(
      {
        source: lead.source,
        external_id: lead.external_id,
        full_name: lead.full_name || null,
        email: lead.email || null,
        phone: lead.phone || null,
        service_requested: lead.service_requested || null,
        message: lead.message || null,
        raw_payload: lead.raw_payload ?? {},
        received_at: lead.received_at,
      },
      { onConflict: "source,external_id" },
    )
    .select("id, source, external_id, full_name, email")
    .single();

  if (error) {
    throw new Error(`Supabase upsert failed: ${error.message}`);
  }

  return data;
}
