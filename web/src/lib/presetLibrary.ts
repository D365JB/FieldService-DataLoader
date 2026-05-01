/**
 * v1.42.3 — User preset library. Lets a presenter save the current
 * preset (after editing on the Review page) under a friendly name and
 * recall it later from the Analyze page, alongside the curated
 * DEMO_PACKS. Storage is per-browser in localStorage so saves survive
 * tab close/refresh but don't sync across devices — adequate for the
 * demo workflow.
 */
import type { FsPreset } from "@/lib/preset";

const STORAGE_KEY = "fs-presets";

export interface SavedPreset {
  /** Stable id (timestamp-based) so the React list can key off of it. */
  id: string;
  /** User-supplied display name. */
  name: string;
  /** ISO timestamp of when the preset was saved. */
  savedAt: string;
  /** Full preset payload — same shape as the AI-generated preset. */
  preset: FsPreset;
}

function readAll(): SavedPreset[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Defensive: drop entries that don't have at least an id and a preset.
    return parsed.filter(
      (e: unknown): e is SavedPreset =>
        !!e &&
        typeof e === "object" &&
        typeof (e as SavedPreset).id === "string" &&
        typeof (e as SavedPreset).name === "string" &&
        !!(e as SavedPreset).preset,
    );
  } catch {
    return [];
  }
}

function writeAll(entries: SavedPreset[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    // Quota exhaustion etc. — surface to console but don't crash the UI.
    console.warn("[presetLibrary] failed to persist saved presets:", err);
  }
}

export const presetLibrary = {
  list(): SavedPreset[] {
    // Newest first so recently saved presets surface at the top of the
    // picker.
    return readAll().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },
  save(name: string, preset: FsPreset): SavedPreset {
    const trimmed = name.trim() || preset.companyName || "Untitled preset";
    const entry: SavedPreset = {
      id: `sp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: trimmed,
      savedAt: new Date().toISOString(),
      // Deep-clone so later edits to the in-memory preset don't mutate
      // the saved copy.
      preset: JSON.parse(JSON.stringify(preset)) as FsPreset,
    };
    const existing = readAll();
    writeAll([entry, ...existing]);
    return entry;
  },
  remove(id: string): void {
    writeAll(readAll().filter((e) => e.id !== id));
  },
  rename(id: string, name: string): void {
    const trimmed = name.trim();
    if (!trimmed) return;
    writeAll(readAll().map((e) => (e.id === id ? { ...e, name: trimmed } : e)));
  },
};
