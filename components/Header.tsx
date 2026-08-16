"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { nav, site } from "@/content/site";

export default function Header() {
  const pathname = usePathname();

  // Next.js is configured with trailingSlash, so "/about/" needs trimming
  // before it will match the plain "/about" in the nav config.
  const current = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;

  return (
    <header className="site-header">
      <div className="wrap header-inner">
        <Link href="/" className="brand">
          <span className="brand-name">{site.name}</span>
          <span className="brand-tagline">{site.tagline}</span>
        </Link>

        <nav className="site-nav" aria-label="Main">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={current === item.href ? "page" : undefined}
            >
              {item.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
