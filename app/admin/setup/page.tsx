import type { Metadata } from "next";
import { redirect } from "next/navigation";
import SetupForm from "./SetupForm";
import { userCount } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Set up your account",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function SetupPage() {
  if (userCount() > 0) redirect("/admin/login");

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <h1>Set up your account</h1>
        <p className="auth-sub">
          This is a one-off. Once your account exists, this page closes itself
          and nobody can use it to create another.
        </p>
        <SetupForm />
      </div>
    </div>
  );
}
