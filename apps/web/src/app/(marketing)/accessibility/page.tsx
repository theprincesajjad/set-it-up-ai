import type { Metadata } from "next";
import { BRAND } from "@ll/shared";
import { Container } from "@/components/ui/Layout";

export const metadata: Metadata = { title: "Accessibility", alternates: { canonical: "/accessibility" } };

export default function AccessibilityPage() {
  return (
    <Container size="prose" className="py-12">
      <div className="prose-ll">
        <h1>Accessibility</h1>
        <p>
          We want {BRAND.name} to work for everyone: customers at the counter, staff in a rush and owners on their phone. We design to WCAG 2.2 AA: readable contrast in light and dark mode,
          large touch targets, visible focus, labels on every field, and screens that work with screen readers and at 200% text size.
        </p>
        <p>
          If something doesn&apos;t work for you, tell us at <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a> and we&apos;ll fix it or help you another way. We follow the Accessibility for
          Ontarians with Disabilities Act (AODA).
        </p>
      </div>
    </Container>
  );
}
