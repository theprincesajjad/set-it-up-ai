import { Redirect } from "expo-router";
import { View } from "react-native";
import { useSession } from "../state/session";
import { useTheme } from "../theme";

/** Entry: onboarding until signed in; then Explore (the map is home) or counter mode. */
export default function Index() {
  const { status, mode, user } = useSession();
  const { c } = useTheme();
  if (status === "loading") return <View style={{ flex: 1, backgroundColor: c.bg }} />;
  if (status === "signedOut") return <Redirect href="/welcome" />;
  // The account exists once the code is accepted: someone who quit on "What’s your name?" finishes that step first.
  if (mode !== "counter" && user && !user.name?.trim()) return <Redirect href="/name" />;
  return <Redirect href={mode === "counter" ? "/counter" : "/map"} />;
}
