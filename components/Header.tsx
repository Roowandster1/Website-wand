"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { contact, nav, site } from "@/content/site";

export default function Header() {
  const pathname = usePathname();
  const current = pathname.length > 1 ? pathname.replace(/\/$/, "") : pathname;

  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  // Close the menu on navigation. Without this, tapping a link leaves the
  // overlay covering the page you just asked for.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // The only thing scrolling does is bring in a hairline and take a little
  // padding out. Deliberately almost unnoticeable.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // While the menu is open the page behind it must not scroll, and Escape must
  // close it — both things people expect of a website and often don't get.
  useEffect(() => {
    if (!open) return;

    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.body.style.overflow = previous;
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const brand = (
    <>
      <span className="brand-name">{site.name}</span>
      <span className="brand-role">{site.role}</span>
    </>
  );

  return (
    <>
      <header className="masthead" data-scrolled={scrolled}>
        <div className="wrap masthead-inner">
          <Link href="/" className="masthead-brand">
            {brand}
          </Link>

          <nav className="masthead-nav" aria-label="Main">
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

          <button
            type="button"
            className="menu-toggle"
            aria-expanded={open}
            aria-controls="mobile-nav"
            onClick={() => setOpen((was) => !was)}
          >
            <span className="menu-bars" aria-hidden="true" />
            Menu
          </button>
        </div>
      </header>

      {open && (
        <div className="mobile-nav" id="mobile-nav">
          <div className="wrap mobile-nav-head">
            <Link
              href="/"
              className="masthead-brand"
              onClick={() => setOpen(false)}
            >
              {brand}
            </Link>
            <button
              type="button"
              className="menu-toggle"
              aria-expanded={true}
              aria-controls="mobile-nav"
              onClick={() => setOpen(false)}
            >
              <span className="menu-bars" aria-hidden="true" />
              Close
            </button>
          </div>

          <nav className="wrap" aria-label="Main">
            <ul className="mobile-nav-list">
              {nav.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={current === item.href ? "page" : undefined}
                    onClick={() => setOpen(false)}
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <div className="wrap mobile-nav-foot">
            <p className="kicker">Ring or text</p>
            <a className="tel" href={`tel:${contact.phoneLink}`}>
              {contact.phone}
            </a>
          </div>
        </div>
      )}
    </>
  );
}
