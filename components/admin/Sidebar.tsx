"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { logout } from "@/app/admin/actions";
import { navGroups } from "@/lib/nav";

export type SidebarUser = {
  name: string;
  email: string;
  jobTitle: string | null;
  photoPath: string | null;
  role: string;
};

/** Initials, for when there is no photograph — nicer than a grey silhouette. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export default function Sidebar({
  user,
  counts,
}: {
  user: SidebarUser;
  counts: { overdueTasks: number; newEnquiries: number };
}) {
  const pathname = usePathname();
  const current = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;
  const [open, setOpen] = useState(false);

  // Escape closes the drawer, same as tapping the scrim.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function isActive(href: string) {
    // "/admin" is only itself; everything else also matches its sub-pages, so a
    // client record still highlights Clients.
    return href === "/admin" ? current === "/admin" : current.startsWith(href);
  }

  return (
    <>
      {/* Only on narrow screens: the sidebar is a drawer rather than a column. */}
      <button
        className="sidebar-toggle"
        type="button"
        aria-expanded={open}
        aria-controls="admin-sidebar"
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">☰</span> Menu
      </button>

      <aside
        id="admin-sidebar"
        className={`sidebar${open ? " is-open" : ""}`}
        data-testid="sidebar"
      >
        <div className="sidebar-brand">
          <span className="sidebar-brand-name">
            <span className="sidebar-brand-mark" aria-hidden="true" />
            <span>Practice</span>
          </span>

          {/* Only on narrow screens, and only while the drawer is out. The
              floating Menu button hides itself when open, so there is exactly
              one control on screen instead of two on top of each other. */}
          <button
            className="sidebar-close"
            type="button"
            aria-label="Close menu"
            aria-controls="admin-sidebar"
            onClick={() => setOpen(false)}
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Sections">
          {navGroups.map((group) => (
            <div className="sidebar-group" key={group.heading}>
              <p className="sidebar-heading">{group.heading}</p>
              {group.items.map((item) => {
                const count = item.badge ? counts[item.badge] : 0;

                if (!item.ready) {
                  return (
                    <span className="sidebar-link is-unbuilt" key={item.href}>
                      {item.label}
                      <span className="sidebar-soon">soon</span>
                    </span>
                  );
                }

                return (
                  <Link
                    className="sidebar-link"
                    key={item.href}
                    href={item.href}
                    aria-current={isActive(item.href) ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                    {count > 0 && (
                      <span className="sidebar-badge" aria-label={`${count} needing attention`}>
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Pinned to the bottom: who is signed in, and how to stop being. */}
        <div className="sidebar-user">
          <div className="sidebar-avatar" aria-hidden="true">
            {user.photoPath ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.photoPath} alt="" width={40} height={40} />
            ) : (
              initials(user.name)
            )}
          </div>
          <div className="sidebar-identity">
            <p className="sidebar-name">{user.name}</p>
            <p className="sidebar-meta">{user.jobTitle ?? user.role}</p>
            <p className="sidebar-meta" title={user.email}>
              {user.email}
            </p>
          </div>
          <form action={logout}>
            <button className="sidebar-signout" type="submit" title="Sign out">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {open && (
        <button
          className="sidebar-scrim"
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
    </>
  );
}
