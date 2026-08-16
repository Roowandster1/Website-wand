"use server";

import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import {
  clearFailures,
  clearLoginAttempts,
  consumePendingLogin,
  createPendingLogin,
  createSession,
  isLocked,
  isRateLimited,
  recordLoginAttempt,
  registerFailure,
  verifyPassword,
  type User,
} from "@/lib/auth";
import { getDb } from "@/lib/db";
import { hashRecoveryCode, verifyCode } from "@/lib/totp";

export type LoginState = {
  error?: string;
  needsCode?: boolean;
  email?: string;
  pendingToken?: string;
};

/**
 * Every failure path returns the same message and takes a similar amount of
 * time. Telling an attacker "no such user" versus "wrong password" hands them
 * a way to discover which email addresses are real.
 */
const GENERIC_FAILURE = "Those details weren't right. Please try again.";

export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const pendingToken = String(formData.get("pendingToken") ?? "");

  // Second step of a two-factor sign-in: the password was already accepted and
  // the browser is coming back with just the code.
  if (pendingToken) {
    return completeTwoFactor(pendingToken, formData);
  }

  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Please fill in both your email and password." };
  }

  if (isRateLimited(email)) {
    await logAudit("login.locked", { detail: email });
    return {
      error:
        "Too many attempts. Please wait fifteen minutes before trying again.",
    };
  }
  recordLoginAttempt(email);

  const user = getDb()
    .prepare("SELECT * FROM users WHERE email = ?")
    .get(email) as User | undefined;

  if (!user) {
    // Spend roughly the time a real verification would, so a missing account
    // and a wrong password are indistinguishable from the outside.
    await verifyPassword(password, "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAA");
    await logAudit("login.failed", { detail: email });
    return { error: GENERIC_FAILURE };
  }

  if (isLocked(user)) {
    await logAudit("login.locked", { userId: user.id });
    return {
      error: "This account is temporarily locked. Please try again shortly.",
    };
  }

  if (!(await verifyPassword(password, user.password_hash))) {
    registerFailure(user.id);
    await logAudit("login.failed", { userId: user.id });
    return { error: GENERIC_FAILURE };
  }

  if (user.totp_enabled) {
    // React clears the form once this action returns, so the password is gone
    // from the page. Hand back a short-lived token instead — the second step
    // needs only that and the six digits.
    return {
      needsCode: true,
      email,
      pendingToken: createPendingLogin(user.id),
    };
  }

  // `succeed` always redirects, which throws — returning it lets TypeScript
  // see that this branch never falls through.
  return succeed(user, email);
}

async function completeTwoFactor(
  pendingToken: string,
  formData: FormData,
): Promise<LoginState> {
  const code = String(formData.get("code") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();

  const user = consumePendingLogin(pendingToken);
  if (!user) {
    return {
      error: "That took too long — please sign in again.",
    };
  }

  if (isLocked(user)) {
    await logAudit("login.locked", { userId: user.id });
    return { error: "This account is temporarily locked." };
  }

  if (!verifyTwoFactor(user, code)) {
    registerFailure(user.id);
    await logAudit("login.failed", { userId: user.id, detail: "bad 2fa code" });
    // A fresh token, so she can try the code again without retyping the
    // password — but the old one is already spent.
    return {
      needsCode: true,
      email: email || user.email,
      pendingToken: createPendingLogin(user.id),
      error: "That code wasn't right.",
    };
  }

  return succeed(user, user.email);
}

async function succeed(user: User, email: string): Promise<never> {
  clearFailures(user.id);
  clearLoginAttempts(email);
  await createSession(user.id);
  await logAudit("login.success", { userId: user.id });

  redirect("/admin");
}

/** Accepts either a live authenticator code or one unused recovery code. */
function verifyTwoFactor(user: User, code: string): boolean {
  if (!code) return false;
  if (user.totp_secret && verifyCode(user.totp_secret, code)) return true;

  // Stored hashed, so compare hashes rather than the codes themselves.
  const hashes: string[] = user.recovery_codes
    ? JSON.parse(user.recovery_codes)
    : [];
  const index = hashes.indexOf(hashRecoveryCode(code));
  if (index === -1) return false;

  // Recovery codes are single use — burn it immediately.
  hashes.splice(index, 1);
  getDb()
    .prepare("UPDATE users SET recovery_codes = ? WHERE id = ?")
    .run(JSON.stringify(hashes), user.id);
  return true;
}
