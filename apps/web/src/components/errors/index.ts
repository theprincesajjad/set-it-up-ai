/**
 * The error system. See USAGE in scratchpad/scan/fix/errors-core/USAGE.md.
 *
 * Client components:  ErrorPanel, ErrorScreen, RouteError, SessionGuard, ConsoleNotFound, DashNotFound, SignInAgainLink, RetryButton, SwitchAccountButton, GoBackButton
 * Server components:  FailScreen, ServiceUnreachable, AccessDenied (import from "@/components/errors/server")
 */
export { FailScreen, type FailScreenProps } from "./FailScreen";
export { ErrorPanel, ErrorScreen, useErrorCopy, helpLine, type ErrorViewProps } from "./ErrorView";
export { RouteError, detectLocale, type RouteErrorProps } from "./RouteError";
export { SessionGuard } from "./SessionGuard";
export { ConsoleNotFound, DashNotFound } from "./DashNotFound";
export { SignInAgainLink, RetryButton, SwitchAccountButton, GoBackButton, useCurrentPath, useSignInAgainHref } from "./actions";
export { audienceFromPath, merchantBase, isShopSide, type Audience } from "./audience";
