/**
 * Key/value store for secrets (tokens). Native: expo-secure-store (Keychain /
 * Android Keystore). Web (Expo web preview / screenshots): secureStore.web.ts.
 */
export { getItemAsync, setItemAsync, deleteItemAsync } from "expo-secure-store";
