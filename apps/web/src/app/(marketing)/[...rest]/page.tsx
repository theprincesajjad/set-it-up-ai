import { notFound } from "next/navigation";
import { preloadInter } from "@/lib/fonts/inter";

/** Any unknown URL under this area: send it to this area's not-found.tsx, so the 404 keeps the shell and its navigation. */
export default function UnknownPage() {
  preloadInter();
  notFound();
}
