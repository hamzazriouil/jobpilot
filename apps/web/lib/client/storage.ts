// localStorage wrappers that never throw. Storage can be missing (SSR), blocked (privacy settings,
// sandboxed iframes) or full; the page must work the same without it, just without remembering.

/** Keys are brand-neutral so a rename doesn't wipe what users saved. */
export const STORAGE_KEYS = Object.freeze({
  cv: 'jp.cv.v1',
  country: 'jp.country.v1',
  theme: 'jp.theme.v1',
});

export function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function storageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function storageRemove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // nothing stored, or storage unavailable
  }
}
