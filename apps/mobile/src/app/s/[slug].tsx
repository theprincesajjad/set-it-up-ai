import { Redirect, useLocalSearchParams } from "expo-router";

/** Universal link /s/<slug> → Shop detail. */
export default function ShopLink() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  return <Redirect href={`/shop/${slug}`} />;
}
