import type { Metadata } from "next";
import { BRAND } from "@ll/shared";
import { Container } from "@/components/ui/Layout";
import { preloadInter } from "@/lib/fonts/inter";

export const metadata: Metadata = {
  title: "Accessibility",
  description: `How ${BRAND.name} is built to WCAG 2.2 AA for customers, staff and shop owners, and how to tell us when something does not work for you.`,
  alternates: { canonical: "/accessibility" },
};

export default function AccessibilityPage() {
  preloadInter();
  return (
    <Container size="prose" className="py-12 md:py-20">
      <div className="prose-ll">
        <h1>Accessibility</h1>
        <p>
          We want {BRAND.name} to work for everyone: customers at the counter, staff in a rush and owners on their phone. We design to WCAG 2.2 AA: readable contrast in light and dark mode,
          large touch targets, visible focus, labels on every field, and screens that work with screen readers and at 200% text size.
        </p>
        <p>
          If something doesn’t work for you, tell us at <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a> and we’ll fix it or help you another way. We follow the Accessibility for
          Ontarians with Disabilities Act (AODA).
        </p>
      </div>
    </Container>
  );
}
