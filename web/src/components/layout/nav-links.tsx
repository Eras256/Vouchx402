// Shared between the desktop navbar and the mobile sheet so the two
// never drift out of sync.
export const NAV_LINKS = [
  { href: "/", labelKey: "home" },
  { href: "/#how-it-works", labelKey: "howItWorks" },
  { href: "/#live-activity", labelKey: "liveActivity" },
  { href: "/#try-it", labelKey: "tryIt" },
  { href: "/docs", labelKey: "docs" },
] as const;
