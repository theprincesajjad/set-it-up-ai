import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@ll/shared";
import { LoginTabs } from "@/components/auth/LoginTabs";
import { Container } from "@/components/ui/Layout";
import { safeNext } from "@/lib/routes";

export const metadata: Metadata = { title: "Sign in", alternates: { canonical: "/login" } };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function LoginPage({ searchParams }: Props) {
  const sp = await searchParams;
  const nextRaw = typeof sp.next === "string" ? sp.next : null;
  const next = nextRaw ? safeNext(nextRaw, "/") : null;
  const initial = sp.as === "customer" || next?.startsWith("/me") || next?.startsWith("/o/") ? "customer" : "shop";
  return (
    <Container size="public" className="py-12 md:py-20">
      <h1 className="display mb-8 text-mkt-sm text-balance md:text-mkt-md">Sign in to {BRAND.name.toLowerCase()}</h1>
      <LoginTabs next={next} initial={initial} devAutofill={process.env.NODE_ENV !== "production" || process.env.OTP_AUTOFILL === "1"} />
      <p className="mt-10 text-meta text-fg-muted">
        New shop?{" "}
        <Link href="/signup" className="font-semibold text-fg underline decoration-line-strong/60 underline-offset-2">
          Get started free
        </Link>
      </p>
    </Container>
  );
}
