/**
 * JS side of the local PassKit module (modules/ll-passkit/ios). Present only in an iOS dev/production build: Expo Go, Android
 * and web get `null`, and the app falls back to opening the signed .pkpass link (iOS shows the same Add sheet from Safari).
 */
import { requireNativeView, requireOptionalNativeModule } from "expo";
import type { ComponentType } from "react";
import type { ViewProps } from "react-native";

export interface LlPassKitNative {
  canAddPasses(): boolean;
  /** "added" | "cancelled"; rejects with ERR_NOT_CONFIGURED, ERR_INVALID_PASS, ERR_NETWORK, ... */
  addPassFromUrl(url: string): Promise<"added" | "cancelled">;
}

export const LlPassKit = requireOptionalNativeModule<LlPassKitNative>("LlPassKit");

export type AddPassButtonProps = ViewProps & { onPress?: () => void; style?: ViewProps["style"]; buttonStyle?: "black" | "blackOutline" };

/** Apple's PKAddPassButton, or null when the native module isn't in this build. */
export const NativeAddPassButton: ComponentType<AddPassButtonProps> | null = LlPassKit ? (requireNativeView("LlPassKit") as ComponentType<AddPassButtonProps>) : null;
