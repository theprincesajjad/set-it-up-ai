import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSession } from "../state/session";
import { useTheme } from "../theme";

/** Entry: onboarding until signed in; then the customer tabs or counter mode. */
export default function Index() {
  const { status, mode } = useSession();
  const { c } = useTheme();
  if (status === "loading") return <View style={{ flex: 1, backgroundColor: c.canvas }} />;
  if (status === "signedOut") return <Redirect href="/welcome" />;
  return <Redirect href={mode === "counter" ? "/counter" : "/home"} />;
}
