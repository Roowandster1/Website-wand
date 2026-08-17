import Footer from "@/components/Footer";
import Header from "@/components/Header";
import PageViewTracker from "@/components/PageViewTracker";

/**
 * The public site.
 *
 * Everything sits inside `.site-root`, which is what the public half of
 * globals.css is scoped to. The admin dashboard shares the form and button
 * primitives but nothing else, so a change to the website's proportions can't
 * quietly reshape a client record.
 */
export default function SiteLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="site-root">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Header />
      <main id="main">{children}</main>
      <Footer />
      <PageViewTracker />
    </div>
  );
}
