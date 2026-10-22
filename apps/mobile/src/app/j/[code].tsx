import { Redirect, useLocalSearchParams } from "expo-router";
import { useSession } from "../../state/session";

/** Universal link /j/<qrCode> (counter QR stand): onboarding with the shop context, or straight to joining. */
export default function JoinLink() {
  const { code } = useLocalSearchParams<{ code: string }>();
  const { status } = useSession();
  if (status === "loading") return null;
  if (status === "signedOut") return <Redirect href={{ pathname: "/welcome", params: { join: code } }} />;
  return <Redirect href={{ pathname: "/name", params: { join: code, returning: "1" } }} />;
}
