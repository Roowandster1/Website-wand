"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/app/admin/actions";
import { logAudit } from "@/lib/audit";
import {
  checkPasswordStrength,
  destroyAllSessions,
  hashPassword,
  verifyPassword,
} from "@/lib/auth";
import { runNightlyBackup } from "@/lib/auto-backup";
import { getDb } from "@/lib/db";
import { sendTomorrowsReminders } from "@/lib/reminders";
import {
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  verifyCode,
} from "@/lib/totp";

export type SettingsState = {
  error?: string;
  success?: string;
  secret?: string;
  recoveryCodes?: string[];
};

export async function changePassword(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const current = String(formData.get("currentPassword") ?? "");
  const next = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!(await verifyPassword(current, user.password_hash))) {
    return { error: "Your current password wasn't right." };
  }
  if (next !== confirm) {
    return { error: "The two new passwords don't match." };
  }

  const weakness = checkPasswordStrength(next);
  if (weakness) return { error: weakness };

  getDb()
    .prepare("UPDATE users SET password_hash = ? WHERE id = ?")
    .run(await hashPassword(next), user.id);

  await logAudit("password.changed", { userId: user.id });

  // Anyone signed in elsewhere on a stolen session is now signed out. The
  // current browser gets a fresh cookie on the next request.
  destroyAllSessions(user.id);

  return { success: "Password changed. You'll need to sign in again." };
}

/** Step one of turning on 2FA: make a secret and show it as a QR code. */
export async function beginTwoFactor(): Promise<SettingsState> {
  await requireUser();
  return { secret: generateSecret() };
}

/** Step two: prove the authenticator app is working before switching it on. */
export async function confirmTwoFactor(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  const secret = String(formData.get("secret") ?? "");
  const code = String(formData.get("code") ?? "").trim();

  if (!secret) return { error: "Something went wrong — please start again." };

  if (!verifyCode(secret, code)) {
    return {
      secret,
      error:
        "That code wasn't right. Check the six digits currently showing in your app.",
    };
  }

  // Only the hashes are stored, so this is genuinely the one and only time
  // these codes can be displayed.
  const recoveryCodes = generateRecoveryCodes();
  getDb()
    .prepare(
      `UPDATE users SET totp_secret = ?, totp_enabled = 1, recovery_codes = ?
       WHERE id = ?`,
    )
    .run(
      secret,
      JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
      user.id,
    );

  await logAudit("twofactor.enabled", { userId: user.id });
  revalidatePath("/admin/settings");

  return {
    success: "Two-factor authentication is on.",
    recoveryCodes,
  };
}

/** Runs the nightly backup immediately — for testing it, or before a holiday. */
export async function runBackupNow(): Promise<SettingsState> {
  const user = await requireUser();
  const result = await runNightlyBackup();

  await logAudit("backup.exported", {
    userId: user.id,
    detail: `manual run: ${result.status} — ${result.detail}`,
  });
  revalidatePath("/admin/settings");

  return result.status === "ok"
    ? { success: `Backup saved to ${result.destinations.join(" and ")}.` }
    : { error: result.detail };
}

/** Sends tomorrow's reminders now, rather than waiting for the evening run. */
export async function sendRemindersNow(): Promise<SettingsState> {
  await requireUser();
  const result = await sendTomorrowsReminders();
  revalidatePath("/admin/settings");

  if (result.considered === 0) {
    return { success: "Nothing booked tomorrow that needs a reminder." };
  }
  if (result.failed > 0) {
    return {
      error: `${result.sent} sent, ${result.failed} failed: ${result.detail.join("; ")}`,
    };
  }
  return {
    success: `${result.sent} reminder${result.sent === 1 ? "" : "s"} sent${
      result.skipped ? `, ${result.skipped} skipped` : ""
    }.`,
  };
}

export async function disableTwoFactor(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const user = await requireUser();

  // Requiring the password here stops someone who finds an unlocked laptop
  // from quietly removing the second factor.
  const password = String(formData.get("password") ?? "");
  if (!(await verifyPassword(password, user.password_hash))) {
    return { error: "Password wasn't right." };
  }

  getDb()
    .prepare(
      `UPDATE users SET totp_secret = NULL, totp_enabled = 0, recovery_codes = NULL
       WHERE id = ?`,
    )
    .run(user.id);

  await logAudit("twofactor.disabled", { userId: user.id });
  revalidatePath("/admin/settings");

  return { success: "Two-factor authentication is off." };
}
