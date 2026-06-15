/**
 * One-time setup: obtain GOOGLE_REFRESH_TOKEN for the Gmail sync worker.
 *
 * 1. Create OAuth credentials in Google Cloud Console (Desktop app type).
 * 2. Enable Gmail API for the project.
 * 3. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env
 * 4. Run: npm run gmail:auth
 * 5. Open the printed URL, approve access, paste the code when prompted.
 * 6. Add the printed GOOGLE_REFRESH_TOKEN to .env
 */
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { google } from "googleapis";

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error("Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  "urn:ietf:wg:oauth:2.0:oob",
);

const authUrl = oauth2Client.generateAuthUrl({
  access_type: "offline",
  prompt: "consent",
  scope: ["https://www.googleapis.com/auth/gmail.readonly"],
});

console.log("\nOpen this URL in your browser and sign in with the Gmail inbox that receives leads:\n");
console.log(authUrl);
console.log("");

const rl = readline.createInterface({ input, output });

try {
  const code = await rl.question("Paste the authorization code here: ");
  const { tokens } = await oauth2Client.getToken(code.trim());

  if (!tokens.refresh_token) {
    console.error(
      "\nNo refresh token returned. Revoke app access at https://myaccount.google.com/permissions and run again with prompt=consent.",
    );
    process.exit(1);
  }

  console.log("\nAdd this to your .env:\n");
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token}`);
} finally {
  rl.close();
}
