"use server";

import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import {
  checkPasswordStrength,
  createSession,
  hashPassword,
  userCount,
} from "@/lib/auth";
import { getDb } from "@/lib/db";

export type SetupState = { error?: string };

/**
 * Creates the first and only account. Guarded by `userCount()` so this route
 * seals itself the moment an account exists — otherwise it would be a
 * permanent open door to making a new administrator.
 */
export async function createFirstUser(
  _prev: SetupState,
  formData: FormData,
): Promise<SetupState> {
  if (userCount() > 0) {
    return { error: "An account already exists. Please sign in instead." };
  }

  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (!name || !email || !password) {
    return { error: "Please fill in every field." };
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return { error: "That doesn't look like an email address." };
  }
  if (password !== confirm) {
    return { error: "The two passwords don't match." };
  }

  const weakness = checkPasswordStrength(password);
  if (weakness) return { error: weakness };

  const result = getDb()
    .prepare(
      "INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)",
    )
    .run(email, name, await hashPassword(password));

  const userId = Number(result.lastInsertRowid);
  await createSession(userId);
  await logAudit("login.success", { userId, detail: "first account created" });

  redirect("/admin/settings?welcome=1");
}
