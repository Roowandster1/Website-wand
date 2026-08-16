import "server-only";

/**
 * Uploads a backup to OneDrive through the Microsoft Graph API.
 *
 * Authentication uses a refresh token obtained once, interactively, by running
 * `npm run onedrive-setup`. That script walks through Microsoft's device-code
 * flow — it prints a short code, you type it into microsoft.com/devicelogin on
 * any device, and it prints back a refresh token to store as a secret.
 *
 * Refresh tokens are used rather than a client secret because this is a
 * personal Microsoft account, which has no admin to grant application
 * permissions. The token is long-lived but not eternal: if backups start
 * failing with an auth error, re-run the setup script.
 *
 * Files land in the app's own folder in her OneDrive (Apps/PracticeAdmin),
 * so the grant never extends to the rest of her files.
 */

const GRAPH = "https://graph.microsoft.com/v1.0";
const TOKEN_URL =
  "https://login.microsoftonline.com/consumers/oauth2/v2.0/token";

export function isOneDriveConfigured(): boolean {
  return Boolean(
    process.env.ONEDRIVE_CLIENT_ID && process.env.ONEDRIVE_REFRESH_TOKEN,
  );
}

async function accessToken(): Promise<string> {
  const body = new URLSearchParams({
    client_id: process.env.ONEDRIVE_CLIENT_ID!,
    refresh_token: process.env.ONEDRIVE_REFRESH_TOKEN!,
    grant_type: "refresh_token",
    scope: "Files.ReadWrite.AppFolder offline_access",
  });

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(
      `OneDrive sign-in failed (${response.status}). ` +
        `The refresh token may have expired — re-run "npm run onedrive-setup". ${detail.slice(0, 200)}`,
    );
  }

  const json = (await response.json()) as { access_token?: string };
  if (!json.access_token) throw new Error("OneDrive returned no access token");
  return json.access_token;
}

/**
 * Uploads a file to the app folder.
 *
 * Backups are a few kilobytes to a few megabytes, comfortably inside Graph's
 * 4MB simple-upload limit. Anything larger would need a resumable session.
 */
export async function uploadToOneDrive(
  filename: string,
  content: Buffer,
): Promise<string> {
  if (content.byteLength > 4 * 1024 * 1024) {
    throw new Error(
      `Backup is ${(content.byteLength / 1024 / 1024).toFixed(1)}MB, above the ` +
        "4MB simple upload limit. A resumable upload is needed at this size.",
    );
  }

  const token = await accessToken();
  const url = `${GRAPH}/me/drive/special/approot:/${encodeURIComponent(filename)}:/content`;

  const response = await fetch(url, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/octet-stream",
    },
    body: new Uint8Array(content),
  });

  if (!response.ok) {
    throw new Error(
      `OneDrive upload failed (${response.status}): ${(await response.text()).slice(0, 200)}`,
    );
  }

  const json = (await response.json()) as { name?: string };
  return json.name ?? filename;
}

/** Deletes backups older than the retention window from the app folder. */
export async function pruneOneDrive(keepDays: number): Promise<number> {
  const token = await accessToken();

  const response = await fetch(`${GRAPH}/me/drive/special/approot/children`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return 0;

  const json = (await response.json()) as {
    value?: Array<{ id: string; name: string; createdDateTime: string }>;
  };

  const cutoff = Date.now() - keepDays * 24 * 60 * 60 * 1000;
  let removed = 0;

  for (const item of json.value ?? []) {
    if (!item.name.startsWith("practice-backup-")) continue;
    if (new Date(item.createdDateTime).getTime() >= cutoff) continue;

    const deletion = await fetch(`${GRAPH}/me/drive/items/${item.id}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (deletion.ok) removed++;
  }

  return removed;
}
