import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { getMe } from "@/lib/auth/session";

/**
 * Every /dev page is a 404 on a production build unless the stack is a test stack (OTP_AUTOFILL=1 or KIT_SHOWCASE=1) or the
 * visitor is a platform admin. The simulator pages are stricter still (`devPagesOnly`, no admin exception). The layout means a new
 * /dev page cannot forget the gate.
 */
export default async function DevLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production" && process.env.KIT_SHOWCASE !== "1" && process.env.OTP_AUTOFILL !== "1") {
    const me = await getMe().catch(() => null);
    if (me?.platformRole !== "admin") notFound();
  }
  return children;
}
