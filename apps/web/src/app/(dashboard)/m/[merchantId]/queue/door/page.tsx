import { redirect } from "next/navigation";

/** The door tablet moved out of the dashboard to a page with no menu around it. Old bookmarks land there. */
export default async function DoorRedirect({ params }: { params: Promise<{ merchantId: string }> }) {
  const { merchantId } = await params;
  redirect(`/door/${merchantId}`);
}
