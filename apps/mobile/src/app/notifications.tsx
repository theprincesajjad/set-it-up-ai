import { InboxScreen } from "../features/customer/InboxScreen";

/** The same inbox pushed from a push notification or deep link: a back button instead of the profile one. */
export default function Notifications() {
  return <InboxScreen inTab={false} />;
}
