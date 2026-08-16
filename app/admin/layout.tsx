import type { Metadata } from "next";
import "./admin.css";

/**
 * The outer admin shell deliberately does NOT check authentication — the login
 * and setup screens live under /admin too, and guarding here would send an
 * unauthenticated visitor to /admin/login in a loop forever.
 *
 * The real guard is in `(protected)/layout.tsx`, which every page that touches
 * client data renders inside.
 */

export const metadata: Metadata = {
  title: { default: "Practice admin", template: "%s · Practice admin" },
  robots: { index: false, follow: false, nocache: true },
};

// Client records must never be served from a cache.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="admin-root">{children}</div>;
}
