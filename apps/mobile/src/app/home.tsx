import { Redirect } from "expo-router";

/** v1 route (`/home`, old deep links and notifications): the wallet tab replaced it. */
export default function HomeRedirect() {
  return <Redirect href="/wallet" />;
}
