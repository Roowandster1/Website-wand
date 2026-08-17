import Link from "next/link";
import { contact, nav, site } from "@/content/site";

/**
 * Minimal and professional: who, how to reach her, where to go next, and the
 * registration line. Three columns on a wide screen, stacked on a phone.
 */
export default function Footer() {
  const socials = [
    { label: "Facebook", href: contact.facebook },
    { label: "Instagram", href: contact.instagram },
  ].filter((s) => s.href);

  return (
    <footer className="site-footer">
      <div className="wrap">
        <div className="footer-grid">
          <div>
            <h2>{site.name}</h2>
            <p className="fine" style={{ margin: 0 }}>
              {site.credentials}
            </p>
            <p className="fine" style={{ margin: "0.35rem 0 0" }}>
              {contact.locations.join(" · ")} · Online &amp; by phone
            </p>
          </div>

          <div>
            <h3>Contact</h3>
            <ul>
              <li>
                <a href={`tel:${contact.phoneLink}`}>{contact.phone}</a>
              </li>
              <li>
                <a href={`mailto:${contact.email}`}>{contact.email}</a>
              </li>
              {socials.map((s) => (
                <li key={s.label}>
                  <a href={s.href} rel="noopener noreferrer" target="_blank">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3>Pages</h3>
            <ul>
              {nav.map((item) => (
                <li key={item.href}>
                  <Link href={item.href}>{item.label}</Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} {site.name}
          </p>
          <p>Registered member of the BACP · Accredited</p>
          {/* How Elizabeth gets into her own dashboard. Kept in the footer,
              which is where every professional site puts a staff login: quiet
              enough that clients don't wonder what it is, and always in the
              same place so she never has to remember a web address.
              rel=nofollow because there is nothing here for a search engine —
              robots.txt already blocks /admin either way. */}
          <p>
            <Link href="/admin" rel="nofollow">
              Practice login
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
