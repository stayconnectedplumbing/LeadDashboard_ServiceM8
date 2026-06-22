/**
 * Fetch ServiceM8 job category UUIDs.
 *
 * Usage (API key — recommended):
 *   set SERVICEM8_API_KEY=your-key-from-servicem8-settings
 *   node scripts/fetch-servicem8-categories.mjs
 *
 * Usage (OAuth access token):
 *   set SERVICEM8_ACCESS_TOKEN=your-oauth-token
 *   node scripts/fetch-servicem8-categories.mjs
 */

const API = "https://api.servicem8.com/api_1.0/category.json";

const LEAD_CATEGORY_NAMES = {
  same_day_home_services: "Same Day Home Services",
  stay_connected_plumbing: "Stay Connected Plumbing",
  facebook: "Facebook",
};

const apiKey = process.env.SERVICEM8_API_KEY?.trim();
const accessToken = process.env.SERVICEM8_ACCESS_TOKEN?.trim();

if (!apiKey && !accessToken) {
  console.error(
    "Missing credentials. Set SERVICEM8_API_KEY (Settings → API Keys in ServiceM8)\n" +
      "or SERVICEM8_ACCESS_TOKEN, then run this script again.",
  );
  process.exit(1);
}

const headers = { Accept: "application/json" };
if (apiKey) headers["X-API-Key"] = apiKey;
else headers.Authorization = `Bearer ${accessToken}`;

const response = await fetch(API, { headers });
const text = await response.text();

if (!response.ok) {
  console.error(`Request failed (${response.status}): ${text}`);
  process.exit(1);
}

const categories = JSON.parse(text);
const active = categories.filter((c) => c.active !== 0 && c.active !== "0");

console.log("\nAll active ServiceM8 categories:\n");
for (const cat of active.sort((a, b) => a.name.localeCompare(b.name))) {
  console.log(`  ${cat.name}`);
  console.log(`    uuid: ${cat.uuid}\n`);
}

console.log("Lead dashboard mapping (3 categories):\n");
for (const [id, name] of Object.entries(LEAD_CATEGORY_NAMES)) {
  const match = active.find(
    (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (match) {
    console.log(`  ${id}`);
    console.log(`    name: ${match.name}`);
    console.log(`    uuid: ${match.uuid}\n`);
  } else {
    console.log(`  ${id}`);
    console.log(`    MISSING in ServiceM8 — create category "${name}"\n`);
  }
}

console.log("Env vars for Supabase / .env (optional if using name lookup in code):\n");
for (const [id, name] of Object.entries(LEAD_CATEGORY_NAMES)) {
  const match = active.find(
    (c) => c.name.trim().toLowerCase() === name.toLowerCase(),
  );
  if (match) {
    const envName = `SERVICEM8_CATEGORY_${id.toUpperCase()}_UUID`;
    console.log(`${envName}=${match.uuid}`);
  }
}
