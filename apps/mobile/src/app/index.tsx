import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSession } from "../state/session";
import { useTheme } from "../theme";

/** Entry: onboarding until signed in; then Explore (the map is home) or counter mode. */
export default function Index() {
  const { status, mode } = useSession();
  const { c } = useTheme();
  if (status === "loading") return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (status === "signedOut") return <Redirect href="/welcome" />;
  return <Redirect href={mode === "counter" ? "/counter" : "/map"} />;
}
