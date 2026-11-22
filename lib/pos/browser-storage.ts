type StorageReader = {
 getItem: (key: string) => string | null;
};

type BrowserStorageReaders = {
 localStorage: StorageReader;
 sessionStorage: StorageReader;
};

export function readBrowserStorageItem(
 key: string,
 readers: BrowserStorageReaders = window,
): string | null {
 try {
  const localValue = readers.localStorage.getItem(key);
  if (localValue !== null) return localValue;
 } catch {
  // Managed WebViews can deny localStorage while still allowing sessionStorage.
 }
 try {
  return readers.sessionStorage.getItem(key);
 } catch {
  return null;
 }
}
