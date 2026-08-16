"use server";

import { redirect } from "next/navigation";
import { logAudit } from "@/lib/audit";
import { destroySession, getCurrentUser } from "@/lib/auth";

export async function logout() {
  const user = await getCurrentUser();
  if (user) await logAudit("logout", { userId: user.id });
  await destroySession();
  redirect("/admin/login");
}

/**
 * Guard for server actions. The layout protects page rendering, but a server
 * action is a POST endpoint anyone can call directly — it has to check for
 * itself rather than assume the caller came from a rendered page.
 */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/admin/login");
  return user;
}
