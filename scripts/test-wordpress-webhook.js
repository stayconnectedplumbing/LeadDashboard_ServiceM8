import "dotenv/config";

const supabaseUrl = process.env.VITE_SUPABASE_URL?.replace(/\/$/, "");
const secret =
  process.env.WORDPRESS_WEBHOOK_SECRET ||
  process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !secret) {
  console.error("Missing VITE_SUPABASE_URL or WORDPRESS_WEBHOOK_SECRET in .env");
  process.exit(1);
}

const webhookUrl = `${supabaseUrl}/functions/v1/wordpress-webhook`;

const payload = {
  webhook_secret: secret,
  "name-1": "Webhook Test",
  "email-1": "webhook-test@example.com",
  "phone-1": "0400000000",
  "select-1": "Gas Fittings/Plumbing",
  "text-1": "Test Suburb",
  "textarea-1": "Sent from test-wordpress-webhook.js",
  form_title: "Quote Request",
  entry_time: new Date().toISOString().slice(0, 19).replace("T", " "),
  page_id: "test",
  current_url: "https://emergencyplumbingrepairs.com.au/",
  submission_id: `local-test-${Date.now()}`,
};

console.log("Testing:", webhookUrl);
console.log("");

const response = await fetch(webhookUrl, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});

const body = await response.text();
let parsed;
try {
  parsed = JSON.parse(body);
} catch {
  parsed = body;
}

console.log("Status:", response.status, response.statusText);
console.log("Response:", typeof parsed === "object" ? JSON.stringify(parsed, null, 2) : parsed);
console.log("");

if (response.status === 401) {
  console.log("FAIL — Unauthorized");
  console.log("");
  console.log("The secret in your URL does not match Supabase Edge Function secret.");
  console.log("Fix in Supabase Dashboard:");
  console.log("  Project → Edge Functions → Secrets → WORDPRESS_WEBHOOK_SECRET");
  console.log("");
  console.log("Set it to the same value you use in ?secret= (or add to .env as WORDPRESS_WEBHOOK_SECRET).");
  console.log("Then give the WordPress dev an updated URL from wordpress/WEBHOOK.md");
  process.exit(1);
}

if (response.status === 404) {
  console.log("FAIL — Function not found. Deploy it first:");
  console.log("  supabase functions deploy wordpress-webhook");
  process.exit(1);
}

if (!response.ok) {
  console.log("FAIL — check response above");
  process.exit(1);
}

console.log("OK — webhook accepted the test lead");

if (process.env.VITE_SUPABASE_ANON_KEY) {
  const leadsUrl = `${supabaseUrl}/rest/v1/leads?source=eq.wordpress&order=created_at.desc&limit=3`;
  const leadsRes = await fetch(leadsUrl, {
    headers: {
      apikey: process.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${process.env.VITE_SUPABASE_ANON_KEY}`,
    },
  });
  const leads = await leadsRes.json();
  if (Array.isArray(leads) && leads.length > 0) {
    console.log("");
    console.log("Latest WordPress leads in dashboard:");
    for (const lead of leads) {
      console.log(`  - ${lead.full_name || "Unnamed"} | ${lead.email || "-"} | ${lead.created_at}`);
    }
  }
}
