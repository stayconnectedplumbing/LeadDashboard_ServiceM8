import { getConfig, GMAIL_MESSAGE_LIMIT, LEAD_SOURCES } from "./config.js";
import { createGmailClient, fetchMessage, listMessageIds } from "./gmail.js";
import { PARSERS } from "./parsers.js";
import { createSupabaseAdmin, upsertLead } from "./supabase.js";

function parseArgs(argv) {
  const dryRun = argv.includes("--dry-run");
  const sourceFlag = argv.find((arg) => arg.startsWith("--source="));
  const sourceFilter = sourceFlag ? sourceFlag.split("=")[1] : null;

  return { dryRun, sourceFilter };
}

function printLeadPreview(lead) {
  console.log(
    `  - ${lead.external_id} | ${lead.full_name || "(no name)"} | ${lead.email || "(no email)"} | ${lead.phone || "(no phone)"}`,
  );
}

async function syncSource(gmail, supabase, source, { dryRun }) {
  console.log(`\n[${source.label}] query: ${source.gmailQuery}`);

  const parser = PARSERS[source.parser];
  if (!parser) {
    throw new Error(`Unknown parser: ${source.parser}`);
  }

  const messageIds = await listMessageIds(
    gmail,
    source.gmailQuery,
    GMAIL_MESSAGE_LIMIT,
  );

  console.log(`  Found ${messageIds.length} message(s)`);

  let upserted = 0;

  for (const messageId of messageIds) {
    const email = await fetchMessage(gmail, messageId);
    const lead = parser(email);

    if (dryRun) {
      printLeadPreview(lead);
      upserted += 1;
      continue;
    }

    const saved = await upsertLead(supabase, lead);
    console.log(`  Upserted ${saved.source}/${saved.external_id} (${saved.full_name || saved.email || "lead"})`);
    upserted += 1;
  }

  return upserted;
}

async function main() {
  const { dryRun, sourceFilter } = parseArgs(process.argv.slice(2));
  const config = getConfig({ requireSupabase: !dryRun });

  if (config.missing.length > 0) {
    console.error("Missing required environment variables:");
    for (const name of config.missing) {
      console.error(`  - ${name}`);
    }
    console.error("\nCopy .env.example to .env and fill in worker values.");
    console.error("Run `npm run gmail:auth` once to obtain GOOGLE_REFRESH_TOKEN.");
    process.exit(1);
  }

  const sources = sourceFilter
    ? LEAD_SOURCES.filter((source) => source.id === sourceFilter)
    : LEAD_SOURCES;

  if (sources.length === 0) {
    console.error(`Unknown source: ${sourceFilter}`);
    console.error(`Valid sources: ${LEAD_SOURCES.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  console.log(dryRun ? "DRY RUN — no Supabase writes" : "LIVE RUN — writing to Supabase");
  console.log(`Syncing ${sources.length} source(s)...`);

  const gmail = createGmailClient(config);
  const supabase = dryRun ? null : createSupabaseAdmin(config);

  let total = 0;

  for (const source of sources) {
    total += await syncSource(gmail, supabase, source, { dryRun });
  }

  console.log(`\nDone. Processed ${total} lead(s).`);
}

main().catch((error) => {
  console.error("\nSync failed:", error.message);
  process.exit(1);
});
