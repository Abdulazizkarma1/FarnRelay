// Cache only the public app shell. Never cache API responses or private media.
export function registerOfflineShell() {
  if (import.meta.env.PROD && "serviceWorker" in navigator)
    navigator.serviceWorker.register("/sw.js").catch(() => {});
}
