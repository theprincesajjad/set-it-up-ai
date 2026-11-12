import { PageSkeleton } from "@/components/dashboard/PageStates";

/**
 * Shown inside the shop shell while a server-rendered page of the dashboard loads, so navigating gives immediate feedback and the menu
 * stays put. (The customer pages have no loading.tsx on purpose: a streaming response would turn their notFound() into a 200.)
 */
export default function Loading() {
  return <PageSkeleton />;
}
