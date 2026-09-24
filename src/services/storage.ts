/**
 * Local persistence. Replaces shared_preferences from the Flutter app.
 *
 * AsyncStorage ships inside Expo Go, so this works without a development
 * build — but it is still loaded defensively so a missing module degrades to
 * an in-memory session rather than crashing on launch.
 */

let mod: any;
let loadAttempted = false;

function load(): any {
  if (loadAttempted) return mod;
  loadAttempted = true;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-async-storage/async-storage').default;
  } catch {
    mod = undefined;
    console.log('[storage] AsyncStorage unavailable — settings will not persist.');
  }
  return mod;
}

export function isStorageAvailable(): boolean {
  return !!load();
}

export const KEYS = {
  prefs: 'sitwell:prefs',
  history: 'sitwell:history',
  theme: 'sitwell:theme',
} as const;

export async function loadJson<T>(key: string): Promise<T | null> {
  const store = load();
  if (!store) return null;
  try {
    const raw = await store.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (e) {
    console.log(`[storage] read ${key} failed: ${e}`);
    return null;
  }
}

export async function saveJson(key: string, value: unknown): Promise<void> {
  const store = load();
  if (!store) return;
  try {
    await store.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.log(`[storage] write ${key} failed: ${e}`);
  }
}

export async function clearStored(): Promise<void> {
  const store = load();
  if (!store) return;
  try {
    await store.multiRemove(Object.values(KEYS));
  } catch (e) {
    console.log(`[storage] clear failed: ${e}`);
  }
}
