/**
 * Persistent storage for the connected Dataverse environment URL and the last
 * AI-generated preset. Uses localStorage so values survive tab close / refresh
 * (sessionStorage was the previous behavior and forced a re-connect every visit).
 *
 * Reads fall back to sessionStorage so users with a prior session are migrated
 * forward seamlessly on first load.
 */
const ORG_KEY = "orgUrl";
const PRESET_KEY = "preset";

function read(key: string): string | null {
  try {
    const v = localStorage.getItem(key);
    if (v) return v;
    const legacy = sessionStorage.getItem(key);
    if (legacy) {
      localStorage.setItem(key, legacy);
      return legacy;
    }
  } catch {
    // ignore
  }
  return null;
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
    sessionStorage.setItem(key, value); // keep both in sync for back-compat
  } catch {
    // ignore
  }
}

function clear(key: string): void {
  try {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const orgStore = {
  getOrgUrl(): string | null {
    return read(ORG_KEY);
  },
  setOrgUrl(value: string): void {
    write(ORG_KEY, value);
  },
  clearOrgUrl(): void {
    clear(ORG_KEY);
  },
  getPreset(): string | null {
    return read(PRESET_KEY);
  },
  setPreset(value: string): void {
    write(PRESET_KEY, value);
  },
  clearPreset(): void {
    clear(PRESET_KEY);
  },
};
