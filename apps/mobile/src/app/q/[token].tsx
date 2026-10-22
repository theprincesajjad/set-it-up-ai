import { Redirect, useLocalSearchParams } from "expo-router";

/** Universal link /q/<token> → Quote approval. */
export default function QuoteLink() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <Redirect href={`/quote/${token}`} />;
}
