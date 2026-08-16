#!/usr/bin/env node
/**
 * One-off setup for automatic OneDrive backups.
 *
 * Uses Microsoft's device-code flow: it prints a short code, you type it in on
 * any device already signed in to the Microsoft account, and it prints back a
 * refresh token to store as a secret. No client secret, no admin consent, and
 * access is limited to the app's own folder — never the rest of her OneDrive.
 *
 * Before running, register a free app at https://entra.microsoft.com:
 *   1. Applications → App registrations → New registration
 *   2. Name it anything. Supported account types: "Personal Microsoft accounts only"
 *   3. Authentication → Allow public client flows → Yes
 *   4. Copy the Application (client) ID
 *
 * Then:
 *   ONEDRIVE_CLIENT_ID=<that-id> node scripts/onedrive-setup.mjs
 */

const CLIENT_ID = process.env.ONEDRIVE_CLIENT_ID;
const SCOPE = "Files.ReadWrite.AppFolder offline_access";
const BASE = "https://login.microsoftonline.com/consumers/oauth2/v2.0";

if (!CLIENT_ID) {
  console.error(
    "Set ONEDRIVE_CLIENT_ID first:\n" +
      "  ONEDRIVE_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx node scripts/onedrive-setup.mjs",
  );
  process.exit(1);
}

const startResponse = await fetch(`${BASE}/devicecode`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ client_id: CLIENT_ID, scope: SCOPE }),
});

if (!startResponse.ok) {
  console.error("Couldn't start sign-in:", await startResponse.text());
  process.exit(1);
}

const flow = await startResponse.json();

console.log("\n" + "─".repeat(60));
console.log(flow.message ?? `Go to ${flow.verification_uri} and enter ${flow.user_code}`);
console.log("─".repeat(60) + "\n");
console.log("Waiting for you to finish signing in…\n");

const deadline = Date.now() + flow.expires_in * 1000;
const interval = (flow.interval ?? 5) * 1000;

while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, interval));

  const poll = await fetch(`${BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      client_id: CLIENT_ID,
      device_code: flow.device_code,
    }),
  });

  const result = await poll.json();

  if (poll.ok && result.refresh_token) {
    console.log("Signed in.\n");
    console.log("Add these to your server's environment variables:\n");
    console.log(`ONEDRIVE_CLIENT_ID=${CLIENT_ID}`);
    console.log(`ONEDRIVE_REFRESH_TOKEN=${result.refresh_token}\n`);
    console.log(
      "Treat the refresh token like a password. If backups start failing with\n" +
        "a sign-in error, run this script again to get a fresh one.\n",
    );
    process.exit(0);
  }

  // authorization_pending simply means "not finished yet" — keep waiting.
  if (result.error && result.error !== "authorization_pending") {
    if (result.error === "authorization_declined") {
      console.error("Sign-in was declined.");
    } else if (result.error === "expired_token") {
      console.error("The code expired. Run the script again.");
    } else {
      console.error("Sign-in failed:", result.error_description ?? result.error);
    }
    process.exit(1);
  }
}

console.error("Timed out waiting for sign-in. Run the script again.");
process.exit(1);
