/**
 * Web fallback for secureStore.ts. Expo web is a preview/QA target only (the
 * customer web pass lives in apps/web), so tokens go in localStorage.
 */
function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export async function getItemAsync(key: string): Promise<string | null> {
  return ls()?.getItem(key) ?? null;
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  ls()?.setItem(key, value);
}

export async function deleteItemAsync(key: string): Promise<void> {
  ls()?.removeItem(key);
}
