/**
 * Tenant-free shared-secret gate for the SPA.
 *
 * The Function App is locked behind an `APP_ACCESS_KEY` setting; the SPA
 * stores the user-entered key in localStorage and attaches it as
 * `x-app-key` on every `/api/*` call. We never round-trip the key to a
 * cookie/server-session; it just sits in localStorage and rides each
 * request, so it survives reloads but can be cleared instantly.
 *
 * MSAL / Dataverse access is unaffected — those tokens come from whatever
 * tenant the user signs in to. This gate is strictly about *who can use
 * this app at all*.
 */
const STORAGE_KEY = "fsdl:app-access-key";
const listeners = new Set<() => void>();

export const appKeyStore = {
  get(): string | null {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set(value: string): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, value);
    } catch {
      // Private browsing / quota errors. The header still works for the
      // current session via the in-memory copy returned by get() callers
      // who hold a reference. Best-effort.
    }
    for (const l of listeners) l();
  },
  clear(): void {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    for (const l of listeners) l();
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};

/**
 * fetch() wrapper that auto-attaches the `x-app-key` header for any
 * /api/* request. Use this everywhere instead of `fetch` so we never
 * forget the gate header.
 */
export async function apiFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const key = appKeyStore.get();
  const headers = new Headers(init.headers);
  if (key) headers.set("x-app-key", key);
  return fetch(input, { ...init, headers });
}
