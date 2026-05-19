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
const RECENT_KEY = "fsdl:recentOrgs";
const MAX_RECENT = 8;

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
  /**
   * Recent orgs list (most-recent first, deduped, max 8). Surfaces in the
   * Connect page picker so users don't have to retype URLs every session.
   */
  getRecent(): string[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw) as unknown;
      return Array.isArray(arr)
        ? arr.filter((s): s is string => typeof s === "string")
        : [];
    } catch {
      return [];
    }
  },
  addRecent(value: string): void {
    const trimmed = value.replace(/\/+$/, "").trim();
    if (!trimmed) return;
    const existing = orgStore.getRecent().filter((u) => u !== trimmed);
    const next = [trimmed, ...existing].slice(0, MAX_RECENT);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  },
  removeRecent(value: string): void {
    const trimmed = value.replace(/\/+$/, "").trim();
    const next = orgStore.getRecent().filter((u) => u !== trimmed);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {
      // ignore
    }
  },
};
