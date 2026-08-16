import type { Metadata } from "next";
import { redirect } from "next/navigation";
import LoginForm from "./LoginForm";
import { getCurrentUser, userCount } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Sign in",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  // Nothing to sign in to until an account exists.
  if (userCount() === 0) redirect("/admin/setup");
  if (await getCurrentUser()) redirect("/admin");

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Practice admin</h1>
        <p className="auth-sub">
          Client records are confidential. Please sign in to continue.
        </p>
        <LoginForm />
      </div>
    </div>
  );
}
