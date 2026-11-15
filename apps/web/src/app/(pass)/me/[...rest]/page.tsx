import { notFound } from "next/navigation";

/** Any unknown URL under /me: send it to the pass not-found page, so the 404 keeps the customer's own header (not the business site's). */
export default function UnknownPassPage() {
  notFound();
}
