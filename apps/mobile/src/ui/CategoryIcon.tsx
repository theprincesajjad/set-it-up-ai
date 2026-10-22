import { categoryAsset, verticalCategory, type MapCategoryId, type VerticalCategory } from "@ll/design-tokens";
import { Image, type ImageSourcePropType, type ImageStyle, type StyleProp } from "react-native";

/**
 * The category object illustrations (packages/design-tokens/assets/categories):
 * small flat-3D objects (cup, croissant, bowl...). Metro picks @2x / @3x.
 */
const SOURCES: Record<string, ImageSourcePropType> = {
  top: require("@ll/design-tokens/assets/categories/top.png"),
  coffee: require("@ll/design-tokens/assets/categories/coffee.png"),
  bakery: require("@ll/design-tokens/assets/categories/bakery.png"),
  eat: require("@ll/design-tokens/assets/categories/eat.png"),
  shops: require("@ll/design-tokens/assets/categories/shops.png"),
  beauty: require("@ll/design-tokens/assets/categories/beauty.png"),
  repair: require("@ll/design-tokens/assets/categories/repair.png"),
  services: require("@ll/design-tokens/assets/categories/services.png"),
};

export function categorySource(category: MapCategoryId | VerticalCategory): ImageSourcePropType {
  return SOURCES[categoryAsset[category]] ?? SOURCES.services!;
}

export function CategoryIcon({ category, vertical, size = 28, style }: { category?: MapCategoryId | VerticalCategory; vertical?: string | null; size?: number; style?: StyleProp<ImageStyle> }) {
  const cat = category ?? verticalCategory(vertical);
  return <Image source={categorySource(cat)} style={[{ width: size, height: size }, style]} resizeMode="contain" accessibilityIgnoresInvertColors accessibilityElementsHidden />;
}
