import { redirect } from "next/navigation";
import IdleGuard from "@/components/admin/IdleGuard";
import Sidebar from "@/components/admin/Sidebar";
import { getCurrentUser, IDLE_MINUTES, userCount } from "@/lib/auth";
import { configProblems } from "@/lib/config-status";
import { countNewEnquiries } from "@/lib/enquiries";
import { countOverdue } from "@/lib/tasks";

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
      <Sidebar
        user={{
          name: user.name,
          email: user.email,
          jobTitle: user.job_title ?? null,
          photoPath: user.photo_path ?? null,
          role: user.role ?? "owner",
        }}
        counts={{
          overdueTasks: countOverdue(),
          newEnquiries: countNewEnquiries(),
        }}
      />

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
