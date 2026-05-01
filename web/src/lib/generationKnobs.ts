/**
 * Per-org generation knob persistence. Stores the user's preferred mix of
 * WO status / priority / scheduling window in localStorage so a reload of
 * the Generate page reuses the same settings.
 */

export interface GenerationKnobs {
  /** Total work orders to generate. Hard limit kept at 60 to avoid runaway demos. */
  woCount: number;
  /** Status mix as percentages (must sum to 100). Closed-Posted goes through the close phase. */
  statusMix: {
    openUnscheduled: number;
    scheduled: number;
    closedPosted: number;
  };
  /**
   * Priority mix as percentages (must sum to 100). Each percentage maps to a
   * `msdyn_priority` record by name; orgs missing a given priority gracefully
   * skip that field on the WO.
   */
  priorityMix: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  /** Schedule window for future / future-dated bookings (Scheduled WOs). */
  daysForward: number;
  /** Backdate window for Closed-Posted bookings (history depth). */
  daysBackward: number;
  /** Workday starts at this local hour (0–23). Bookings land between here and start+8h. */
  workdayStartHour: number;
}

export const DEFAULT_KNOBS: GenerationKnobs = {
  woCount: 24,
  statusMix: { openUnscheduled: 50, scheduled: 33, closedPosted: 17 },
  priorityMix: { low: 10, medium: 60, high: 25, critical: 5 },
  daysForward: 14,
  daysBackward: 21,
  workdayStartHour: 9,
};

const KEY_PREFIX = "fsdl:knobs:";
const keyFor = (orgUrl: string) => `${KEY_PREFIX}${orgUrl}`;

export const generationKnobs = {
  load(orgUrl: string): GenerationKnobs {
    try {
      const raw = localStorage.getItem(keyFor(orgUrl));
      if (!raw) return { ...DEFAULT_KNOBS };
      const parsed = JSON.parse(raw) as Partial<GenerationKnobs>;
      // Merge over defaults so newly-added knobs get their default value
      // when an older blob is loaded.
      return {
        ...DEFAULT_KNOBS,
        ...parsed,
        statusMix: { ...DEFAULT_KNOBS.statusMix, ...(parsed.statusMix ?? {}) },
        priorityMix: { ...DEFAULT_KNOBS.priorityMix, ...(parsed.priorityMix ?? {}) },
      };
    } catch {
      return { ...DEFAULT_KNOBS };
    }
  },
  save(orgUrl: string, knobs: GenerationKnobs) {
    try {
      localStorage.setItem(keyFor(orgUrl), JSON.stringify(knobs));
    } catch {
      /* localStorage full / private mode — ignore */
    }
  },
};

/**
 * Build a length-`count` array of FS systemstatus codes following the given
 * statusMix percentages. Closed-Posted entries are marked by 690970004 even
 * though the WO is initially created as Open-Unscheduled — the seeder uses
 * this code as a "transition to Posted at the end" marker.
 */
export function buildStatusBag(count: number, mix: GenerationKnobs["statusMix"]): number[] {
  const total = mix.openUnscheduled + mix.scheduled + mix.closedPosted;
  if (total <= 0) return new Array(count).fill(690970000);
  const targetOpen = Math.round((count * mix.openUnscheduled) / total);
  const targetSched = Math.round((count * mix.scheduled) / total);
  const targetClosed = Math.max(0, count - targetOpen - targetSched);
  const bag: number[] = [];
  for (let i = 0; i < targetOpen; i++) bag.push(690970000);
  for (let i = 0; i < targetSched; i++) bag.push(690970001);
  for (let i = 0; i < targetClosed; i++) bag.push(690970004);
  return bag;
}

/** Same shape as `buildStatusBag` but for priority percentages. Returns an
 * array of priority *names* — the seeder resolves them to `msdyn_priority`
 * record ids at runtime so missing priorities can be skipped per-org. */
export function buildPriorityBag(count: number, mix: GenerationKnobs["priorityMix"]): string[] {
  const total = mix.low + mix.medium + mix.high + mix.critical;
  if (total <= 0) return new Array(count).fill("Medium");
  const targetLow = Math.round((count * mix.low) / total);
  const targetMed = Math.round((count * mix.medium) / total);
  const targetHigh = Math.round((count * mix.high) / total);
  const targetCrit = Math.max(0, count - targetLow - targetMed - targetHigh);
  const bag: string[] = [];
  for (let i = 0; i < targetLow; i++) bag.push("Low");
  for (let i = 0; i < targetMed; i++) bag.push("Medium");
  for (let i = 0; i < targetHigh; i++) bag.push("High");
  for (let i = 0; i < targetCrit; i++) bag.push("Critical");
  return bag;
}

/** Fisher–Yates shuffle keyed off a numeric seed so re-runs land deterministically. */
export function deterministicShuffle<T>(arr: T[], seed: number): T[] {
  const out = arr.slice();
  let s = seed >>> 0;
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) >>> 0;
    const j = s % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
