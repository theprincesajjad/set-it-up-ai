import { redirect } from "next/navigation";

/**
 * The old shop list (plan ids, member counts) was a second, weaker copy of Businesses; wave P folds it into /admin/businesses. A
 * shop's support tools stay at /admin/merchants/[id], linked from the business page.
 */
export default function AdminMerchantsPage() {
  redirect("/admin/businesses");
}
