import { redirect } from "next/navigation";
import AdminNav from "@/components/admin/AdminNav";
import IdleGuard from "@/components/admin/IdleGuard";
import { getCurrentUser, IDLE_MINUTES, userCount } from "@/lib/auth";
import { configProblems } from "@/lib/config-status";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * The authentication boundary. Every page holding client data renders inside
 * this layout, and this is the check that actually decides access.
 *
 * Middleware only sees whether a cookie exists; an expired or revoked session
 * still carries one. Only this database lookup can tell the difference, so
 * never treat "the page rendered" as proof of a valid session.
 */
export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    if (userCount() === 0) redirect("/admin/setup");
    redirect("/admin/login");
  }

  const problems = configProblems();

  return (
    <div className="admin">
      <AdminNav userName={user.name} />
      <div className="admin-main">
        {problems.length > 0 && (
          <div className="callout callout-warn" style={{ marginBottom: "1.5rem" }}>
            <h2>Needs setting up on the server</h2>
            {problems.map((problem) => (
              <p key={problem.title}>
                <strong>{problem.title}.</strong> {problem.detail}
              </p>
            ))}
          </div>
        )}
        {children}
      </div>
      <IdleGuard idleMinutes={IDLE_MINUTES} />
    </div>
  );
}
