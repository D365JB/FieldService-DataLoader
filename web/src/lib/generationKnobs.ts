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
  /**
   * When true, technician booking selection is weighted (some techs get
   * 2-3× more bookings than others) instead of plain round-robin. Weights
   * are derived deterministically from the technician name so re-runs are
   * stable.
   */
  weightedTechs: boolean;
  /**
   * When true, only technicians whose `primarySkill` substring-matches the
   * WO's incident type get considered for that WO's booking. Falls back to
   * all techs when no match exists, so demos still work.
   */
  skillMatch: boolean;
}

export const DEFAULT_KNOBS: GenerationKnobs = {
  woCount: 24,
  statusMix: { openUnscheduled: 50, scheduled: 33, closedPosted: 17 },
  priorityMix: { low: 10, medium: 60, high: 25, critical: 5 },
  daysForward: 14,
  daysBackward: 21,
  workdayStartHour: 9,
  weightedTechs: true,
  skillMatch: false,
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

/**
 * Deterministic 1–3 weight derived from a string. Used by the weighted
 * technician picker so the same name always gets the same multiplier
 * across runs (useful for "top performer always has the most bookings").
 */
export function weightFromName(name: string): number {
  let h = 5381;
  for (let i = 0; i < name.length; i++) h = ((h << 5) + h + name.charCodeAt(i)) | 0;
  return 1 + Math.abs(h) % 3; // 1, 2, or 3
}

/**
 * Returns indices into `techNames` whose primarySkill substring-matches
 * the incidentName. Match is case-insensitive in either direction. When
 * `enabled` is false (or the filter would be empty), all indices are
 * returned so booking still happens.
 */
export function filterTechsBySkill(
  techNames: string[],
  techSkills: string[],
  incidentName: string,
  enabled: boolean,
): number[] {
  const all = techNames.map((_, i) => i);
  if (!enabled) return all;
  const incidentLower = incidentName.toLowerCase();
  const matched = all.filter((i) => {
    const skill = (techSkills[i] ?? "").toLowerCase();
    if (!skill) return false;
    return skill.includes(incidentLower) || incidentLower.includes(skill);
  });
  return matched.length > 0 ? matched : all;
}
