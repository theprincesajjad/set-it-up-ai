import type { ViewStyle } from "react-native";

/**
 * Pressed feedback for anything tappable that is not a Button / ListRow / ShopTile (those draw their own).
 * Lands on press-in: rows and icon buttons dim, tiles and chips settle a touch smaller.
 */
export const pressFx = {
  dim: { opacity: 0.7 } satisfies ViewStyle,
  scale: { transform: [{ scale: 0.97 }] } satisfies ViewStyle,
};
