/**
 * Persists the user's chosen AOAI deployment in localStorage so it survives
 * reloads and is shared across pages. Falls back to the server's default
 * when no choice is stored.
 */
const KEY = "fsdemo.selectedModel";

export const modelStore = {
  get(): string | null {
    try {
      return localStorage.getItem(KEY);
    } catch {
      return null;
    }
  },
  set(value: string | null): void {
    try {
      if (value) localStorage.setItem(KEY, value);
      else localStorage.removeItem(KEY);
    } catch {
      // localStorage full / disabled — non-fatal.
    }
  },
};
