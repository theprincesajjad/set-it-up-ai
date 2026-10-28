import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "../state/api";
import { qk } from "../state/query";
import { useSession } from "../state/session";
import { useAppearance } from "../theme";
import { appearanceFromPayload } from "../theme/appearance";

/**
 * Feeds the signed-in user's theme setting (the one the web keeps) into the root theme. Reads the session's `me` payload and, in
 * the customer app, the profile it already caches; a field that does not exist yet simply leaves Clear in charge.
 * Mounted once under SessionProvider; renders nothing.
 */
export function AppearanceSync() {
  const { status, mode, user } = useSession();
  const { setUser } = useAppearance();
  const profile = useQuery({ queryKey: qk.me, queryFn: api.me.profile, enabled: status === "signedIn" && mode === "customer" });
  const fromProfile = appearanceFromPayload(profile.data);
  const fromUser = appearanceFromPayload(user);
  const style = fromProfile?.style ?? fromUser?.style ?? null;
  const scheme = fromProfile?.scheme ?? fromUser?.scheme ?? null;
  useEffect(() => {
    setUser(status === "signedIn" && (style || scheme) ? { style, scheme } : null);
  }, [status, style, scheme, setUser]);
  return null;
}
