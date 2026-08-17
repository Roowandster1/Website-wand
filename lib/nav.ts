/**
 * The areas of the dashboard, in the order they appear down the sidebar.
 *
 * Grouped rather than one long list, because ten items in a flat column all
 * look equally important and none of them stand out. "Now" is what she opens
 * the morning on; "People" is the caseload; "Practice" is the running of it.
 *
 * `ready: false` marks an area that exists in the navigation but has not been
 * built yet. Showing it greyed and honest is better than hiding it, so nobody
 * wonders whether they have missed a menu.
 */
export type NavItem = {
  href: string;
  label: string;
  ready: boolean;
  /** Shown in the sidebar as a live count when there is something to act on. */
  badge?: "overdueTasks" | "newEnquiries";
};

export type NavGroup = { heading: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    heading: "Now",
    items: [
      { href: "/admin", label: "Today", ready: true },
      { href: "/admin/tasks", label: "Tasks", ready: true, badge: "overdueTasks" },
    ],
  },
  {
    heading: "People",
    items: [
      { href: "/admin/enquiries", label: "Enquiries", ready: true, badge: "newEnquiries" },
      { href: "/admin/clients", label: "Clients", ready: true },
      { href: "/admin/team", label: "Team", ready: true },
    ],
  },
  {
    heading: "Practice",
    items: [
      { href: "/admin/diary", label: "Diary", ready: true },
      { href: "/admin/payments", label: "Payments", ready: true },
      { href: "/admin/documents", label: "Documents", ready: false },
      { href: "/admin/reports", label: "Reports", ready: true },
      { href: "/admin/settings", label: "Settings", ready: true },
    ],
  },
];
