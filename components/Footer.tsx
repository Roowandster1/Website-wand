import Link from "next/link";
import { availability, contact, nav, site } from "@/content/site";

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
            <h3>{site.name}</h3>
            <p style={{ color: "var(--ink-soft)", marginBottom: 0 }}>
              {site.credentials}
              <br />
              {site.tagline}
            </p>
          </div>

          <div>
            <h3>Get in touch</h3>
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

          <div>
            <h3>Where &amp; when</h3>
            <ul>
              {contact.locations.map((place) => (
                <li key={place} style={{ color: "var(--ink-soft)" }}>
                  {place}
                </li>
              ))}
              <li style={{ color: "var(--ink-soft)" }}>{availability.hours}</li>
            </ul>
          </div>
        </div>

        <div className="footer-bottom">
          <p>
            © {new Date().getFullYear()} {site.name}
          </p>
          <p>Registered member of the BACP · Accredited</p>
        </div>
      </div>
    </footer>
  );
}
