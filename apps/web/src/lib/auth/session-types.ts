import type { authApi } from "@ll/shared";

/** What the /api/auth/* handlers return to the browser: the user, never the tokens. */
export interface SessionResponse {
  user: authApi.AuthUserDto;
  created: boolean;
}
