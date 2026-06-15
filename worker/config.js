import "dotenv/config";

export const LEAD_SOURCES = [
  {
    id: "google_form",
    label: "Google Form",
    gmailQuery: "from:(forms-receipts-noreply@google.com) newer_than:7d",
    parser: "googleForm",
  },
  {
    id: "stay_connected_plumbing",
    label: "Stay Connected",
    gmailQuery: "subject:(New Booking From Website) newer_than:7d",
    parser: "stayConnected",
  },
  {
    id: "same_day_home_services",
    label: "Same Day Home",
    gmailQuery: "from:(samedayhomeservices.com.au) newer_than:7d",
    parser: "sameDayHome",
  },
  {
    id: "same_day_shower_repairs",
    label: "Same Day Shower",
    gmailQuery: "subject:(New Shower Quote Request) newer_than:7d",
    parser: "sameDayShower",
  },
  {
    id: "emergency_plumbing_sydney",
    label: "Emergency Plumbing",
    gmailQuery: "subject:(New Quote Request Emergency Plumbing) newer_than:7d",
    parser: "emergencyPlumbing",
  },
];

export const GMAIL_MESSAGE_LIMIT = 25;

export function getConfig({ requireSupabase = true } = {}) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const googleRefreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  const missing = [];
  if (requireSupabase && !supabaseUrl) missing.push("SUPABASE_URL");
  if (requireSupabase && !supabaseServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!googleClientId) missing.push("GOOGLE_CLIENT_ID");
  if (!googleClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
  if (!googleRefreshToken) missing.push("GOOGLE_REFRESH_TOKEN");

  return {
    supabaseUrl,
    supabaseServiceRoleKey,
    googleClientId,
    googleClientSecret,
    googleRefreshToken,
    missing,
  };
}
