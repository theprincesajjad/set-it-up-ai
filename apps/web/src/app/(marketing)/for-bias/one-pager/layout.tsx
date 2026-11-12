import type { Metadata } from "next";

/** The one-pager itself is a client page (its Print button), so its title, description and canonical link live here. */
export const metadata: Metadata = {
  title: "A street campaign in one page, for BIAs",
  description: "A one-page summary for a BIA board or a grant application: what a passport week or points weekend is, what it costs, what the report measures and what it does not.",
  alternates: { canonical: "/for-bias/one-pager" },
};

export default function OnePagerLayout({ children }: { children: React.ReactNode }) {
  return children;
}
