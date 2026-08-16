"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/admin/actions";

const links = [
  { href: "/admin", label: "Today" },
  { href: "/admin/diary", label: "Diary" },
  { href: "/admin/clients", label: "Clients" },
  { href: "/admin/payments", label: "Payments" },
  { href: "/admin/settings", label: "Settings" },
];

export default function AdminNav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const current = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;

  return (
    <header className="admin-nav">
      <div className="admin-nav-inner">
        <Link href="/admin" className="admin-brand">
          Practice admin
        </Link>

        <nav aria-label="Admin">
          {links.map((link) => {
            const active =
              link.href === "/admin"
                ? current === "/admin"
                : current.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="admin-user">
          <span>{userName}</span>
          <form action={logout}>
            <button type="submit" className="link-button">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </header>
  );
}
