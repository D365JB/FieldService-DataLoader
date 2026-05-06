import { DataverseClient, oencode } from "@/lib/dataverse";
import type { FsPreset } from "@/lib/preset";
import {
  DEFAULT_KNOBS,
  MAX_WO_COUNT,
  buildStatusBag,
  buildPriorityBag,
  deterministicShuffle,
  filterTechsBySkill,
  weightFromName,
  type GenerationKnobs,
} from "@/lib/generationKnobs";
import {
  safeCreate,
  safeUpdate,
  type SafeWriteContext,
  type SkipInfo,
  type SkipReason,
} from "@/lib/fs/safeWrite";

/**
 * Inlined geocode helper. Was previously imported from `./geo` but Rollup
 * chunked both modules together and the closure inside `build()` could
 * reference the imported binding before the `geo` module finished
 * initialising → "Cannot access 'ut' before initialization" in production.
 * Inlining sidesteps the module-init order entirely.
 */
const TERRITORY_CENTRES: Record<string, { lat: number; lng: number }> = {
  PNW: { lat: 47.6062, lng: -122.3321 }, SEA: { lat: 47.6062, lng: -122.3321 },
  POR: { lat: 45.5152, lng: -122.6784 }, BAY: { lat: 37.7749, lng: -122.4194 },
  SFO: { lat: 37.7749, lng: -122.4194 }, SV: { lat: 37.3382, lng: -121.8863 },
  LA: { lat: 34.0522, lng: -118.2437 }, SD: { lat: 32.7157, lng: -117.1611 },
  PHX: { lat: 33.4484, lng: -112.074 }, DEN: { lat: 39.7392, lng: -104.9903 },
  SLC: { lat: 40.7608, lng: -111.891 }, LV: { lat: 36.1699, lng: -115.1398 },
  CTX: { lat: 30.2672, lng: -97.7431 }, ATX: { lat: 30.2672, lng: -97.7431 },
  DFW: { lat: 32.7767, lng: -96.797 }, HOU: { lat: 29.7604, lng: -95.3698 },
  SATX: { lat: 29.4241, lng: -98.4936 }, SAT: { lat: 29.4241, lng: -98.4936 },
  NOLA: { lat: 29.9511, lng: -90.0715 }, MIA: { lat: 25.7617, lng: -80.1918 },
  TPA: { lat: 27.9506, lng: -82.4572 }, ORL: { lat: 28.5384, lng: -81.3789 },
  ATL: { lat: 33.749, lng: -84.388 }, CLT: { lat: 35.2271, lng: -80.8431 },
  RDU: { lat: 35.7796, lng: -78.6382 }, NSH: { lat: 36.1627, lng: -86.7816 },
  NYC: { lat: 40.7128, lng: -74.006 }, NJ: { lat: 40.7357, lng: -74.1724 },
  PHL: { lat: 39.9526, lng: -75.1652 }, DC: { lat: 38.9072, lng: -77.0369 },
  BAL: { lat: 39.2904, lng: -76.6122 }, NE: { lat: 42.3601, lng: -71.0589 },
  BOS: { lat: 42.3601, lng: -71.0589 }, PIT: { lat: 40.4406, lng: -79.9959 },
  CLE: { lat: 41.4993, lng: -81.6944 }, CIN: { lat: 39.1031, lng: -84.512 },
  DET: { lat: 42.3314, lng: -83.0458 }, MW: { lat: 41.8781, lng: -87.6298 },
  CHI: { lat: 41.8781, lng: -87.6298 }, IND: { lat: 39.7684, lng: -86.1581 },
  STL: { lat: 38.627, lng: -90.1994 }, MSP: { lat: 44.9778, lng: -93.265 },
  KC: { lat: 39.0997, lng: -94.5786 }, OKC: { lat: 35.4676, lng: -97.5164 },
};
const US_CENTRE = { lat: 39.8283, lng: -98.5795 };

function geocodeTech(
  techName: string,
  territoryCode: string | undefined,
  territoryName: string | undefined,
): { lat: number; lng: number } {
  const base =
    (territoryCode && TERRITORY_CENTRES[territoryCode.toUpperCase()]) ||
    (territoryName &&
      TERRITORY_CENTRES[territoryName.replace(/\s+/g, "").toUpperCase()]) ||
    US_CENTRE;
  // djb2 hash → ±0.04° (~3 mi) jitter so techs in the same metro don't stack.
  let h = 5381;
  const seed = techName ?? "";
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  const a = ((h & 0xffff) / 0xffff) * 2 - 1;
  const b = (((h >>> 16) & 0xffff) / 0xffff) * 2 - 1;
  return { lat: base.lat + a * 0.04, lng: base.lng + b * 0.04 };
}

/**
 * v1.42.2 — Major-city centroids keyed by upper-case city name. Used by
 * `geocodeAccount` to plant each customer account on the FS map without
 * relying on Bing/Azure Maps lookups at seed time. List intentionally
 * matches the metros referenced in TERRITORY_CENTRES so the same
 * presets work for both. Unrecognised cities fall back to US_CENTRE.
 */
const CITY_CENTRES: Record<string, { lat: number; lng: number }> = {
  SEATTLE: { lat: 47.6062, lng: -122.3321 },
  PORTLAND: { lat: 45.5152, lng: -122.6784 },
  "SAN FRANCISCO": { lat: 37.7749, lng: -122.4194 },
  "SAN JOSE": { lat: 37.3382, lng: -121.8863 },
  "LOS ANGELES": { lat: 34.0522, lng: -118.2437 },
  "SAN DIEGO": { lat: 32.7157, lng: -117.1611 },
  PHOENIX: { lat: 33.4484, lng: -112.074 },
  DENVER: { lat: 39.7392, lng: -104.9903 },
  "SALT LAKE CITY": { lat: 40.7608, lng: -111.891 },
  "LAS VEGAS": { lat: 36.1699, lng: -115.1398 },
  AUSTIN: { lat: 30.2672, lng: -97.7431 },
  DALLAS: { lat: 32.7767, lng: -96.797 },
  HOUSTON: { lat: 29.7604, lng: -95.3698 },
  "SAN ANTONIO": { lat: 29.4241, lng: -98.4936 },
  "NEW ORLEANS": { lat: 29.9511, lng: -90.0715 },
  MIAMI: { lat: 25.7617, lng: -80.1918 },
  TAMPA: { lat: 27.9506, lng: -82.4572 },
  ORLANDO: { lat: 28.5384, lng: -81.3789 },
  ATLANTA: { lat: 33.749, lng: -84.388 },
  CHARLOTTE: { lat: 35.2271, lng: -80.8431 },
  RALEIGH: { lat: 35.7796, lng: -78.6382 },
  NASHVILLE: { lat: 36.1627, lng: -86.7816 },
  "NEW YORK": { lat: 40.7128, lng: -74.006 },
  "NEW YORK CITY": { lat: 40.7128, lng: -74.006 },
  NEWARK: { lat: 40.7357, lng: -74.1724 },
  PHILADELPHIA: { lat: 39.9526, lng: -75.1652 },
  WASHINGTON: { lat: 38.9072, lng: -77.0369 },
  BALTIMORE: { lat: 39.2904, lng: -76.6122 },
  BOSTON: { lat: 42.3601, lng: -71.0589 },
  PITTSBURGH: { lat: 40.4406, lng: -79.9959 },
  CLEVELAND: { lat: 41.4993, lng: -81.6944 },
  CINCINNATI: { lat: 39.1031, lng: -84.512 },
  DETROIT: { lat: 42.3314, lng: -83.0458 },
  CHICAGO: { lat: 41.8781, lng: -87.6298 },
  INDIANAPOLIS: { lat: 39.7684, lng: -86.1581 },
  "ST. LOUIS": { lat: 38.627, lng: -90.1994 },
  "ST LOUIS": { lat: 38.627, lng: -90.1994 },
  MINNEAPOLIS: { lat: 44.9778, lng: -93.265 },
  "KANSAS CITY": { lat: 39.0997, lng: -94.5786 },
  "OKLAHOMA CITY": { lat: 35.4676, lng: -97.5164 },
};

function geocodeAccount(
  accountName: string,
  city: string | undefined,
  state: string | undefined,
): { lat: number; lng: number } {
  const cityKey = (city ?? "").trim().toUpperCase();
  const base = CITY_CENTRES[cityKey] || US_CENTRE;
  // djb2 hash on name + city + state → ±0.05° (~3 mi) jitter so multiple
  // accounts in the same city plot as distinct pins.
  let h = 5381;
  const seed = `${accountName ?? ""}|${cityKey}|${(state ?? "").toUpperCase()}`;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  const a = ((h & 0xffff) / 0xffff) * 2 - 1;
  const b = (((h >>> 16) & 0xffff) / 0xffff) * 2 - 1;
  return { lat: base.lat + a * 0.05, lng: base.lng + b * 0.05 };
}

/**
 * Seeds the configuration tier (territories, WO types, incident types + service tasks,
 * characteristics, products) from a generated FsPreset.
 *
 * Idempotency strategy: query-by-name first; create only if absent. Every record gets
 * `description` prefixed with the DEMO_TAG so Reset can find them later. We don't rely
 * on Dataverse alternate keys being pre-configured (they often aren't on FS entities).
 */

export const DEMO_TAG = "DEMO-FS";

/**
 * Per-run delete order for entities tracked in `SeedResult.createdIds`. Keep
 * this list **child-first** so foreign-key constraints don't fail on delete.
 * Each phase prepends its own entries here as it ships:
 *   Phase 2: WO Service Tasks → Customer Assets → Functional Locations →
 *            Service Task Types
 *   Phase 3: Agreement Booking Products/Services/Incidents → Agreements →
 *            Agreement Booking Setup
 *   etc.
 */
const phase2EntityOrder: Array<{
  key: string;
  label: string;
  entitySet: string;
  /**
   * When to delete relative to Work Orders.
   *   "beforeWo" — entity references WO (FK from this → WO). Must be deleted
   *                first or WO deletion fails.
   *   "afterWo"  — WO references this entity. Delete only after WOs are gone.
   */
  phase: "beforeWo" | "afterWo";
}> = [
  // ── beforeWo (delete BEFORE work orders) ───────────────────────────────
  // These reference WOs directly, so must clear first.
  { key: "workOrderServiceTasks", label: "WO Service Tasks", entitySet: "msdyn_workorderservicetasks", phase: "beforeWo" },
  { key: "workOrderProducts", label: "WO Products", entitySet: "msdyn_workorderproducts", phase: "beforeWo" },
  { key: "timeEntries", label: "Time Entries", entitySet: "msdyn_timeentries", phase: "beforeWo" },
  // Incident-type → product mapping rows. Safe to delete before WOs since
  // the relationship is one-way (msdyn_workorderproduct does not FK back).
  { key: "incidentTypeProducts", label: "Incident Type Products", entitySet: "msdyn_incidenttypeproducts", phase: "beforeWo" },

  // ── afterWo (delete AFTER work orders, child-first) ────────────────────
  // Phase 6 — IoT alerts reference customer assets, delete before them.
  { key: "iotAlerts", label: "IoT Alerts", entitySet: "msdyn_iotalerts", phase: "afterWo" },
  // Phase 2 — assets / locations / task-type catalog.
  { key: "customerAssets", label: "Customer Assets", entitySet: "msdyn_customerassets", phase: "afterWo" },
  { key: "functionalLocations", label: "Functional Locations", entitySet: "msdyn_functionallocations", phase: "afterWo" },
  { key: "serviceTaskTypes", label: "Service Task Types", entitySet: "msdyn_servicetasktypes", phase: "afterWo" },
  // Phase 3 — agreement subtree (child-first).
  { key: "agreementBookingIncidents", label: "Agreement Booking Incidents", entitySet: "msdyn_agreementbookingincidents", phase: "afterWo" },
  { key: "agreementBookingProducts", label: "Agreement Booking Products", entitySet: "msdyn_agreementbookingproducts", phase: "afterWo" },
  { key: "agreementBookingServices", label: "Agreement Booking Services", entitySet: "msdyn_agreementbookingservices", phase: "afterWo" },
  { key: "agreementBookingSetups", label: "Agreement Booking Setups", entitySet: "msdyn_agreementbookingsetups", phase: "afterWo" },
  { key: "agreements", label: "Agreements", entitySet: "msdyn_agreements", phase: "afterWo" },
  // Auto-created demo price list — must be removed AFTER agreements release it.
  { key: "priceLists", label: "Price Lists", entitySet: "pricelevels", phase: "afterWo" },
  // Phase 5 — inventory (child-first).
  { key: "productInventory", label: "Product Inventory", entitySet: "msdyn_productinventories", phase: "afterWo" },
  { key: "warehouses", label: "Warehouses", entitySet: "msdyn_warehouses", phase: "afterWo" },
];

/**
 * Reset audit allowlist. Keys that DO appear in `result.createdIds` (because
 * they go through `trackCreated`) but are NOT registered in
 * `phase2EntityOrder` because they're swept later by a dedicated
 * `sweepIds(..., resultKey)` call (e.g. Technician Contacts, after Bookable
 * Resources are gone). Listing them here suppresses the misleading "Skipped
 * unknown entity" warning the audit pass would otherwise emit even though
 * those rows actually do get cleaned up.
 */
const KEYS_HANDLED_BY_DEDICATED_SWEEP = new Set<string>([
  "technicianContacts",
]);

export interface SeedProgress {
  step: string;
  done: number;
  total: number;
  detail?: string;
}

export interface SeedResult {
  territoryIds: Record<string, string>;
  workOrderTypeIds: Record<string, string>;
  incidentTypeIds: Record<string, string>;
  characteristicIds: Record<string, string>;
  productIds: Record<string, string>;
  accountIds: Record<string, string>;
  /**
   * All resources used by the run — includes both ones we created and ones the
   * user picked from existing org records via "use existing" mode.
   */
  resourceIds: Record<string, string>;
  /**
   * Subset of resources we actually created in this run. Per-run delete only
   * removes these; existing-org resources are protected.
   */
  createdResourceIds: string[];
  workOrderIds: string[];
  bookingIds: string[];
  /**
   * Generic id registry used by Phase 2+ entities (Functional Locations,
   * Customer Assets, Agreements, etc.). Keyed by a logical entity name —
   * e.g. `idMaps.functionalLocations[code] = guid`. The flat *Ids fields above
   * stay for backward compatibility with v1.5–v1.8 run history.
   *
   * Optional so v1.5–v1.8 history records (which don't have it) keep working.
   */
  idMaps?: Record<string, Record<string, string>>;
  /**
   * Subset of `idMaps` records we actually created (vs reused from "Use
   * existing"). Mirrors `createdResourceIds` for the new entity types.
   * Keyed the same way as `idMaps`. Optional for backward compat.
   */
  createdIds?: Record<string, string[]>;
  /**
   * Human-friendly label per created record id, keyed by logical entity
   * (e.g. `labels.workOrders[guid] = "WO-01016"`). Used by the run-output
   * UI so chips show real names instead of synthetic "WO #1" / "Task #1".
   * Optional for backward compat with old run history.
   */
  labels?: Record<string, Record<string, string>>;
  /**
   * Records the seeder gracefully skipped — Posted WOs, asset/account
   * mismatches, validation failures, etc. Keyed by logical entity (same
   * keys as `idMaps` / `createdIds`). The success card on Generate.tsx
   * groups these by `SkipReason` so users see "3 records already Posted in
   * Dataverse" rather than 3 raw error strings. Optional for backward
   * compat with pre-v1.32 history records.
   */
  skipped?: Record<string, SkippedRecord[]>;
  /**
   * True when the run was cancelled by the user via `options.signal`.
   * Set on the partial result before the outer catch re-throws. The
   * Generate page reads this to render a "Run cancelled" banner instead
   * of a red error banner.
   */
  cancelled?: boolean;
}

/** A single skipped write captured by `safeCreate` / `safeUpdate`. */
export interface SkippedRecord {
  reason: SkipReason;
  message: string;
  recordLabel?: string;
  step?: string;
}

type ProgressFn = (p: SeedProgress) => void;

/**
 * Per-entity sourcing. Same three-mode choice for every step:
 *   - "create"   → look up by name, create if absent (idempotent default).
 *   - "existing" → skip creation entirely; register caller-picked records so
 *                  downstream steps (e.g. work orders) reference them.
 *   - "skip"     → do nothing for this entity.
 */
export interface SeedOptions {
  territories?: EntityChoice;
  workOrderTypes?: EntityChoice;
  characteristics?: EntityChoice;
  incidentTypes?: EntityChoice;
  products?: EntityChoice;
  accounts?: EntityChoice;
  resources?: EntityChoice;
  workOrders?: EntityChoice;
  bookings?: EntityChoice;
  // Phase 2-6 entities — only "create" / "skip" are honoured (no existing
  // picker UI yet; "existing" mode is treated like "create" with empty picks).
  functionalLocations?: EntityChoice;
  customerAssets?: EntityChoice;
  serviceTaskTypes?: EntityChoice;
  agreements?: EntityChoice;
  warehouses?: EntityChoice;
  productInventory?: EntityChoice;
  workOrderServiceTasks?: EntityChoice;
  workOrderProducts?: EntityChoice;
  timeEntries?: EntityChoice;
  iotAlerts?: EntityChoice;
  incidentTypeProducts?: EntityChoice;
  /**
   * Per-resource configuration overrides for the Bookable Resources
   * augmentation + Work Hours phases. Keyed by `bookableresourceid`.
   * Only applies when the user picks an existing resource via the UI and
   * configures it explicitly — un-configured resources keep the historical
   * "match preset by name, else default" behavior.
   *
   * - `characteristicNames`: when provided, forcibly link each named
   *   characteristic to the resource (deduped against any link already
   *   present). Empty array = "don't add any characteristics".
   * - `territoryCode`: when provided, forcibly link the resource to the
   *   matching territory.
   * - `hoursPreset`: when provided and not "default", apply the named hours
   *   preset (overrides preset-name matching). "no-schedule" skips the
   *   SaveCalendar call entirely.
   */
  resourceConfigs?: Record<string, ResourceConfig>;
  /**
   * Generation tuning knobs (volume, status mix, priority mix, scheduling
   * window). When omitted, `DEFAULT_KNOBS` are used.
   */
  knobs?: GenerationKnobs;
  /**
   * Optional short, run-scoped id (e.g. `r-260501-1432-a7c9`) appended to
   * generated record names that have a high duplicate-collision risk —
   * primarily the auto-generated Work Order summaries. When set, two
   * back-to-back runs against the same org produce two *separate* sets of
   * Work Orders instead of trying to reuse the same `Auto-generated WO #N`
   * records (which fails when the previous run left bookings on them).
   *
   * When omitted, the seeder falls back to the historical name-only
   * idempotency for backwards compatibility with older callers.
   *
   * Resume-friendly: the active-run store keeps the same runId across
   * navigation / progress events within a single Generate click, so a mid-
   * run crash that the user retries with the same runId still re-finds its
   * own WOs and continues.
   */
  runId?: string;
  /**
   * Optional cancellation signal. When aborted (typically by the user
   * clicking Cancel on the Generate page), the seeder throws a
   * `CancelledError` at the next progress checkpoint — which fires at
   * least once per phase and once per record in every long loop. The
   * outer try/catch attaches the partial result and sets
   * `partialResult.cancelled = true` so the UI can render a cancelled
   * banner instead of an error banner. Any rows already committed to
   * Dataverse stay (run history records them so the Reset page can
   * clean them up by runId).
   */
  signal?: AbortSignal;
}

/**
 * Thrown by `seedFromPreset` when `options.signal` is aborted. Caught by
 * the outer try/catch, which attaches the partial result with
 * `cancelled = true` before re-throwing, so the Generate page can
 * distinguish user cancellation from a real failure.
 */
export class CancelledError extends Error {
  constructor(message = "Run cancelled by user") {
    super(message);
    this.name = "CancelledError";
  }
}

export interface EntityChoice {
  mode: "create" | "existing" | "skip";
  existing?: Array<{ id: string; name: string }>;
}

/**
 * Per-resource configuration override key. See `HOURS_PRESETS` for the
 * day/start/end/tz each key resolves to. `"default"` means *no override —
 * fall through to the historical logic* (preset-tech name match, or
 * Mon–Fri 8a–5p Pacific). `"no-schedule"` is an explicit "skip the
 * SaveCalendar call".
 */
export type HoursPresetKey =
  | "default"
  | "weekday-9to5-pt"
  | "weekday-8to5-pt"
  | "weekday-7to3-pt"
  | "weekday-9to6-et"
  | "weekend-8to4-pt"
  | "tu-sa-10to7-pt"
  | "no-schedule";

export interface HoursPreset {
  /** Display label shown in the UI dropdown. */
  label: string;
  /** RFC-5545 BYDAY tokens. Empty = no working hours. */
  days: string[];
  startHour: number;
  endHour: number;
  /** Standard Windows TimeZoneCode (4 = Pacific, 35 = Eastern). */
  tz: number;
}

export const HOURS_PRESETS: Record<HoursPresetKey, HoursPreset> = {
  default: { label: "Default (preset-driven)", days: [], startHour: 0, endHour: 0, tz: 4 },
  "weekday-8to5-pt": { label: "Mon–Fri 8a–5p Pacific", days: ["MO", "TU", "WE", "TH", "FR"], startHour: 8, endHour: 17, tz: 4 },
  "weekday-9to5-pt": { label: "Mon–Fri 9a–5p Pacific", days: ["MO", "TU", "WE", "TH", "FR"], startHour: 9, endHour: 17, tz: 4 },
  "weekday-7to3-pt": { label: "Mon–Fri 7a–3p Pacific (early shift)", days: ["MO", "TU", "WE", "TH", "FR"], startHour: 7, endHour: 15, tz: 4 },
  "weekday-9to6-et": { label: "Mon–Fri 9a–6p Eastern", days: ["MO", "TU", "WE", "TH", "FR"], startHour: 9, endHour: 18, tz: 35 },
  "weekend-8to4-pt": { label: "Sat–Sun 8a–4p Pacific", days: ["SA", "SU"], startHour: 8, endHour: 16, tz: 4 },
  "tu-sa-10to7-pt": { label: "Tue–Sat 10a–7p Pacific", days: ["TU", "WE", "TH", "FR", "SA"], startHour: 10, endHour: 19, tz: 4 },
  "no-schedule": { label: "No schedule (unavailable)", days: [], startHour: 0, endHour: 0, tz: 4 },
};

/**
 * Per-resource configuration override consumed by the Bookable Resources
 * augmentation + Work Hours phases. See `SeedOptions.resourceConfigs`
 * for semantics.
 */
export interface ResourceConfig {
  /** Names from `preset.characteristics[].name`. Empty = link nothing. */
  characteristicNames?: string[];
  /** Code from `preset.territories[].code`. */
  territoryCode?: string;
  /**
   * Working hours selection. v1.42.6 accepts three forms:
   *  - `"default"` / undefined — historical logic (preset-tech name match,
   *    else Mon–Fri 8a–5p Pacific).
   *  - A named `HoursPresetKey` (e.g. `"weekday-9to6-et"`).
   *  - `"tech:<Name>"` — copy `workDays`/`workStartHour`/`workEndHour`/
   *    `timeZoneCode` from the matching `preset.sampleTechnicians[]` row.
   *    Lets a dispatcher reuse a generated technician's exact schedule
   *    (the same one the seeder applies to brand-new resources).
   *  - `"custom"` — use `hoursCustom` verbatim.
   */
  hoursPreset?: string;
  /** Required when `hoursPreset === "custom"`. */
  hoursCustom?: {
    days: string[];
    startHour: number;
    endHour: number;
    /** Standard Windows TimeZoneCode (4 = Pacific, 35 = Eastern). */
    tz: number;
  };
}

function tag(description?: string): string {
  // Historically prefixed every description with `${DEMO_TAG}:` so a tag-sweep
  // could find them. As of v1.6 we track every record id in run history
  // instead, so descriptions stay clean. The function is preserved (and the
  // DEMO_TAG export retained) so older history entries from v1.5 and earlier
  // can still be reset via the legacy tag-sweep.
  return (description ?? "").trim();
}

/** Two-digit zero-pad for hour values used in ISO timestamps. */
function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/**
 * Clamp a possibly-undefined hour value into [0, 24]. Used by the Work
 * Hours phase so a malformed preset can't produce an invalid ISO time.
 */
function clampHour(h: number | undefined, fallback: number): number {
  if (typeof h !== "number" || !Number.isFinite(h)) return fallback;
  if (h < 0) return 0;
  if (h > 24) return 24;
  return Math.floor(h);
}

/** Find a record by exact name match; return its id or null. */
async function findByField(
  dv: DataverseClient,
  entitySet: string,
  field: string,
  value: string,
  idField: string,
): Promise<string | null> {
  const filter = `${field} eq '${oencode(value)}'`;
  const rows = await dv.query<Record<string, string>>(entitySet, {
    filter,
    select: [idField],
    top: 1,
  });
  return rows[0]?.[idField] ?? null;
}

/**
 * If the caller provided existing records for a catalog entity, register them
 * up-front in the result map keyed by name. This way Object.values(...) on the
 * map (used by work-order/booking generation) will pick them up regardless of
 * whether the preset records were also created.
 */
function registerExisting(
  target: Record<string, string>,
  choice: EntityChoice | undefined,
): void {
  if (!choice) return;
  if (choice.mode !== "existing") return;
  for (const r of choice.existing ?? []) {
    target[r.name] = r.id;
  }
}

/** True when this entity step should run preset creation. */
function shouldCreate(choice: EntityChoice | undefined): boolean {
  return !choice || choice.mode === "create";
}

/**
 * Generic, idempotent "create or reuse" loop used by every catalog step.
 *
 * Behaviour matrix:
 *   choice.mode === "existing" → register caller picks into `target`, do nothing else.
 *   choice.mode === "skip"     → do nothing.
 *   choice.mode === "create"   → for each item: find by `findField` = findValue;
 *                                 create if absent; record id under `mapKey(item)`.
 *
 * Hooks:
 *   onCreated  fires only when we actually inserted a row (use for child rows or
 *              tracking which ids we own — e.g. createdResourceIds).
 *   onResolved fires after every item regardless of whether we created or reused;
 *              the `isNew` flag tells you which.
 */
interface EntityStepConfig<T> {
  label: string;
  /**
   * Optional override for the key under `result.skipped[...]`. Defaults to
   * `label`. Use this when an entity step's display label differs from a
   * pre-existing skip-key convention.
   */
  skipEntityKey?: string;
  items: T[];
  choice: EntityChoice | undefined;
  target: Record<string, string>;
  entitySet: string;
  idField: string;
  findField: string;
  findValue: (item: T) => string;
  mapKey: (item: T) => string;
  build: (item: T) => Record<string, unknown>;
  onCreated?: (id: string, item: T) => Promise<void> | void;
  onResolved?: (id: string, item: T, isNew: boolean) => Promise<void> | void;
}

async function runEntityStep<T>(
  dv: DataverseClient,
  result: SeedResult,
  cfg: EntityStepConfig<T>,
  onProgress: ProgressFn,
): Promise<void> {
  registerExisting(cfg.target, cfg.choice);
  const create = shouldCreate(cfg.choice);
  const total = create ? cfg.items.length : 0;
  onProgress({ step: cfg.label, done: 0, total });
  if (!create) return;

  // Skips on catalog steps are recorded under the human-friendly label so
  // the success card groups them with the visible step name.
  const skipKey = cfg.skipEntityKey ?? cfg.label;

  for (let i = 0; i < cfg.items.length; i++) {
    const item = cfg.items[i];
    const findVal = cfg.findValue(item);
    let id = await findByField(
      dv,
      cfg.entitySet,
      cfg.findField,
      findVal,
      cfg.idField,
    );
    let isNew = false;
    if (!id) {
      const ctx = makeSafeCtx(result, skipKey, cfg.label, findVal);
      const res = await safeCreate(dv, cfg.entitySet, cfg.build(item), ctx);
      if (!res.ok) {
        // Skip recorded; advance progress and continue with next item.
        onProgress({
          step: cfg.label,
          done: i + 1,
          total: cfg.items.length,
          detail: `${cfg.mapKey(item)} (skipped: ${res.skipped.reason})`,
        });
        continue;
      }
      id = res.id;
      isNew = true;
      if (cfg.onCreated) await cfg.onCreated(id, item);
    }
    cfg.target[cfg.mapKey(item)] = id;
    if (cfg.onResolved) await cfg.onResolved(id, item, isNew);
    onProgress({
      step: cfg.label,
      done: i + 1,
      total: cfg.items.length,
      detail: cfg.mapKey(item),
    });
  }
}

/**
 * Lookup-or-init the id map for a given logical entity key on the result.
 * Phase 2+ entities (functional locations, customer assets, agreements, etc.)
 * use this instead of adding new top-level fields to `SeedResult`.
 */
export function getIdMap(
  result: SeedResult,
  key: string,
): Record<string, string> {
  result.idMaps ??= {};
  return (result.idMaps[key] ??= {});
}

/** Record that we created (vs reused) `id` for a given logical entity key. */
export function trackCreated(
  result: SeedResult,
  key: string,
  id: string,
): void {
  result.createdIds ??= {};
  (result.createdIds[key] ??= []).push(id);
}

/** Attach a human-friendly label to a created record id. */
export function setLabel(
  result: SeedResult,
  key: string,
  id: string,
  label: string,
): void {
  if (!label) return;
  result.labels ??= {};
  (result.labels[key] ??= {})[id] = label;
}

/**
 * Record a graceful skip on the run summary. Called by `safeCreate` /
 * `safeUpdate` via the `onSkip` callback installed by `makeSafeCtx`.
 */
export function recordSkip(
  result: SeedResult,
  entityKey: string,
  info: SkipInfo,
): void {
  result.skipped ??= {};
  (result.skipped[entityKey] ??= []).push({
    reason: info.reason,
    message: info.message,
    recordLabel: info.recordLabel,
    step: info.step,
  });
}

/**
 * Build a `SafeWriteContext` that auto-records skips against the result
 * under `entityKey`. Pass to every `safeCreate` / `safeUpdate` call so the
 * success card knows what didn't land and why.
 */
export function makeSafeCtx(
  result: SeedResult,
  entityKey: string,
  step: string,
  recordLabel?: string,
): SafeWriteContext {
  return {
    step,
    recordLabel,
    onSkip: (info) => recordSkip(result, entityKey, info),
  };
}

export async function seedFromPreset(
  dv: DataverseClient,
  preset: FsPreset,
  onProgress: ProgressFn,
  options: SeedOptions = {},
): Promise<SeedResult> {
  // Must be initialized before any step callbacks read `knobs` (e.g.
  // Bookable Resources geocoding), otherwise runtime TDZ can occur.
  const knobs: GenerationKnobs = options.knobs ?? DEFAULT_KNOBS;

  // Cancellation: the Generate page passes an AbortSignal so the user can
  // click Cancel mid-run. We convert this into a synchronous throw at the
  // next progress checkpoint by wrapping the original onProgress callback.
  // Every phase emits at least one progress event (and most loops emit one
  // per record), so the run halts within a single record's worth of work
  // after the user clicks Cancel. The outer try/catch attaches the partial
  // result with `cancelled: true` so the UI can render a cancelled banner.
  const signal = options.signal;
  const _origOnProgress = onProgress;
  onProgress = (p) => {
    if (signal?.aborted) throw new CancelledError();
    _origOnProgress(p);
  };

  const result: SeedResult = {
    territoryIds: {},
    workOrderTypeIds: {},
    incidentTypeIds: {},
    characteristicIds: {},
    productIds: {},
    accountIds: {},
    resourceIds: {},
    createdResourceIds: [],
    workOrderIds: [],
    bookingIds: [],
    idMaps: {},
    createdIds: {},
    labels: {},
    skipped: {},
  };

  try {

  // ── Territories ──────────────────────────────────────────────────────────
  await runEntityStep(
    dv,
    result,
    {
      label: "Territories",
      items: preset.territories,
      choice: options.territories,
      target: result.territoryIds,
      entitySet: "territories",
      idField: "territoryid",
      findField: "name",
      findValue: (t) => t.name,
      mapKey: (t) => t.code,
      build: (t) => ({ name: t.name, description: tag(t.description) }),
    },
    onProgress,
  );

  // ── Work Order Types ─────────────────────────────────────────────────────
  await runEntityStep(
    dv,
    result,
    {
      label: "Work Order Types",
      items: preset.workOrderTypes,
      choice: options.workOrderTypes,
      target: result.workOrderTypeIds,
      entitySet: "msdyn_workordertypes",
      idField: "msdyn_workordertypeid",
      findField: "msdyn_name",
      findValue: (wt) => wt.name,
      mapKey: (wt) => wt.code,
      build: (wt) => ({
        msdyn_name: wt.name,
      }),
    },
    onProgress,
  );

  // ── Characteristics ──────────────────────────────────────────────────────
  await runEntityStep(
    dv,
    result,
    {
      label: "Characteristics",
      items: preset.characteristics,
      choice: options.characteristics,
      target: result.characteristicIds,
      entitySet: "characteristics",
      idField: "characteristicid",
      findField: "name",
      findValue: (c) => c.name,
      mapKey: (c) => c.name,
      build: (c) => ({
        name: c.name,
        description: tag(c.description),
        // 1 = Skill (most common for FS demo certifications).
        characteristictype: 1,
      }),
    },
    onProgress,
  );

  // ── Incident Types + Service Tasks ───────────────────────────────────────
  // Service tasks are children of the incident — created in onResolved so they
  // run for both freshly-created and pre-existing incidents (the per-task call
  // is itself idempotent against the parent incident id).
  await runEntityStep(
    dv,
    result,
    {
      label: "Incident Types",
      items: preset.incidentTypes,
      choice: options.incidentTypes,
      target: result.incidentTypeIds,
      entitySet: "msdyn_incidenttypes",
      idField: "msdyn_incidenttypeid",
      findField: "msdyn_name",
      findValue: (inc) => inc.name,
      mapKey: (inc) => inc.name,
      build: (inc) => ({
        msdyn_name: inc.name,
        msdyn_description: tag(inc.description),
        msdyn_estimatedduration: inc.estimatedDurationMinutes,
      }),
      onResolved: async (incidentId, inc) => {
        for (const taskName of inc.serviceTasks) {
          const taskFilter = `msdyn_name eq '${oencode(taskName)}' and _msdyn_incidenttype_value eq ${incidentId}`;
          const existing = await dv.query<{
            msdyn_incidenttypeservicetaskid: string;
          }>("msdyn_incidenttypeservicetasks", {
            filter: taskFilter,
            select: ["msdyn_incidenttypeservicetaskid"],
            top: 1,
          });
          if (!existing[0]) {
            // safeCreate so an org-specific FS validation rule (e.g. some
            // tenants require msdyn_estimatedduration) records a skip
            // instead of throwing — one bad service task name should
            // never abort the whole catalog phase mid-demo.
            await safeCreate(
              dv,
              "msdyn_incidenttypeservicetasks",
              {
                msdyn_name: taskName,
                msdyn_description: tag(),
                "msdyn_incidenttype@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
              },
              makeSafeCtx(
                result,
                "incidentTypeServiceTasks",
                "Incident Types",
                taskName,
              ),
            );
          }
        }
      },
    },
    onProgress,
  );

  // ── Products ─────────────────────────────────────────────────────────────
  // Products require a unit + unit-schedule. Resolve org defaults once.
  let defaultUomId: string | null = null;
  let defaultUomScheduleId: string | null = null;
  try {
    const schedules = await dv.query<{ uomscheduleid: string }>(
      "uomschedules",
      { select: ["uomscheduleid", "name"], top: 1 },
    );
    if (schedules[0]) {
      defaultUomScheduleId = schedules[0].uomscheduleid;
      const units = await dv.query<{ uomid: string }>("uoms", {
        select: ["uomid", "name"],
        filter: `_uomscheduleid_value eq ${defaultUomScheduleId}`,
        top: 1,
      });
      if (units[0]) defaultUomId = units[0].uomid;
    }
  } catch {
    /* fall through — product create will surface a clearer error */
  }

  await runEntityStep(
    dv,
    result,
    {
      label: "Products",
      items: preset.products,
      choice: options.products,
      target: result.productIds,
      entitySet: "products",
      idField: "productid",
      // productnumber is a default alternate key on product.
      findField: "productnumber",
      findValue: (p) => p.productNumber,
      mapKey: (p) => p.productNumber,
      build: (p) => {
        const payload: Record<string, unknown> = {
          name: p.name,
          productnumber: p.productNumber,
          description: tag(p.description),
          price: p.listPrice ?? 0,
          // Sensible defaults to avoid required-field rejections:
          productstructure: 1, // Product
          statecode: 0, // Draft (cannot create as Active without a price list).
          // Field Service requires a product type for any product referenced
          // by msdyn_incidenttypeproduct / msdyn_workorderproduct. Default to
          // Non-Inventory (690970001) so it works without warehouse stock.
          // 690970000 = Inventory, 690970001 = Non-Inventory, 690970002 = Service.
          msdyn_fieldserviceproducttype: 690970001,
        };
        if (defaultUomScheduleId) {
          payload["defaultuomscheduleid@odata.bind"] = `/uomschedules(${defaultUomScheduleId})`;
        }
        if (defaultUomId) {
          payload["defaultuomid@odata.bind"] = `/uoms(${defaultUomId})`;
        }
        return payload;
      },
    },
    onProgress,
  );

  // ── Incident Type ↔ Product mappings ─────────────────────────────────────
  // Incident types must be created BEFORE products (Field Service ordering),
  // so we attach the products in a separate pass once both catalogs exist.
  // Each incident type gets ~3 products bound via msdyn_incidenttypeproduct,
  // marked Estimated (690970000) with quantity 1. When a work order is later
  // created with that incident type, FS auto-copies these as msdyn_workorderproduct.
  const itpMap = getIdMap(result, "incidentTypeProducts");
  const skipIncidentTypeProducts =
    (options.incidentTypeProducts?.mode ?? "create") !== "create";
  const incidentIdsForLink = Object.values(result.incidentTypeIds);
  const productIdsForLink = Object.values(result.productIds);
  if (
    !skipIncidentTypeProducts &&
    incidentIdsForLink.length > 0 &&
    productIdsForLink.length > 0
  ) {
    // {incidentId → incidentName} so ITP rows can be labelled with real names.
    const incidentNameById: Record<string, string> = {};
    for (const [name, id] of Object.entries(result.incidentTypeIds)) {
      incidentNameById[id] = name;
    }
    // {productId → productName} for the same reason. Built from the preset
    // catalog so we don't need a per-row retrieve on existing rows.
    const productNameForLabel: Record<string, string> = {};
    for (const p of preset.products ?? []) {
      const id = result.productIds[p.productNumber];
      if (id) productNameForLabel[id] = p.name;
    }
    const productsPerIncident = Math.min(3, productIdsForLink.length);
    const total = incidentIdsForLink.length * productsPerIncident;
    onProgress({ step: "Incident Type Products", done: 0, total });
    let done = 0;
    for (let i = 0; i < incidentIdsForLink.length; i++) {
      const incidentId = incidentIdsForLink[i];
      // Resolve each product's default UoM lazily (cached).
      for (let j = 0; j < productsPerIncident; j++) {
        const productId = productIdsForLink[(i + j) % productIdsForLink.length];
        const linkKey = `${incidentId}:${productId}`;
        if (itpMap[linkKey]) {
          done += 1;
          onProgress({ step: "Incident Type Products", done, total });
          continue;
        }
        // Idempotency: skip if a row for this (incident,product) pair already
        // exists in the org from a prior run.
        const filter =
          `_msdyn_incidenttype_value eq ${incidentId} ` +
          `and _msdyn_product_value eq ${productId}`;
        const existing = await dv.query<{
          msdyn_incidenttypeproductid: string;
        }>("msdyn_incidenttypeproducts", {
          filter,
          select: ["msdyn_incidenttypeproductid"],
          top: 1,
        });
        let id = existing[0]?.msdyn_incidenttypeproductid;
        if (!id) {
          // Look up the product's default UoM (msdyn_unit is required) and
          // verify its Field Service product type. Errors here surface
          // directly so schema mismatches don't masquerade as FS-plugin
          // failures (we wasted a few iterations on that).
          let uomId: string | null = null;
          let prod: {
            name: string;
            _defaultuomid_value: string;
            msdyn_fieldserviceproducttype: number | null;
          } | null = null;
          try {
            prod = await dv.retrieve<{
              name: string;
              _defaultuomid_value: string;
              msdyn_fieldserviceproducttype: number | null;
            }>("products", productId, [
              "name",
              "_defaultuomid_value",
              "msdyn_fieldserviceproducttype",
            ]);
          } catch {
            // Product retrieve failure (deleted between phases, perm
            // denied, etc.) — record a skip and move on instead of
            // aborting the whole catalog phase.
            recordSkip(result, "incidentTypeProducts", {
              reason: "lookup-not-found",
              message: `Product ${productId} could not be retrieved`,
              recordLabel: `${incidentId}:${productId}`,
              step: "Incident Type Products",
            });
            done += 1;
            onProgress({ step: "Incident Type Products", done, total });
            continue;
          }
          uomId = prod._defaultuomid_value ?? null;
          // FS plugin requires Inventory (690970000) or Non-Inventory (690970001)
          // before a product can be referenced by msdyn_incidenttypeproduct.
          // Patch any product missing it (e.g. seeded by v1.20.0/.1) up to
          // Non-Inventory so the link succeeds without a reset.
          if (
            prod.msdyn_fieldserviceproducttype !== 690970000 &&
            prod.msdyn_fieldserviceproducttype !== 690970001
          ) {
            await safeUpdate(
              dv,
              "products",
              productId,
              { msdyn_fieldserviceproducttype: 690970001 },
              makeSafeCtx(
                result,
                "incidentTypeProducts",
                "Incident Type Products",
                `Heal product type ${prod.name}`,
              ),
            );
          }
          const payload: Record<string, unknown> = {
            msdyn_name: prod.name,
            "msdyn_incidenttype@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
            "msdyn_product@odata.bind": `/products(${productId})`,
            msdyn_quantity: 1,
          };
          if (uomId) {
            payload["msdyn_unit@odata.bind"] = `/uoms(${uomId})`;
          }
          const itpRes = await safeCreate(
            dv,
            "msdyn_incidenttypeproducts",
            payload,
            makeSafeCtx(
              result,
              "incidentTypeProducts",
              "Incident Type Products",
              `${prod.name} \u2192 ${incidentNameById[incidentId] ?? "Incident"}`,
            ),
          );
          if (!itpRes.ok) {
            done += 1;
            onProgress({ step: "Incident Type Products", done, total });
            continue;
          }
          id = itpRes.id;
          trackCreated(result, "incidentTypeProducts", id);
        }
        // Always (re-)label, including for rows reused from a prior run that
        // pre-dates the labels registry.
        if (id) {
          const productName =
            productNameForLabel[productId] ?? "Product";
          const incidentName = incidentNameById[incidentId] ?? "Incident";
          setLabel(
            result,
            "incidentTypeProducts",
            id,
            `${productName} → ${incidentName}`,
          );
        }
        itpMap[linkKey] = id;
        done += 1;
        onProgress({ step: "Incident Type Products", done, total });
      }
    }
  }

  // ── Accounts ─────────────────────────────────────────────────────────────
  await runEntityStep(
    dv,
    result,
    {
      label: "Accounts",
      items: preset.sampleAccounts ?? [],
      choice: options.accounts,
      target: result.accountIds,
      entitySet: "accounts",
      idField: "accountid",
      findField: "name",
      findValue: (a) => a.name,
      mapKey: (a) => a.name,
      build: (a) => {
        const payload: Record<string, unknown> = {
          name: a.name,
          description: tag(a.siteDescription),
          address1_city: a.city,
          address1_stateorprovince: a.state,
          address1_country: "United States",
        };
        if (a.addressLine1) payload.address1_line1 = a.addressLine1;
        if (a.postalCode) payload.address1_postalcode = a.postalCode;
        // v1.42.2 — Always stamp lat/long. Use explicit coords when the
        // preset supplies them; otherwise compute a city-centre + jitter
        // so the FS map view shows a recognisable pin per account.
        // Wrapped in try/catch so a geocoding hiccup never aborts the
        // account create.
        try {
          if (typeof a.latitude === "number" && typeof a.longitude === "number") {
            payload.address1_latitude = a.latitude;
            payload.address1_longitude = a.longitude;
          } else if (a.city) {
            const coord = geocodeAccount(a.name, a.city, a.state);
            payload.address1_latitude = coord.lat;
            payload.address1_longitude = coord.lng;
          }
        } catch (err) {
          console.warn(
            `[seed] geocodeAccount failed for ${a.name}; skipping coords:`,
            err,
          );
        }
        return payload;
      },
    },
    onProgress,
  );

  // ── Bookable Resources (Contact-type — matches real techs) ───────────────
  // Each tech needs an underlying contact record; bookableresource.resourcetype
  // = 2 (Contact) requires Contact@odata.bind at create time. We pre-resolve
  // contacts here (idempotent by fullname) so existing contacts are reused.
  const techList = preset.sampleTechnicians ?? [];
  const techContactIdByName: Record<string, string> = {};
  // Build territory code → name lookup early so both the technician-contact
  // geocode (below) and the bookable-resource geocode (further down) share
  // the same metro-centre fallback.
  const territoryNameByCode: Record<string, string> = {};
  for (const tt of preset.territories ?? []) {
    territoryNameByCode[tt.code] = tt.name;
  }
  if (techList.length > 0) {
    const contactsMap = getIdMap(result, "technicianContacts");
    onProgress({
      step: "Technician Contacts",
      done: 0,
      total: techList.length,
    });
    for (let i = 0; i < techList.length; i++) {
      const t = techList[i];
      const parts = t.name.trim().split(/\s+/);
      const firstname = parts.shift() ?? t.name;
      const lastname = parts.join(" ") || firstname;
      // When the geocode toggle is on, the FS plugin enforces that the
      // *Contact* behind a Contact-type bookable resource has valid
      // address1_latitude/longitude before the resource may set
      // msdyn_startlocation = Resource Address. Compute coords here so we
      // can stamp them on create and heal them on existing contacts.
      let contactCoord: { lat: number; lng: number } | null = null;
      if (knobs.geocodeResources) {
        try {
          contactCoord = geocodeTech(
            t.name,
            t.primaryTerritoryCode,
            territoryNameByCode[t.primaryTerritoryCode],
          );
        } catch {
          contactCoord = null;
        }
      }
      // Idempotency: match by fullname (case-sensitive Dataverse default).
      const existing = await dv.query<{
        contactid: string;
        address1_latitude: number | null;
        address1_longitude: number | null;
      }>("contacts", {
        filter: `fullname eq '${oencode(t.name)}'`,
        select: ["contactid", "address1_latitude", "address1_longitude"],
        top: 1,
      });
      let contactId: string | undefined = existing[0]?.contactid;
      // Validate the candidate still exists. After a Reset, the search index
      // can briefly return ids for rows that are already deleted, which then
      // breaks bookableresource create with `Entity 'Contact' With Id = ...
      // Does Not Exist`. A direct retrieve confirms presence.
      if (contactId) {
        try {
          await dv.retrieve("contacts", contactId, ["contactid"]);
        } catch {
          contactId = undefined;
        }
      }
      if (!contactId) {
        const newContact: Record<string, unknown> = {
          firstname,
          lastname,
          description: tag(`Field technician`),
        };
        if (contactCoord) {
          newContact.address1_latitude = contactCoord.lat;
          newContact.address1_longitude = contactCoord.lng;
        }
        // safeCreate so a malformed name (rare but possible from AI
        // presets) or a tenant-specific Contact business rule records
        // a skip instead of aborting the entire technician phase.
        const cRes = await safeCreate(
          dv,
          "contacts",
          newContact,
          makeSafeCtx(
            result,
            "technicianContacts",
            "Technician Contacts",
            t.name,
          ),
        );
        if (!cRes.ok) {
          onProgress({
            step: "Technician Contacts",
            done: i + 1,
            total: techList.length,
            detail: `${t.name} (skipped: ${cRes.skipped.reason})`,
          });
          continue;
        }
        contactId = cRes.id;
        trackCreated(result, "technicianContacts", contactId);
      } else if (contactCoord) {
        // Existing contact — heal lat/long if missing or zero so the FS
        // plugin's "valid latitude and longitude" check passes when we set
        // msdyn_startlocation = Resource Address on the resource below.
        const cur = existing[0];
        const lat = cur?.address1_latitude;
        const lng = cur?.address1_longitude;
        const needsCoords =
          lat == null || lng == null || (lat === 0 && lng === 0);
        if (needsCoords) {
          try {
            await dv.update("contacts", contactId, {
              address1_latitude: contactCoord.lat,
              address1_longitude: contactCoord.lng,
            });
          } catch {
            /* non-fatal — resource create may still succeed without contact heal */
          }
        }
      }
      contactsMap[t.name] = contactId;
      techContactIdByName[t.name] = contactId;
      setLabel(result, "technicianContacts", contactId, t.name);
      onProgress({
        step: "Technician Contacts",
        done: i + 1,
        total: techList.length,
      });
    }
  }

  // ── Bookable Resources ───────────────────────────────────────────────────
  // We need post-create side-effects (track createdResourceIds, link primary
  // skill + territory) that only fire when we actually inserted the row, so we
  // use onCreated rather than onResolved.
  // (territoryNameByCode was built above so the contact geocode step can
  // share the same lookup table.)

  // v1.42.0 — Pre-fetch ratingvalues once so we can attach a proficiency
  // rating to each bookableresourcecharacteristic. Field Service ships with
  // a "Proficiency" ratingmodel whose values use the integer column `value`
  // (1=Familiar … 5=Expert). We map by that column. If the org has no rating
  // values defined (some demo orgs strip them), `ratingValueByLevel` stays
  // empty and the seeder just creates skill links without ratings — same as
  // pre-1.42 behavior.
  const ratingValueByLevel = new Map<number, string>();
  try {
    const rvs = await dv.query<{
      ratingvalueid: string;
      value: number | null;
    }>("ratingvalues", { select: ["ratingvalueid", "value"], top: 50 });
    for (const rv of rvs) {
      if (typeof rv.value === "number" && !ratingValueByLevel.has(rv.value)) {
        ratingValueByLevel.set(rv.value, rv.ratingvalueid);
      }
    }
  } catch {
    /* non-fatal — skill ratings are optional decoration */
  }
  /**
   * Build the set of distinct (characteristicId, ratingValueId | null) pairs
   * we should link to a bookable resource, given a tech preset row. Includes
   * the headline `primarySkill` (untyped) plus any entries from the
   * `skills[]` array that resolve to known characteristics. Deduped by
   * characteristicId so we don't insert two rows for the same skill when a
   * preset lists it both as primary and again in skills[].
   */
  function skillLinksFor(t: FsPreset["sampleTechnicians"][number]) {
    const seen = new Set<string>();
    const out: Array<{ charId: string; ratingValueId?: string }> = [];
    const primaryId = result.characteristicIds[t.primarySkill];
    if (primaryId) {
      seen.add(primaryId);
      out.push({ charId: primaryId });
    }
    for (const s of t.skills ?? []) {
      const id = result.characteristicIds[s.name];
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const ratingValueId =
        typeof s.rating === "number"
          ? ratingValueByLevel.get(s.rating)
          : undefined;
      out.push({ charId: id, ratingValueId });
    }
    return out;
  }

  await runEntityStep(
    dv,
    result,
    {
      label: "Bookable Resources",
      items: preset.sampleTechnicians ?? [],
      choice: options.resources,
      target: result.resourceIds,
      entitySet: "bookableresources",
      idField: "bookableresourceid",
      findField: "name",
      findValue: (t) => t.name,
      mapKey: (t) => t.name,
      build: (t) => {
        const contactId = techContactIdByName[t.name];
        const payload: Record<string, unknown> = {
          name: t.name,
          // 2 = Contact. Requires the Contact lookup to be set at create.
          resourcetype: 2,
          // Required field on this org. 4 = Pacific Time (US & Canada).
          // Standard Windows TimeZoneCode; safe US default for demo data.
          timezone: 4,
          // Schedule Assistant filters out any resource where this is false
          // — without it set to true, no amount of work hours, characteristics,
          // or territories will make the resource appear as a match. The
          // FS UI sets this to true by default for new resources, but at the
          // Web API level it can land null/false depending on plugin config,
          // so we set it explicitly. v1.41.3.
          msdyn_enableforavailabilitysearch: true,
        };
        if (contactId) {
          // Nav property name on bookableresource is `ContactId` (PascalCase
          // matching the `contactid` lookup column). `Contact` is undeclared.
          payload["ContactId@odata.bind"] = `/contacts(${contactId})`;
        }
        if (knobs.geocodeResources) {
          // Auto-geocode: territory metro centre + per-name jitter.
          // We deliberately do NOT set msdyn_startlocation/endlocation =
          // 690970000 ("Resource Address") here — that triggers the FS
          // plugin to validate the *Contact*'s address1_latitude/longitude
          // and 400 with "latitude or longitude for the Contact record …
          // is invalid" if the Contact's address columns aren't perfectly
          // populated. Stamping lat/long directly on the resource is
          // enough for map visualization and RSO will fall back to these
          // when no start location override is set. Wrapped defensively
          // so any failure resolving a coord skips the geocoding step
          // instead of crashing the entire seed.
          try {
            const coord = geocodeTech(
              t.name,
              t.primaryTerritoryCode,
              territoryNameByCode[t.primaryTerritoryCode],
            );
            payload.msdyn_latitude = coord.lat;
            payload.msdyn_longitude = coord.lng;
          } catch (err) {
            console.warn(
              `[seed] geocodeTech failed for ${t.name}; skipping coords:`,
              err,
            );
          }
        }
        return payload;
      },
      onResolved: async (resourceId, t, isNew) => {
        // Heal rows from prior runs that were created as Equipment (default
        // resourcetype = 3) before we started binding the Contact at create.
        if (isNew) return;
        const contactId = techContactIdByName[t.name];
        if (!contactId) return;
        const rows = await dv.query<{
          resourcetype: number | null;
          _contactid_value: string | null;
          msdyn_latitude?: number | null;
          msdyn_longitude?: number | null;
          msdyn_enableforavailabilitysearch?: boolean | null;
        }>("bookableresources", {
          filter: `bookableresourceid eq ${resourceId}`,
          select: [
            "resourcetype",
            "_contactid_value",
            "msdyn_latitude",
            "msdyn_longitude",
            "msdyn_enableforavailabilitysearch",
          ],
          top: 1,
        });
        const cur = rows[0];
        if (!cur) return;
        // Heal contact/type if needed.
        if (!(cur.resourcetype === 2 && cur._contactid_value === contactId)) {
          try {
            await dv.update("bookableresources", resourceId, {
              resourcetype: 2,
              "ContactId@odata.bind": `/contacts(${contactId})`,
            });
          } catch (err) {
            // Most common cause: existing bookings prevent type change. Log and
            // continue — demo will still mostly work with the existing rows.
            console.warn(`Could not heal bookable resource ${t.name} to Contact type:`, err);
          }
        }
        // Heal availability-search flag (Schedule Assistant excludes
        // resources where this is false — see v1.41.3 build() comment).
        if (cur.msdyn_enableforavailabilitysearch !== true) {
          try {
            await dv.update("bookableresources", resourceId, {
              msdyn_enableforavailabilitysearch: true,
            });
          } catch {
            /* non-critical — best effort */
          }
        }
        // Heal geocoding when the user has the toggle on and this resource
        // has no coords yet (or coords are 0,0 which RSO treats as null).
        // Whole block is defensive — a geocoding hiccup must never abort
        // the seed.
        try {
          if (
            knobs.geocodeResources &&
            (cur.msdyn_latitude == null ||
              cur.msdyn_longitude == null ||
              (cur.msdyn_latitude === 0 && cur.msdyn_longitude === 0))
          ) {
            const coord = geocodeTech(
              t.name,
              t.primaryTerritoryCode,
              territoryNameByCode[t.primaryTerritoryCode],
            );
            try {
              // Stamp lat/long only — see note in build() above for why
              // we don't set msdyn_startlocation = Resource Address.
              await dv.update("bookableresources", resourceId, {
                msdyn_latitude: coord.lat,
                msdyn_longitude: coord.lng,
              });
            } catch {
              /* geocoding columns may not exist on all orgs — non-fatal */
            }
          }
        } catch (err) {
          console.warn(
            `[seed] geocode heal failed for ${t.name}; skipping coords:`,
            err,
          );
        }
      },
      onCreated: async (resourceId, t) => {
        result.createdResourceIds.push(resourceId);

        // Best-effort: link skills via bookableresourcecharacteristic. v1.42.0:
        // this used to insert one row for `primarySkill`; now it iterates
        // skillLinksFor(t) which dedupes the headline + all entries from
        // `t.skills[]` and attaches a `RatingValue@odata.bind` whenever the
        // org has a matching ratingvalue.value. Failures are swallowed
        // per-row so one bad skill doesn't block the rest.
        for (const link of skillLinksFor(t)) {
          try {
            const payload: Record<string, unknown> = {
              "Resource@odata.bind": `/bookableresources(${resourceId})`,
              "Characteristic@odata.bind": `/characteristics(${link.charId})`,
            };
            if (link.ratingValueId) {
              payload["RatingValue@odata.bind"] =
                `/ratingvalues(${link.ratingValueId})`;
            }
            await dv.create("bookableresourcecharacteristics", payload);
          } catch {
            /* skill linking is non-critical for the demo */
          }
        }

        // Best-effort: link primary territory via msdyn_resourceterritory.
        const terrId = result.territoryIds[t.primaryTerritoryCode];
        if (terrId) {
          try {
            await dv.create("msdyn_resourceterritories", {
              "msdyn_resource@odata.bind": `/bookableresources(${resourceId})`,
              "msdyn_territory@odata.bind": `/territories(${terrId})`,
              msdyn_description: tag(),
            });
          } catch {
            /* territory linking is non-critical for the demo */
          }
        }
      },
    },
    onProgress,
  );

  // ── BR Augmentation: characteristics + territory for existing picks ─────
  // runEntityStep's onCreated only fires for fresh inserts. When the user
  // picks existing Bookable Resources (mode === "existing"), none of the
  // skill-link or territory wiring runs — leaving picked resources with no
  // characteristics. Walk every resource in `result.resourceIds` (which is
  // populated for both "create" and "existing" modes) and ensure each has
  // at least one characteristic and one territory linkage. Skip only when
  // the user explicitly skipped resources entirely (no rows in the map),
  // or the catalogs we'd link are empty. This mirrors the Work Hours block
  // below, which has always run regardless of mode.
  //
  // v1.42.5 — `options.resourceConfigs[resourceId]` lets the user pick
  // specific characteristics + territory per existing resource (Generate
  // page → "Use existing" → expand resource card). When a config is
  // provided we treat it as authoritative: characteristicNames is linked
  // verbatim (deduped against existing links so we don't insert dupes),
  // and territoryCode is linked verbatim. Empty arrays = "explicitly add
  // nothing"; missing keys = fall through to the historical default.
  if (
    options.resources?.mode !== "skip" &&
    Object.keys(result.resourceIds).length > 0
  ) {
    const resourceEntries = Object.entries(result.resourceIds);
    const techByName = new Map(
      (preset.sampleTechnicians ?? []).map((t) => [t.name, t]),
    );
    const allCharIds = Object.values(result.characteristicIds);
    const allTerrEntries = Object.entries(result.territoryIds);
    const resourceConfigs = options.resourceConfigs ?? {};
    let augDone = 0;
    onProgress({
      step: "Bookable Resources",
      done: 0,
      total: resourceEntries.length,
      detail: "augment skills/territories",
    });
    for (const [resourceName, resourceId] of resourceEntries) {
      const userConfig = resourceConfigs[resourceId];
      // ── Characteristics ──
      const userCharNames = userConfig?.characteristicNames;
      if (userCharNames !== undefined) {
        // Explicit user choice: link exactly these (deduped against
        // existing). Empty array = link nothing (still valid — user said so).
        if (userCharNames.length > 0) {
          // Pull the set of characteristic ids already linked so we can
          // skip duplicates without throwing per-row.
          const existingCharIds = new Set<string>();
          try {
            const rows = await dv.query<{
              _characteristic_value: string | null;
            }>("bookableresourcecharacteristics", {
              filter: `_resource_value eq ${resourceId}`,
              select: ["_characteristic_value"],
              top: 200,
            });
            for (const r of rows) {
              if (r._characteristic_value) existingCharIds.add(r._characteristic_value);
            }
          } catch {
            /* non-critical — fall through and let create dedupe by error */
          }
          for (const name of userCharNames) {
            const charId = result.characteristicIds[name];
            if (!charId || existingCharIds.has(charId)) continue;
            try {
              await dv.create("bookableresourcecharacteristics", {
                "Resource@odata.bind": `/bookableresources(${resourceId})`,
                "Characteristic@odata.bind": `/characteristics(${charId})`,
              });
              existingCharIds.add(charId);
            } catch {
              /* non-critical */
            }
          }
        }
      } else {
        // Historical default: skip if the resource has any char already,
        // else match preset tech, else random.
        let hasChar = false;
        try {
          const existingChars = await dv.query<{
            bookableresourcecharacteristicid: string;
          }>("bookableresourcecharacteristics", {
            filter: `_resource_value eq ${resourceId}`,
            select: ["bookableresourcecharacteristicid"],
            top: 1,
          });
          hasChar = existingChars.length > 0;
        } catch {
          hasChar = false;
        }
        if (!hasChar && allCharIds.length > 0) {
          const tech = techByName.get(resourceName);
          // v1.42.0 — when the preset row carries `skills[]`, link them all
          // (with ratings) instead of a single fallback. Otherwise keep the
          // original behavior: try primarySkill, fall back to a random char.
          if (tech) {
            for (const link of skillLinksFor(tech)) {
              try {
                const payload: Record<string, unknown> = {
                  "Resource@odata.bind": `/bookableresources(${resourceId})`,
                  "Characteristic@odata.bind": `/characteristics(${link.charId})`,
                };
                if (link.ratingValueId) {
                  payload["RatingValue@odata.bind"] =
                    `/ratingvalues(${link.ratingValueId})`;
                }
                await dv.create("bookableresourcecharacteristics", payload);
              } catch {
                /* non-critical */
              }
            }
          } else {
            const charId =
              allCharIds[Math.floor(Math.random() * allCharIds.length)];
            if (charId) {
              try {
                await dv.create("bookableresourcecharacteristics", {
                  "Resource@odata.bind": `/bookableresources(${resourceId})`,
                  "Characteristic@odata.bind": `/characteristics(${charId})`,
                });
              } catch {
                /* non-critical */
              }
            }
          }
        }
      }

      // ── Territory ──
      const userTerrCode = userConfig?.territoryCode;
      if (userTerrCode !== undefined) {
        // Explicit user choice. Empty string = link nothing.
        const terrId = userTerrCode ? result.territoryIds[userTerrCode] : undefined;
        if (terrId) {
          // Skip if exact link already present.
          let alreadyLinked = false;
          try {
            const existingTerrs = await dv.query<{
              _msdyn_territory_value: string | null;
            }>("msdyn_resourceterritories", {
              filter: `_msdyn_resource_value eq ${resourceId} and _msdyn_territory_value eq ${terrId}`,
              select: ["_msdyn_territory_value"],
              top: 1,
            });
            alreadyLinked = existingTerrs.length > 0;
          } catch {
            alreadyLinked = false;
          }
          if (!alreadyLinked) {
            try {
              await dv.create("msdyn_resourceterritories", {
                "msdyn_resource@odata.bind": `/bookableresources(${resourceId})`,
                "msdyn_territory@odata.bind": `/territories(${terrId})`,
                msdyn_description: tag(),
              });
            } catch {
              /* non-critical */
            }
          }
        }
      } else {
        // Historical default.
        let hasTerr = false;
        try {
          const existingTerrs = await dv.query<{
            msdyn_resourceterritoryid: string;
          }>("msdyn_resourceterritories", {
            filter: `_msdyn_resource_value eq ${resourceId}`,
            select: ["msdyn_resourceterritoryid"],
            top: 1,
          });
          hasTerr = existingTerrs.length > 0;
        } catch {
          hasTerr = false;
        }
        if (!hasTerr && allTerrEntries.length > 0) {
          const tech = techByName.get(resourceName);
          const terrId =
            (tech && result.territoryIds[tech.primaryTerritoryCode]) ||
            allTerrEntries[Math.floor(Math.random() * allTerrEntries.length)][1];
          if (terrId) {
            try {
              await dv.create("msdyn_resourceterritories", {
                "msdyn_resource@odata.bind": `/bookableresources(${resourceId})`,
                "msdyn_territory@odata.bind": `/territories(${terrId})`,
                msdyn_description: tag(),
              });
            } catch {
              /* non-critical */
            }
          }
        }
      }

      augDone += 1;
      onProgress({
        step: "Bookable Resources",
        done: augDone,
        total: resourceEntries.length,
        detail: resourceName,
      });
    }
  }

  // ── Work Hours ───────────────────────────────────────────────────────────
  // Apply each technician's working-hour schedule to their bookable
  // resource's auto-created calendar via the FS unbound action
  // `msdyn_SaveCalendar`. Without working hours rules, the Schedule
  // Assistant treats a resource as never-available and returns "No
  // resources are available for this requirement" even when the resource
  // matches the requirement's territory + characteristics. Reference:
  // https://learn.microsoft.com/en-us/dynamics365/field-service/field-service-work-hours-calendar-api
  //
  // Per-resource configuration (since v1.41.4): each technician in the
  // preset can carry `workDays` (RFC-5545 BYDAY tokens), `workStartHour`,
  // `workEndHour`, and `timeZoneCode`. Defaults: Mon–Fri 8a–5p Pacific.
  // An empty `workDays` array means "no working hours" — we skip the
  // SaveCalendar call entirely so the resource stays unavailable.
  //
  // For each resource we:
  //   1. Fetch its `_calendarid_value` (auto-created on insert).
  //   2. POST `/msdyn_SaveCalendar` with one weekly recurrence rule.
  // Idempotency: re-running creates a parallel rule which Save Calendar V1
  // dedupes by replacing the most-recent overlap (per "What happens if
  // there are overlapping rules?" doc). For demo data this is fine — the
  // calendar ends with exactly one rule per resource.
  if (Object.keys(result.resourceIds).length > 0) {
    const whEntries = Object.entries(result.resourceIds);
    const whTechByName = new Map(
      (preset.sampleTechnicians ?? []).map((t) => [t.name, t]),
    );
    onProgress({ step: "Work Hours", done: 0, total: whEntries.length });
    // Anchor on a known Monday so the BYDAY clause makes sense without
    // any date-juggling. 2024-01-01 was a Monday.
    const anchor = "2024-01-01";
    const VALID_DAYS = new Set(["MO", "TU", "WE", "TH", "FR", "SA", "SU"]);
    for (let i = 0; i < whEntries.length; i++) {
      const [resourceName, resourceId] = whEntries[i];
      const tech = whTechByName.get(resourceName);
      // v1.42.5 — per-resource hours override (Generate page).
      // v1.42.6 — also resolves `tech:<Name>` (copy a sample technician's
      // schedule) and `custom` (use ResourceConfig.hoursCustom verbatim).
      const userCfg = options.resourceConfigs?.[resourceId];
      const userHoursKey = userCfg?.hoursPreset;
      let userHours: HoursPreset | undefined;
      if (userHoursKey && userHoursKey !== "default") {
        if (userHoursKey === "custom" && userCfg?.hoursCustom) {
          userHours = {
            label: "Custom",
            days: userCfg.hoursCustom.days,
            startHour: userCfg.hoursCustom.startHour,
            endHour: userCfg.hoursCustom.endHour,
            tz: userCfg.hoursCustom.tz,
          };
        } else if (userHoursKey.startsWith("tech:")) {
          const techName = userHoursKey.slice("tech:".length);
          const srcTech = (preset.sampleTechnicians ?? []).find(
            (x) => x.name === techName,
          );
          if (srcTech) {
            userHours = {
              label: `${techName}'s hours`,
              days: srcTech.workDays ?? ["MO", "TU", "WE", "TH", "FR"],
              startHour: clampHour(srcTech.workStartHour, 8),
              endHour: clampHour(srcTech.workEndHour, 17),
              tz: srcTech.timeZoneCode ?? 4,
            };
          }
        } else if (userHoursKey in HOURS_PRESETS) {
          userHours = HOURS_PRESETS[userHoursKey as HoursPresetKey];
        }
      }
      const rawDays = userHours ? userHours.days : tech?.workDays;
      const days =
        rawDays === undefined
          ? ["MO", "TU", "WE", "TH", "FR"]
          : rawDays.filter((d) => VALID_DAYS.has(d));
      const startH = userHours
        ? clampHour(userHours.startHour, 8)
        : clampHour(tech?.workStartHour, 8);
      const endH = userHours
        ? clampHour(userHours.endHour, 17)
        : clampHour(tech?.workEndHour, 17);
      const tzCode = userHours ? userHours.tz : (tech?.timeZoneCode ?? 4);
      let detail = "applied";
      // Empty workDays = explicit "no schedule"; skip the save call.
      if (days.length === 0 || endH <= startH) {
        onProgress({
          step: "Work Hours",
          done: i + 1,
          total: whEntries.length,
          detail: `${resourceName} — skipped (no schedule)`,
        });
        continue;
      }
      const startTime = `${anchor}T${pad2(startH)}:00:00.000Z`;
      const endTime = `${anchor}T${pad2(endH)}:00:00.000Z`;
      // v1.42.1 — Build extra `WorkHourType:3` (TimeOff) rules for any PTO
      // ranges on the preset row. Each range becomes one daily-recurring
      // rule pinned to the range's start date, with `UNTIL` set to the end
      // date at 23:59Z. Bad/empty ranges are filtered defensively so a
      // single typo doesn't kill the whole calendar save.
      const timeOffRules: Array<{
        Rules: Array<Record<string, unknown>>;
        RecurrencePattern?: string;
      }> = [];
      for (const off of tech?.timeOff ?? []) {
        if (!off?.start || !off?.end) continue;
        const start = String(off.start).slice(0, 10);
        const end = String(off.end).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) continue;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(end)) continue;
        if (end < start) continue;
        const untilCompact = `${end.replace(/-/g, "")}T235959Z`;
        timeOffRules.push({
          Rules: [
            {
              StartTime: `${start}T00:00:00.000Z`,
              EndTime: `${start}T23:59:00.000Z`,
              Effort: 1,
              WorkHourType: 3,
            },
          ],
          RecurrencePattern: `FREQ=DAILY;INTERVAL=1;UNTIL=${untilCompact}`,
        });
      }
      try {
        // Fetch the auto-created CalendarId.
        const rows = await dv.query<{ _calendarid_value: string | null }>(
          "bookableresources",
          {
            filter: `bookableresourceid eq ${resourceId}`,
            select: ["_calendarid_value"],
            top: 1,
          },
        );
        const calendarId = rows[0]?._calendarid_value;
        if (!calendarId) {
          detail = "skipped (no calendarid)";
        } else {
          const calendarEventInfo = JSON.stringify({
            CalendarId: calendarId,
            EntityLogicalName: "bookableresource",
            TimeZoneCode: tzCode,
            RulesAndRecurrences: [
              {
                Rules: [
                  {
                    StartTime: startTime,
                    EndTime: endTime,
                    Effort: 1,
                    WorkHourType: 0,
                  },
                ],
                RecurrencePattern: `FREQ=WEEKLY;INTERVAL=1;BYDAY=${days.join(",")}`,
              },
              ...timeOffRules,
            ],
          });
          const res = await dv.request("/msdyn_SaveCalendar", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ CalendarEventInfo: calendarEventInfo }),
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            // Most common: "Invalid recurrence pattern" or already-applied.
            // Both are non-fatal for the demo.
            recordSkip(result, "workHours", {
              reason: "validation",
              message: `msdyn_SaveCalendar ${res.status}: ${text.slice(0, 200)}`,
              recordLabel: resourceName,
              step: "Work Hours",
            });
            detail = `skipped (${res.status})`;
          } else {
            const ptoSuffix =
              timeOffRules.length > 0
                ? ` + ${timeOffRules.length} PTO`
                : "";
            detail = `${days.join(",")} ${pad2(startH)}:00–${pad2(endH)}:00${ptoSuffix}`;
          }
        }
      } catch (err) {
        recordSkip(result, "workHours", {
          reason: "validation",
          message: (err as Error)?.message ?? "unknown",
          recordLabel: resourceName,
          step: "Work Hours",
        });
        detail = "skipped (error)";
      }
      onProgress({
        step: "Work Hours",
        done: i + 1,
        total: whEntries.length,
        detail: `${resourceName} — ${detail}`,
      });
    }
  }

  // ── Functional Locations (Phase 2) ───────────────────────────────────────
  // hierarchical: each node may reference a parent node by name within the
  // same preset list. We rely on the AI / preset producer to list parents
  // before children. Cross-account references aren't allowed.
  const functionalLocations = preset.functionalLocations ?? [];
  const flMap = getIdMap(result, "functionalLocations");
  // Tracks which accounts already have at least one FL (via N:N). Populated
  // by the FL onResolved hook below; consulted by the FL augmentation pass
  // to avoid creating a redundant "Main Site" for accounts that already
  // have FLs from the preset.
  const flsByAccount: Record<string, string[]> = {};
  await runEntityStep(
    dv,
    result,
    {
      label: "Functional Locations",
      items: functionalLocations,
      choice: options.functionalLocations,
      target: flMap,
      entitySet: "msdyn_functionallocations",
      idField: "msdyn_functionallocationid",
      findField: "msdyn_name",
      findValue: (fl) => fl.name,
      mapKey: (fl) => fl.name,
      build: (fl) => {
        // NOTE: Functional Location ↔ Account is a many-to-many relationship
        // (`msdyn_msdyn_functionallocation_account`), NOT a single lookup, so
        // we cannot bind an account on create. Verified via $metadata.
        // Also: msdyn_functionallocation has no `msdyn_description` field.
        const parentId = fl.parentName ? flMap[fl.parentName] : undefined;
        const payload: Record<string, unknown> = {
          msdyn_name: fl.name,
        };
        if (parentId) {
          payload["msdyn_ParentFunctionalLocation@odata.bind"] =
            `/msdyn_functionallocations(${parentId})`;
        }
        return payload;
      },
      onCreated: (id) => {
        trackCreated(result, "functionalLocations", id);
      },
      onResolved: async (id, fl) => {
        // FL ↔ Account is N:N — must be associated post-create. Idempotent.
        const accountId = result.accountIds[fl.accountName];
        if (accountId) {
          try {
            await dv.associate(
              "msdyn_functionallocations",
              id,
              "msdyn_msdyn_functionallocation_account",
              "accounts",
              accountId,
            );
            (flsByAccount[accountId] ??= []).push(id);
          } catch {
            /* non-critical for the demo */
          }
        }
      },
    },
    onProgress,
  );

  // ── FL Augmentation: ensure every Account has at least one FL ───────────
  // Existing-mode accounts (picked by the user) aren't referenced in the
  // preset's functionalLocations[].accountName, so they'd otherwise have no
  // FLs. Synthesize a "{accountName} - Main Site" FL for any account that
  // lacks one, and N:N-associate it. We track flsByAccount in memory rather
  // than re-querying because the expand-from-account path uses an N:N nav
  // name that varies between orgs/installs.
  if (shouldCreate(options.functionalLocations)) {
    const accountEntries = Object.entries(result.accountIds);
    let augDone = 0;
    onProgress({
      step: "Functional Locations",
      done: 0,
      total: accountEntries.length,
      detail: "augment for accounts without FLs",
    });
    for (const [accountName, accountId] of accountEntries) {
      if ((flsByAccount[accountId]?.length ?? 0) > 0) {
        augDone += 1;
        onProgress({
          step: "Functional Locations",
          done: augDone,
          total: accountEntries.length,
          detail: `${accountName} (already has FL)`,
        });
        continue;
      }

      const flName = `${accountName} - Main Site`;
      let flId = flMap[flName] ?? (await findByField(
        dv,
        "msdyn_functionallocations",
        "msdyn_name",
        flName,
        "msdyn_functionallocationid",
      ));
      if (!flId) {
        const ctx = makeSafeCtx(
          result,
          "Functional Locations",
          "Functional Locations",
          flName,
        );
        const res = await safeCreate(
          dv,
          "msdyn_functionallocations",
          { msdyn_name: flName },
          ctx,
        );
        if (res.ok) {
          flId = res.id;
          flMap[flName] = flId;
          trackCreated(result, "functionalLocations", flId);
        }
      } else {
        flMap[flName] = flId;
      }
      if (flId) {
        try {
          await dv.associate(
            "msdyn_functionallocations",
            flId,
            "msdyn_msdyn_functionallocation_account",
            "accounts",
            accountId,
          );
          (flsByAccount[accountId] ??= []).push(flId);
        } catch {
          /* non-critical */
        }
      }
      augDone += 1;
      onProgress({
        step: "Functional Locations",
        done: augDone,
        total: accountEntries.length,
        detail: flName,
      });
    }
  }

  // ── Customer Assets (Phase 2) ───────────────────────────────────────────
  // Linked to account + optional functional location + optional product. Also
  // builds a side-index `assetsByAccount` so the WO step can wire one asset
  // per WO without an extra Dataverse query.
  const customerAssets = preset.customerAssets ?? [];
  const assetMap = getIdMap(result, "customerAssets");
  const assetsByAccount: Record<string, string[]> = {};
  await runEntityStep(
    dv,
    result,
    {
      label: "Customer Assets",
      items: customerAssets,
      choice: options.customerAssets,
      target: assetMap,
      entitySet: "msdyn_customerassets",
      idField: "msdyn_customerassetid",
      findField: "msdyn_name",
      findValue: (a) => a.name,
      mapKey: (a) => a.name,
      build: (a) => {
        const accountId = result.accountIds[a.accountName];
        const productId = a.productNumber
          ? result.productIds[a.productNumber]
          : undefined;
        const flId = a.functionalLocationName
          ? flMap[a.functionalLocationName]
          : undefined;
        const parentAssetId = a.parentAssetName
          ? assetMap[a.parentAssetName]
          : undefined;
        const payload: Record<string, unknown> = {
          msdyn_name: a.name,
        };
        if (a.serialNumber) {
          // msdyn_customerasset has no `msdyn_serialnumber` column in this org;
          // fall back to msdyn_assettag which is the standard FS asset identifier.
          payload["msdyn_assettag"] = a.serialNumber;
        }
        // Verified via $metadata: lowercase msdyn_account / msdyn_product,
        // PascalCase msdyn_FunctionalLocation, and parent-asset uses the
        // self-relationship nav `msdyn_parentasset_msdyn_customerasset`.
        if (accountId) {
          payload["msdyn_account@odata.bind"] = `/accounts(${accountId})`;
        }
        if (productId) {
          payload["msdyn_product@odata.bind"] = `/products(${productId})`;
        }
        if (flId) {
          payload["msdyn_FunctionalLocation@odata.bind"] =
            `/msdyn_functionallocations(${flId})`;
        }
        if (parentAssetId) {
          payload["msdyn_parentasset_msdyn_customerasset@odata.bind"] =
            `/msdyn_customerassets(${parentAssetId})`;
        }
        return payload;
      },
      onResolved: async (id, a, isNew) => {
        // For new assets we just set msdyn_account, so trust the preset's
        // account mapping. For reused assets the existing row's
        // msdyn_account may NOT match the preset (different demo run, manual
        // edit, etc.). Querying the real account avoids the FS plugin's
        // "customer asset must be related to the service account of the
        // current work order" 400 when this asset gets paired with a WO.
        let realAccountId: string | undefined;
        if (isNew) {
          realAccountId = result.accountIds[a.accountName];
        } else {
          try {
            const rows = await dv.query<{ _msdyn_account_value: string | null }>(
              "msdyn_customerassets",
              {
                filter: `msdyn_customerassetid eq ${id}`,
                select: ["_msdyn_account_value"],
                top: 1,
              },
            );
            realAccountId = rows[0]?._msdyn_account_value ?? undefined;
          } catch {
            realAccountId = undefined;
          }
        }
        if (realAccountId) {
          (assetsByAccount[realAccountId] ??= []).push(id);
        }
      },
      onCreated: (id) => {
        trackCreated(result, "customerAssets", id);
      },
    },
    onProgress,
  );

  // ── Customer Asset Augmentation: ensure every Account has at least one ──
  // Mirrors the FL augmentation: when accounts come from existing-mode
  // picks, the preset's customerAssets[] doesn't reference them so they
  // end up with zero assets. Create one default asset per account that has
  // none, attached to that account's first FL when available. Only runs
  // when customerAssets mode is "create".
  if (shouldCreate(options.customerAssets)) {
    const accountEntries = Object.entries(result.accountIds);
    let augDone = 0;
    onProgress({
      step: "Customer Assets",
      done: 0,
      total: accountEntries.length,
      detail: "augment for accounts without assets",
    });
    for (const [accountName, accountId] of accountEntries) {
      if ((assetsByAccount[accountId]?.length ?? 0) > 0) {
        augDone += 1;
        onProgress({
          step: "Customer Assets",
          done: augDone,
          total: accountEntries.length,
          detail: `${accountName} (already has asset)`,
        });
        continue;
      }
      const assetName = `${accountName} - Primary Asset`;
      let assetId = assetMap[assetName] ?? (await findByField(
        dv,
        "msdyn_customerassets",
        "msdyn_name",
        assetName,
        "msdyn_customerassetid",
      ));
      if (!assetId) {
        const flId = flsByAccount[accountId]?.[0];
        const payload: Record<string, unknown> = {
          msdyn_name: assetName,
          msdyn_assettag: `${accountName.replace(/\s+/g, "-").toUpperCase()}-001`,
          "msdyn_account@odata.bind": `/accounts(${accountId})`,
        };
        if (flId) {
          payload["msdyn_FunctionalLocation@odata.bind"] =
            `/msdyn_functionallocations(${flId})`;
        }
        const ctx = makeSafeCtx(
          result,
          "Customer Assets",
          "Customer Assets",
          assetName,
        );
        const res = await safeCreate(dv, "msdyn_customerassets", payload, ctx);
        if (res.ok) {
          assetId = res.id;
          assetMap[assetName] = assetId;
          trackCreated(result, "customerAssets", assetId);
        }
      } else {
        assetMap[assetName] = assetId;
      }
      if (assetId) {
        (assetsByAccount[accountId] ??= []).push(assetId);
      }
      augDone += 1;
      onProgress({
        step: "Customer Assets",
        done: augDone,
        total: accountEntries.length,
        detail: assetName,
      });
    }
  }

  // ── Service Task Types (Phase 2) ────────────────────────────────────────
  // Reusable task catalog. WOs created later will randomly attach 2–4 of
  // these as msdyn_workorderservicetask rows.
  const serviceTaskTypes = preset.serviceTaskTypes ?? [];
  const taskTypeMap = getIdMap(result, "serviceTaskTypes");
  await runEntityStep(
    dv,
    result,
    {
      label: "Service Task Types",
      items: serviceTaskTypes,
      choice: options.serviceTaskTypes,
      target: taskTypeMap,
      entitySet: "msdyn_servicetasktypes",
      idField: "msdyn_servicetasktypeid",
      findField: "msdyn_name",
      findValue: (s) => s.name,
      mapKey: (s) => s.name,
      build: (s) => {
        const payload: Record<string, unknown> = {
          msdyn_name: s.name,
          msdyn_description: tag(s.description),
        };
        if (typeof s.estimatedDurationMinutes === "number") {
          payload["msdyn_estimatedduration"] = s.estimatedDurationMinutes;
        }
        return payload;
      },
      onCreated: (id) => {
        trackCreated(result, "serviceTaskTypes", id);
      },
    },
    onProgress,
  );

  // ── Agreements (Phase 3) ────────────────────────────────────────────────
  // Created in Estimate status so server-side recurrence doesn't auto-spawn
  // WOs during the demo run. Each agreement gets a single booking setup with
  // covered incidents + estimated product lines.
  const agreements = preset.agreements ?? [];
  const agreementMap = getIdMap(result, "agreements");
  const agreementBookingSetupMap = getIdMap(
    result,
    "agreementBookingSetups",
  );

  // Agreement requires msdyn_pricelist (lookup to pricelevel). Resolve a
  // default once — prefer any active price list in the org. If none exists
  // (fresh / minimal orgs), auto-create one tied to the org's base currency
  // so demo generation can proceed without manual setup.
  // The resolver is memoized: once we've found / created a price list, both
  // agreements AND work orders bind to the same one.
  let defaultPriceListId: string | null = null;
  let priceListResolved = false;
  async function ensurePriceList(): Promise<string | null> {
    if (priceListResolved) return defaultPriceListId;
    priceListResolved = true;
    try {
      const priceLists = await dv.query<{ pricelevelid: string }>(
        "pricelevels",
        {
          select: ["pricelevelid", "name"],
          filter: "statecode eq 0",
          top: 1,
        },
      );
      if (priceLists[0]) {
        defaultPriceListId = priceLists[0].pricelevelid;
        return defaultPriceListId;
      }
      // No price list in the org — try to create a demo one. Need a
      // currency; prefer the org's base currency, fall back to any.
      let currencyId: string | null = null;
      try {
        const orgs = await dv.query<{
          _basecurrencyid_value: string;
        }>("organizations", {
          select: ["_basecurrencyid_value"],
          top: 1,
        });
        currencyId = orgs[0]?._basecurrencyid_value ?? null;
      } catch {
        /* fall through to any-currency lookup */
      }
      if (!currencyId) {
        const currencies = await dv.query<{ transactioncurrencyid: string }>(
          "transactioncurrencies",
          {
            select: ["transactioncurrencyid"],
            filter: "statecode eq 0",
            top: 1,
          },
        );
        currencyId = currencies[0]?.transactioncurrencyid ?? null;
      }
      if (!currencyId) {
        throw new Error(
          "This org has no price list and no active currency to attach one to. Create a price list in Sales → Price Lists, then re-run.",
        );
      }
      const newId = await dv.create("pricelevels", {
        name: tag("FSDL Demo Price List"),
        "transactioncurrencyid@odata.bind":
          `/transactioncurrencies(${currencyId})`,
      });
      defaultPriceListId = newId;
      // Track so per-run delete can clean it up.
      trackCreated(result, "priceLists", newId);
      return defaultPriceListId;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Could not resolve or create a price list (required by Field Service for agreements and work orders). ${msg}`,
      );
    }
  }

  if (agreements.length && options.agreements?.mode !== "skip") {
    await ensurePriceList();
  }
  await runEntityStep(
    dv,
    result,
    {
      label: "Agreements",
      items: agreements,
      choice: options.agreements,
      target: agreementMap,
      entitySet: "msdyn_agreements",
      idField: "msdyn_agreementid",
      findField: "msdyn_name",
      findValue: (a) => a.name,
      mapKey: (a) => a.name,
      build: (a) => {
        const accountId = result.accountIds[a.accountName];
        const payload: Record<string, unknown> = {
          msdyn_name: a.name,
          msdyn_description: tag(a.description),
          // 690970000 = Estimate (msdyn_agreement.msdyn_systemstatus). Keeps
          // server-side recurrence dormant. Accepted values in this org:
          // 690970000–690970003 (verified via the validation error).
          msdyn_systemstatus: 690970000,
          msdyn_startdate: a.startOn,
          msdyn_enddate: a.endOn,
        };
        if (accountId) {
          // All single-lookup nav props on msdyn_agreement / msdyn_workorder are
          // lowercase in this org — verified via $metadata.
          payload["msdyn_serviceaccount@odata.bind"] = `/accounts(${accountId})`;
          payload["msdyn_billingaccount@odata.bind"] = `/accounts(${accountId})`;
        }
        if (defaultPriceListId) {
          // Required by msdyn_agreement validation — uses the org's first
          // active price list.
          payload["msdyn_pricelist@odata.bind"] =
            `/pricelevels(${defaultPriceListId})`;
        }
        return payload;
      },
      onCreated: async (agreementId, a) => {
        trackCreated(result, "agreements", agreementId);

        // 1:1 booking setup carrying the recurrence + estimated duration.
        const setupName = `${a.name} — Visit Setup`;
        let setupId: string | null = null;
        try {
          setupId = await dv.create("msdyn_agreementbookingsetups", {
            msdyn_name: setupName,
            msdyn_description: tag(),
            "msdyn_agreement@odata.bind": `/msdyn_agreements(${agreementId})`,
            // Don't auto-generate WOs — demo presenter does that manually.
            msdyn_autogenerateworkorder: false,
            msdyn_estimatedduration: a.estimatedDurationMinutes ?? 60,
            msdyn_recurrencepattern: a.recurrencePattern,
            msdyn_startdate: a.startOn,
            msdyn_enddate: a.endOn,
          });
          agreementBookingSetupMap[a.name] = setupId;
          trackCreated(result, "agreementBookingSetups", setupId);
        } catch {
          /* booking setup is best-effort; agreement still exists */
        }

        if (!setupId) return;

        // Covered incident types — one row per incident name we recognise.
        for (const incidentName of a.coveredIncidentTypeNames ?? []) {
          const incidentId = result.incidentTypeIds[incidentName];
          if (!incidentId) continue;
          try {
            const id = await dv.create("msdyn_agreementbookingincidents", {
              msdyn_name: tag(`${a.name} — ${incidentName}`),
              msdyn_description: tag(),
              "msdyn_agreementbookingsetup@odata.bind": `/msdyn_agreementbookingsetups(${setupId})`,
              "msdyn_incidenttype@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
            });
            trackCreated(result, "agreementBookingIncidents", id);
          } catch {
            /* per-row best effort */
          }
        }

        // Covered estimated product lines.
        for (const productNumber of a.coveredProductNumbers ?? []) {
          const productId = result.productIds[productNumber];
          if (!productId) continue;
          try {
            const id = await dv.create("msdyn_agreementbookingproducts", {
              msdyn_name: tag(`${a.name} — ${productNumber}`),
              msdyn_description: tag(),
              "msdyn_agreementbookingsetup@odata.bind": `/msdyn_agreementbookingsetups(${setupId})`,
              "msdyn_product@odata.bind": `/products(${productId})`,
              msdyn_estimatedquantity: 1,
            });
            trackCreated(result, "agreementBookingProducts", id);
          } catch {
            /* per-row best effort */
          }
        }
      },
    },
    onProgress,
  );

  // ── Warehouses + Product Inventory (Phase 5) ────────────────────────────
  // Each warehouse holds on-hand inventory for every product. We look up the
  // product's defaultuomid (primary unit) on demand because msdyn_productinventory
  // requires a unit lookup; if the product has no default unit we skip its row.
  const warehouses = preset.warehouses ?? [];
  const warehouseMap = getIdMap(result, "warehouses");
  await runEntityStep(
    dv,
    result,
    {
      label: "Warehouses",
      items: warehouses,
      choice: options.warehouses,
      target: warehouseMap,
      entitySet: "msdyn_warehouses",
      idField: "msdyn_warehouseid",
      findField: "msdyn_name",
      findValue: (w) => w.name,
      mapKey: (w) => w.name,
      build: (w) => ({
        msdyn_name: w.name,
        msdyn_description: tag(w.description),
      }),
      onCreated: (id) => trackCreated(result, "warehouses", id),
    },
    onProgress,
  );

  const warehouseIdList = Object.values(warehouseMap);
  const productEntries = Object.entries(result.productIds);
  const skipProductInventory =
    (options.productInventory?.mode ?? "create") !== "create";
  if (!skipProductInventory && warehouseIdList.length > 0 && productEntries.length > 0) {
    // Cache product → defaultuomid lookups so we only query each product once.
    const productUnitCache: Record<string, string | null> = {};
    const totalRows = warehouseIdList.length * productEntries.length;
    onProgress({
      step: "Product Inventory",
      done: 0,
      total: totalRows,
    });
    let done = 0;
    for (const warehouseId of warehouseIdList) {
      for (const [, productId] of productEntries) {
        // Resolve unit lazily.
        let unitId = productUnitCache[productId];
        if (unitId === undefined) {
          try {
            const row = await dv.retrieve<{
              _defaultuomid_value?: string;
            }>("products", productId, ["_defaultuomid_value"]);
            unitId = row?._defaultuomid_value ?? null;
          } catch {
            unitId = null;
          }
          productUnitCache[productId] = unitId;
        }
        if (!unitId) {
          done++;
          onProgress({ step: "Product Inventory", done, total: totalRows });
          continue;
        }

        const existing = await dv.query<{ msdyn_productinventoryid: string }>(
          "msdyn_productinventories",
          {
            filter: `_msdyn_warehouse_value eq ${warehouseId} and _msdyn_product_value eq ${productId}`,
            select: ["msdyn_productinventoryid"],
            top: 1,
          },
        );
        if (!existing[0]) {
          try {
            const piId = await dv.create("msdyn_productinventories", {
              msdyn_name: tag(`Inventory ${productId.slice(0, 6)}@${warehouseId.slice(0, 6)}`),
              msdyn_description: tag(),
              msdyn_quantityonhand: 5 + Math.floor(Math.random() * 45),
              "msdyn_warehouse@odata.bind": `/msdyn_warehouses(${warehouseId})`,
              "msdyn_product@odata.bind": `/products(${productId})`,
              "msdyn_unit@odata.bind": `/uoms(${unitId})`,
            });
            trackCreated(result, "productInventory", piId);
          } catch {
            /* skip — unit groups may not be configured */
          }
        }
        done++;
        onProgress({ step: "Product Inventory", done, total: totalRows });
      }
    }
  }

  // ── Work Orders (mixed statuses) ─────────────────────────────────────────
  // Synthesize ~2 work orders per account across 3 status buckets so the
  // dispatcher board / KPI tiles have something to show on first load.
  // msdyn_systemstatus values: 690970000=Open-Unscheduled, 690970001=Scheduled,
  // 690970004=Closed-Posted (we skip In Progress / Completed since they require
  // booking flow we haven't built yet).
  //
  // IMPORTANT: target-Closed-Posted WOs are CREATED as Open-Unscheduled and
  // transitioned to Closed-Posted in the final "Close Work Orders" phase.
  // The FS plugin rejects child rows (tasks, products, bookings, time
  // entries) on Posted WOs, so we attach all children while the WO is
  // still Open and flip the status last.
  // Friendly account-instruction snippets so the WO form has a non-empty
  // "Account instructions" field (rotates per WO for variety).
  const accountInstructionTemplates = [
    "Notify site contact 30 minutes before arrival. Use the loading dock entrance after 5pm.",
    "Badge required at front desk. Escort needed for server room access.",
    "Park in visitor lot only. Bring lift gate for unit replacement.",
    "Schedule with facilities manager 24h ahead. PPE required on roof.",
    "Tenant access only Mon–Fri 8a–4p. Confirm appointment day-of with site contact.",
    "Lockout/tagout procedure required before service. Sign in at security desk.",
  ];
  const accountIdList = Object.values(result.accountIds);
  const incidentIdList = Object.values(result.incidentTypeIds);
  const woTypeIdList = Object.values(result.workOrderTypeIds);
  const skipWorkOrders = (options.workOrders?.mode ?? "create") !== "create";
  const targetWoCount =
    !skipWorkOrders &&
    accountIdList.length > 0 &&
    incidentIdList.length > 0 &&
    woTypeIdList.length > 0
      ? Math.max(1, Math.min(MAX_WO_COUNT, knobs.woCount))
      : 0;
  // Status + priority bags built up-front from the knob percentages.
  // We shuffle them with seeds derived from the org so re-runs are stable
  // but two different orgs see different distributions.
  const statusBag = deterministicShuffle(
    buildStatusBag(targetWoCount, knobs.statusMix),
    targetWoCount * 31 + 17,
  );
  const priorityBag = deterministicShuffle(
    buildPriorityBag(targetWoCount, knobs.priorityMix),
    targetWoCount * 53 + 11,
  );

  // Resolve `msdyn_priority` records (Low/Medium/High/Critical) once. Orgs
  // missing one of these names just skip that WO's priority field.
  const priorityIdByName: Record<string, string> = {};
  if (targetWoCount > 0) {
    try {
      const rows = await dv.query<{ msdyn_priorityid: string; msdyn_name: string }>(
        "msdyn_priorities",
        {
          filter: "statecode eq 0",
          select: ["msdyn_priorityid", "msdyn_name"],
          top: 50,
        },
      );
      for (const r of rows) {
        if (r.msdyn_name) priorityIdByName[r.msdyn_name] = r.msdyn_priorityid;
      }
    } catch {
      /* no priorities — skip the field */
    }
  }
  // Work orders also require msdyn_pricelist in most FS configs. Resolve
  // (and auto-create if needed) BEFORE the loop so we don't silently fail
  // 16 times in a row.
  const woPriceListId =
    targetWoCount > 0 ? await ensurePriceList() : null;
  onProgress({ step: "Work Orders", done: 0, total: targetWoCount });
  const scheduledWoIds: string[] = [];
  // Per-WO metadata used by Phase 4 (WO Products + Time Entries) and the
  // final Close Work Orders phase. `status` is the *effective* status the
  // WO is currently in (used for child-row creation logic). `targetStatus`
  // is the demo's intended end state — for target=Closed-Posted, the WO
  // is created as Open and only transitioned to Posted at the very end.
  const woMeta: Array<{
    woId: string;
    status: number;
    targetStatus: number;
    accountId: string;
    incidentName: string;
  }> = [];
  // WOs that are currently Posted (either we couldn't re-open them, or a
  // child-create surfaced a `been posted` skip from safeCreate). Every
  // child-row phase (Service Tasks, Bookings, WO Products, Time Entries)
  // checks this set as a fast-path so a single stuck WO incurs at most one
  // skipped round-trip per phase. Classification still happens via
  // `safeWrite.classifyError`; this set is purely a perf optimization.
  const postedWoIds = new Set<string>();
  // Incident-id → name lookup so we can record the human-readable name
  // for skill matching during booking.
  // for skill matching during booking.
  const incidentNameById: Record<string, string> = {};
  for (const inc of preset.incidentTypes ?? []) {
    const id = result.incidentTypeIds[inc.name];
    if (id) incidentNameById[id] = inc.name;
  }
  // Promised window for Open + Scheduled WOs. Setting these on the WO at
  // create time causes the FS plugin that auto-creates the requirement to
  // cascade them onto the requirement record (msdyn_TimeFromPromised /
  // msdyn_TimeToPromised, and in many configs msdyn_fromdate /
  // msdyn_todate too) — sidestepping the async lookup race we hit in
  // v1.41.1's post-create patch path. These are DateAndTime UserLocal
  // fields per the msdyn_workorder reference, so a full ISO string is
  // the correct format.
  const promisedFrom = new Date();
  promisedFrom.setHours(knobs.workdayStartHour, 0, 0, 0);
  const promisedTo = new Date(promisedFrom);
  promisedTo.setDate(promisedTo.getDate() + Math.max(1, knobs.daysForward));
  promisedTo.setHours(knobs.workdayStartHour + 8, 0, 0, 0);
  const promisedFromIso = promisedFrom.toISOString();
  const promisedToIso = promisedTo.toISOString();
  for (let i = 0; i < targetWoCount; i++) {
    const accountId = accountIdList[i % accountIdList.length];
    const incidentId = incidentIdList[i % incidentIdList.length];
    const woTypeId = woTypeIdList[i % woTypeIdList.length];
    const targetStatus = statusBag[i] ?? 690970000;
    // Closed-Posted target → start as Open-Unscheduled so the FS plugin
    // lets us attach tasks/products/bookings/time entries. The final
    // "Close Work Orders" phase flips status back to Posted.
    const effectiveStatus = targetStatus === 690970004 ? 690970000 : targetStatus;
    // Per-run scoping: when a runId is supplied, suffix every WO summary
    // so this run's WOs don't collide with a previous run's WOs of the
    // same index. Without this, re-runs would land on the same
    // `Auto-generated WO #1` records and trip the FS plugin's
    // "can't change status to Unscheduled" guard whenever those WOs
    // already had bookings. With it, each run produces a fresh set.
    const summary = options.runId
      ? tag(`Auto-generated WO #${i + 1} \u2014 ${options.runId}`)
      : tag(`Auto-generated WO #${i + 1}`);
    const accountInstructions = tag(
      accountInstructionTemplates[i % accountInstructionTemplates.length],
    );
    // Service window: 1.5–3 hours depending on incident.
    const estimatedDurationMin = 90 + (i % 4) * 30; // 90, 120, 150, 180

    // Idempotency: search by tagged summary so re-runs don't duplicate.
    // We also pull the current systemstatus so we can heal WOs that prior
    // versions of this seeder had Posted directly (those WOs have no
    // children — we re-Open them so the heal can attach the missing rows).
    const existing = await dv.query<{
      msdyn_workorderid: string;
      statuscode?: number;
      msdyn_systemstatus?: number;
    }>("msdyn_workorders", {
      filter: `msdyn_workordersummary eq '${oencode(summary)}'`,
      select: ["msdyn_workorderid", "msdyn_systemstatus"],
      top: 1,
    });
    let woId = existing[0]?.msdyn_workorderid;
    // If the existing WO is already Posted but our target IS Posted, we
    // need to re-Open it temporarily so child rows can be attached. The
    // close phase at the end will Post it back.
    if (
      woId &&
      existing[0]?.msdyn_systemstatus === 690970004 &&
      targetStatus === 690970004
    ) {
      const reopenRes = await safeUpdate(
        dv,
        "msdyn_workorders",
        woId,
        { msdyn_systemstatus: 690970000 },
        makeSafeCtx(result, "workOrders", "Work Orders", `Reopen ${summary}`),
      );
      if (!reopenRes.ok) {
        // Reopen blocked (typically posted-wo). Mark it Posted so all
        // child-row phases skip it instead of incurring 400s.
        postedWoIds.add(woId);
        onProgress({
          step: "Work Orders",
          done: i + 1,
          total: targetWoCount,
          detail: `Reopen failed: ${reopenRes.skipped.reason}`,
        });
      }
    }
    if (!woId) {
      const woPayload: Record<string, unknown> = {
        msdyn_workordersummary: summary,
        msdyn_systemstatus: effectiveStatus,
        msdyn_accountinstructions: accountInstructions,
        msdyn_estimatedserviceduration: estimatedDurationMin,
        "msdyn_serviceaccount@odata.bind": `/accounts(${accountId})`,
        "msdyn_billingaccount@odata.bind": `/accounts(${accountId})`,
        "msdyn_workordertype@odata.bind": `/msdyn_workordertypes(${woTypeId})`,
        "msdyn_primaryincidenttype@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
      };
      if (woPriceListId) {
        woPayload["msdyn_pricelist@odata.bind"] = `/pricelevels(${woPriceListId})`;
      }
      // Time From / To Promised: the SLA window the customer was promised.
      // Only set on Open and Scheduled WOs (forward-window). Closed WOs
      // get a separate backdated journey via the Bookings phase, so we
      // leave these blank to avoid a future "promised by" date on a
      // historical record. The FS plugin cascades these onto the
      // auto-created msdyn_resourcerequirement, which gives the schedule
      // board's Open Requirements tab the dates it needs without our
      // post-create lookup having to win a race against the plugin.
      if (targetStatus === 690970000 || targetStatus === 690970001) {
        woPayload["msdyn_timefrompromised"] = promisedFromIso;
        woPayload["msdyn_timetopromised"] = promisedToIso;
      }
      // Priority: bag is shuffled per-run so the WOs land with a realistic
      // mix. Skip when the org's priority record for that name is missing.
      const priorityName = priorityBag[i];
      const priorityId = priorityName ? priorityIdByName[priorityName] : undefined;
      if (priorityId) {
        woPayload["msdyn_priority@odata.bind"] = `/msdyn_priorities(${priorityId})`;
      }
      // Phase 2: attach a customer asset for this account if we have one.
      // Round-robin through the account's assets so multiple WOs against
      // the same account spread across different equipment.
      // Final defensive check: re-verify the asset's msdyn_account still
      // matches this WO's service account. The FS plugin enforces this
      // and 400s with "customer asset must be related to the service
      // account of the current work order" otherwise — covers any drift
      // between assetsByAccount and the live record.
      const accountAssets = assetsByAccount[accountId] ?? [];
      if (accountAssets.length > 0) {
        const candidateAssetId = accountAssets[i % accountAssets.length];
        let assetMatchesAccount = true;
        try {
          const rows = await dv.query<{ _msdyn_account_value: string | null }>(
            "msdyn_customerassets",
            {
              filter: `msdyn_customerassetid eq ${candidateAssetId}`,
              select: ["_msdyn_account_value"],
              top: 1,
            },
          );
          assetMatchesAccount = rows[0]?._msdyn_account_value === accountId;
        } catch {
          // If the verify query fails, skip the asset rather than risk a 400.
          assetMatchesAccount = false;
        }
        if (assetMatchesAccount) {
          woPayload["msdyn_customerasset@odata.bind"] =
            `/msdyn_customerassets(${candidateAssetId})`;
        }
      }
      // Surface real failures via the run summary (a per-WO 400 used to
      // abort the whole run). safeCreate auto-strips schema-mismatched
      // columns and classifies known-benign 400s as skips.
      const woRes = await safeCreate(
        dv,
        "msdyn_workorders",
        woPayload,
        makeSafeCtx(result, "workOrders", "Work Orders", summary),
      );
      if (!woRes.ok) {
        onProgress({
          step: "Work Orders",
          done: i + 1,
          total: targetWoCount,
          detail: `${summary} (skipped: ${woRes.skipped.reason})`,
        });
        continue;
      }
      woId = woRes.id;
    }
    result.workOrderIds.push(woId);
    trackCreated(result, "workOrders", woId);
    woMeta.push({
      woId,
      status: effectiveStatus,
      targetStatus,
      accountId,
      incidentName: incidentNameById[incidentId] ?? "",
    });
    // Both Scheduled and target-Closed WOs need a booking + time entry.
    // (Closed ones get backdated bookings in the Bookings phase.)
    if (targetStatus === 690970001 || targetStatus === 690970004) {
      scheduledWoIds.push(woId);
    }
    onProgress({
      step: "Work Orders",
      done: i + 1,
      total: targetWoCount,
      detail: `${summary} (${
        targetStatus === 690970004
          ? "Closed (pending post)"
          : targetStatus === 690970001
            ? "Scheduled"
            : "Open"
      })`,
    });
  }

  // ── Resource Requirements: from/to dates ─────────────────────────────────
  // FS auto-creates one msdyn_resourcerequirement per WO, but the plugin
  // that does so runs ASYNCHRONOUSLY after the WO commit returns. If we
  // query immediately the row often isn't there yet (same lag pattern as
  // the WO auto-number plugin called out elsewhere in this file). The
  // schedule board's Open Requirements tab binds its From Date / To Date
  // columns (and the date-range filter) to msdyn_fromdate / msdyn_todate
  // on that requirement record, so a missing requirement = blank columns
  // and the date filter excludes the row.
  //
  // Strategy (must work first time, per user requirement):
  //   1. Look up the auto-created requirement.
  //   2. If missing, retry with backoff (1s, 2.5s, 5s) — covers the
  //      typical plugin lag of a few seconds.
  //   3. If STILL missing after retries, create the requirement ourselves
  //      with msdyn_workorder@odata.bind. Per the table reference both
  //      msdyn_workorder and msdyn_fromdate / msdyn_todate are valid for
  //      create. The FS auto-create plugin won't double up — it only fires
  //      when no requirement exists yet, and at this point one does.
  //   4. Either way, patch / create with from/to so the columns are
  //      populated and the schedule board's date filter includes the row.
  //
  // We patch only the truly-Open WOs (targetStatus === Open-Unscheduled).
  // Scheduled and Closed-Posted WOs already have a booking that drives
  // placement on the board.
  const openWoIds = woMeta
    .filter((m) => m.targetStatus === 690970000)
    .map((m) => m.woId);
  if (openWoIds.length > 0) {
    // Window: today @ workdayStartHour → today + daysForward @ workdayStartHour+8.
    // Matches the same anchor used by Bookings so the dispatcher sees a
    // consistent demo window across Unscheduled and Scheduled buckets.
    const reqFrom = new Date();
    reqFrom.setHours(knobs.workdayStartHour, 0, 0, 0);
    const reqTo = new Date(reqFrom);
    reqTo.setDate(reqTo.getDate() + Math.max(1, knobs.daysForward));
    reqTo.setHours(knobs.workdayStartHour + 8, 0, 0, 0);
    const fromIso = reqFrom.toISOString();
    const toIso = reqTo.toISOString();
    onProgress({
      step: "Resource Requirements",
      done: 0,
      total: openWoIds.length,
    });
    // Backoff schedule for the auto-created requirement lookup. Three
    // attempts spaced at 0ms, 1.5s, 4s — total worst-case wait of 5.5s
    // per WO before we fall back to creating one ourselves.
    const lookupDelaysMs = [0, 1500, 4000];
    for (let i = 0; i < openWoIds.length; i++) {
      const woId = openWoIds[i];
      let reqId: string | undefined;
      for (const delay of lookupDelaysMs) {
        if (delay > 0) {
          await new Promise((r) => setTimeout(r, delay));
        }
        try {
          const rows = await dv.query<{ msdyn_resourcerequirementid: string }>(
            "msdyn_resourcerequirements",
            {
              filter: `_msdyn_workorder_value eq ${woId}`,
              select: ["msdyn_resourcerequirementid"],
              top: 1,
            },
          );
          reqId = rows[0]?.msdyn_resourcerequirementid;
          if (reqId) break;
        } catch {
          /* transient — try the next delay */
        }
      }
      let outcome: "patched" | "created" | "skipped" = "skipped";
      let skipReason: string | undefined;
      if (reqId) {
        const patchRes = await safeUpdate(
          dv,
          "msdyn_resourcerequirements",
          reqId,
          { msdyn_fromdate: fromIso, msdyn_todate: toIso },
          makeSafeCtx(
            result,
            "resourceRequirements",
            "Resource Requirements",
            `WO ${woId.slice(0, 8)}`,
          ),
        );
        if (patchRes.ok) {
          outcome = "patched";
        } else {
          skipReason = patchRes.skipped.reason;
        }
      } else {
        // Plugin still hasn't materialized the row after ~5.5s. Create one
        // ourselves so the columns aren't blank. Includes the WO link plus
        // a duration default so the plugin's "remaining duration" math has
        // something to work with on the board.
        const reqPayload: Record<string, unknown> = {
          msdyn_name: `Requirement for ${woId.slice(0, 8)}`,
          msdyn_fromdate: fromIso,
          msdyn_todate: toIso,
          msdyn_duration: 120,
          "msdyn_workorder@odata.bind": `/msdyn_workorders(${woId})`,
        };
        const createRes = await safeCreate(
          dv,
          "msdyn_resourcerequirements",
          reqPayload,
          makeSafeCtx(
            result,
            "resourceRequirements",
            "Resource Requirements",
            `WO ${woId.slice(0, 8)} (fallback create)`,
          ),
        );
        if (createRes.ok) {
          outcome = "created";
        } else {
          skipReason = createRes.skipped.reason;
        }
      }
      onProgress({
        step: "Resource Requirements",
        done: i + 1,
        total: openWoIds.length,
        detail:
          outcome === "patched"
            ? `WO ${woId.slice(0, 8)} dated`
            : outcome === "created"
              ? `WO ${woId.slice(0, 8)} dated (created requirement)`
              : `WO ${woId.slice(0, 8)} (skipped: ${skipReason ?? "unknown"})`,
      });
    }
  }

  // ── WO Service Tasks (Phase 2) ───────────────────────────────────────────
  // For each created WO, attach 2–4 service tasks from the catalog so the
  // checklist surfaces in demos. Skipped silently if no service-task types
  // were seeded.
  const taskTypeIds = Object.values(taskTypeMap);
  const skipWoServiceTasks =
    (options.workOrderServiceTasks?.mode ?? "create") !== "create";
  if (!skipWoServiceTasks && taskTypeIds.length > 0 && result.workOrderIds.length > 0) {
    const tasksPerWo = Math.min(4, Math.max(2, Math.floor(taskTypeIds.length / 2)));
    // Invert the {name → id} map so we can label each WO service-task with
    // its task type name (e.g. "Safety Lockout/Tagout") instead of a synthetic
    // "WO #1 task 1" string.
    const taskTypeNameById: Record<string, string> = {};
    for (const [name, id] of Object.entries(taskTypeMap)) {
      taskTypeNameById[id] = name;
    }
    // Target-Closed WOs are currently in effective status Open while we
    // attach children, so no filter is needed — every WO accepts tasks.
    const tasksWoMeta = woMeta;
    onProgress({
      step: "WO Service Tasks",
      done: 0,
      total: tasksWoMeta.length,
    });
    for (let i = 0; i < tasksWoMeta.length; i++) {
      const woId = tasksWoMeta[i].woId;
      if (postedWoIds.has(woId)) {
        onProgress({
          step: "WO Service Tasks",
          done: i + 1,
          total: tasksWoMeta.length,
          detail: "Skipped (WO is Posted)",
        });
        continue;
      }
      for (let j = 0; j < tasksPerWo; j++) {
        const taskTypeId = taskTypeIds[(i + j) % taskTypeIds.length];
        const taskName = taskTypeNameById[taskTypeId] ?? `WO task ${j + 1}`;
        // Idempotency: skip if a task with this name already exists on this WO.
        const existing = await dv.query<{ msdyn_workorderservicetaskid: string }>(
          "msdyn_workorderservicetasks",
          {
            filter: `msdyn_name eq '${oencode(taskName)}' and _msdyn_workorder_value eq ${woId}`,
            select: ["msdyn_workorderservicetaskid"],
            top: 1,
          },
        );
        if (existing[0]) continue;
        const res = await safeCreate(
          dv,
          "msdyn_workorderservicetasks",
          {
            msdyn_name: taskName,
            msdyn_description: tag(),
            "msdyn_workorder@odata.bind": `/msdyn_workorders(${woId})`,
            "msdyn_tasktype@odata.bind": `/msdyn_servicetasktypes(${taskTypeId})`,
          },
          makeSafeCtx(result, "workOrderServiceTasks", "WO Service Tasks", taskName),
        );
        if (!res.ok) {
          // Posted-WO is the common case here — cache so remaining tasks on
          // this WO skip the round-trip. Other reasons just continue.
          if (res.skipped.reason === "posted-wo") {
            postedWoIds.add(woId);
            break;
          }
          continue;
        }
        trackCreated(result, "workOrderServiceTasks", res.id);
        setLabel(result, "workOrderServiceTasks", res.id, taskName);
      }
      onProgress({
        step: "WO Service Tasks",
        done: i + 1,
        total: tasksWoMeta.length,
      });
    }
  }

  // ── Bookings (one per Scheduled or target-Closed WO) ────────────────────
  // Bookings populate the schedule board. Scheduled WOs get future
  // bookings; target-Closed WOs get backdated bookings (so the demo
  // shows historical service activity) marked with the "Completed"
  // booking status when available.
  const resourceIdList = Object.values(result.resourceIds);
  // Tech roster (in preset order) used for weighted / skill-matched picks
  // below. Each entry pairs a tech's name + primarySkill with the resource
  // record we already created for them.
  const techRoster: Array<{ name: string; skill: string; resourceId: string; weight: number }> =
    [];
  for (const t of preset.sampleTechnicians ?? []) {
    const rid = result.resourceIds[t.name];
    if (rid) {
      techRoster.push({
        name: t.name,
        skill: t.primarySkill,
        resourceId: rid,
        weight: knobs.weightedTechs ? weightFromName(t.name) : 1,
      });
    }
  }
  // Pre-build a weighted index pool so even without skill match we get
  // a "top performer" skew. Each tech's index appears `weight` times.
  const weightedFullPool: number[] = [];
  techRoster.forEach((t, i) => {
    for (let w = 0; w < t.weight; w++) weightedFullPool.push(i);
  });
  const skipBookings = (options.bookings?.mode ?? "create") !== "create";
  let bookingTarget = 0;
  if (!skipBookings && scheduledWoIds.length > 0 && resourceIdList.length > 0) {
    bookingTarget = scheduledWoIds.length;
  }
  onProgress({ step: "Bookings", done: 0, total: bookingTarget });
  // Captured per booking so Phase 4 Time Entries can mirror the resource's
  // working window without re-querying.
  const bookingMeta: Array<{
    bookingId: string;
    woId: string;
    resourceId: string;
    start: Date;
    end: Date;
  }> = [];

  // Resolve "Scheduled" + "Completed" booking statuses once. Statecode=0
  // (Active) filters out any inactive/customised duplicates.
  let scheduledStatusId: string | null = null;
  let completedStatusId: string | null = null;
  if (bookingTarget > 0) {
    try {
      const rows = await dv.query<{ bookingstatusid: string; name: string }>(
        "bookingstatuses",
        {
          filter:
            "(name eq 'Scheduled' or name eq 'Completed') and statecode eq 0",
          select: ["bookingstatusid", "name"],
          top: 5,
        },
      );
      for (const r of rows) {
        if (r.name === "Scheduled") scheduledStatusId = r.bookingstatusid;
        if (r.name === "Completed") completedStatusId = r.bookingstatusid;
      }
    } catch {
      scheduledStatusId = null;
      completedStatusId = null;
    }
  }

  if (bookingTarget > 0 && scheduledStatusId) {
    // Schedule anchor: knob.startDate (YYYY-MM-DD) when set, else tomorrow.
    // Future bookings step forward from this date; closed bookings step
    // backward.
    const baseStart = (() => {
      const raw = (knobs.startDate ?? "").trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
        const [y, m, d] = raw.split("-").map(Number);
        const dt = new Date(y, m - 1, d);
        dt.setHours(knobs.workdayStartHour, 0, 0, 0);
        return dt;
      }
      const dt = new Date();
      dt.setDate(dt.getDate() + 1);
      dt.setHours(knobs.workdayStartHour, 0, 0, 0);
      return dt;
    })();
    const slotHours = 2;
    const slotsPerDay = 4; // workdayStart, +2h, +4h, +6h
    // Total span (in days) for forward and backward booking spread.
    const forwardSpan = Math.max(1, knobs.daysForward);
    const backwardSpan = Math.max(1, knobs.daysBackward);

    // Batch-fetch EVERY WO's auto-numbered name (e.g. "WO-01016") in a single
    // query — needed both as the booking title and as the dashboard chip
    // label for each WO. Per-WO lookups inside the loop sometimes returned
    // empty because the FS auto-number plugin can lag right after create;
    // batching after all WOs are committed gives the plugin time and costs
    // just 1 call.
    const woNumberById: Record<string, string> = {};
    if (result.workOrderIds.length > 0) {
      try {
        const idFilter = result.workOrderIds
          .map((id) => `msdyn_workorderid eq ${id}`)
          .join(" or ");
        const rows = await dv.query<{
          msdyn_workorderid: string;
          msdyn_name: string;
        }>("msdyn_workorders", {
          filter: idFilter,
          select: ["msdyn_workorderid", "msdyn_name"],
          top: result.workOrderIds.length,
        });
        for (const r of rows) {
          if (r.msdyn_name) {
            woNumberById[r.msdyn_workorderid] = r.msdyn_name;
            // Surface the auto-number in the run-output dashboard.
            setLabel(result, "workOrders", r.msdyn_workorderid, r.msdyn_name);
          }
        }
      } catch {
        /* fall back to synthetic name */
      }
    }

    for (let i = 0; i < scheduledWoIds.length; i++) {
      const woId = scheduledWoIds[i];
      // Resource pick: skill-match filter first, then weighted pool inside
      // the candidate set. Falls back to the flat resource list if the
      // roster is somehow empty (e.g. all techs reused from existing).
      let resourceId: string;
      if (techRoster.length > 0) {
        const incidentName =
          woMeta.find((m) => m.woId === woId)?.incidentName ?? "";
        const candidateIdxs = filterTechsBySkill(
          techRoster.map((t) => t.name),
          techRoster.map((t) => t.skill),
          incidentName,
          knobs.skillMatch,
        );
        // Weighted pool restricted to candidates.
        const candidatePool: number[] = [];
        for (const idx of candidateIdxs) {
          for (let w = 0; w < techRoster[idx].weight; w++) candidatePool.push(idx);
        }
        const pool = candidatePool.length > 0 ? candidatePool : weightedFullPool;
        const chosen = pool[i % pool.length];
        resourceId = techRoster[chosen].resourceId;
      } else {
        resourceId = resourceIdList[i % resourceIdList.length];
      }
      // Look up whether this WO is target-Closed so we know to backdate.
      const targetIsClosed =
        woMeta.find((m) => m.woId === woId)?.targetStatus === 690970004;
      const dayOffset = Math.floor(i / slotsPerDay);
      const slotInDay = i % slotsPerDay;
      const start = new Date(baseStart);
      if (targetIsClosed) {
        // Closed/historical: spread evenly across the backward window.
        // 1..backwardSpan days back, wrapping if more closed WOs than days.
        const back = 1 + (dayOffset % backwardSpan);
        start.setDate(start.getDate() - back);
      } else {
        // Forward: spread across the forward window.
        start.setDate(start.getDate() + (dayOffset % forwardSpan));
      }
      start.setHours(knobs.workdayStartHour + slotInDay * slotHours);
      const end = new Date(start.getTime() + slotHours * 60 * 60 * 1000);
      const bookingStatusId =
        targetIsClosed && completedStatusId ? completedStatusId : scheduledStatusId;
      const woNumber = woNumberById[woId] ?? null;
      const bookingName =
        woNumber ?? tag(`Booking for WO #${result.workOrderIds.indexOf(woId) + 1}`);

      // Idempotency: prefer matching on the linked WO (handles the case where
      // an older run created the booking under a synthetic name like "Booking
      // for WO #4"). Heal that name to the WO number while we're here.
      const existing = await dv.query<{
        bookableresourcebookingid: string;
        name: string;
      }>("bookableresourcebookings", {
        filter: `_msdyn_workorder_value eq ${woId}`,
        select: ["bookableresourcebookingid", "name"],
        top: 1,
      });
      let bookingId = existing[0]?.bookableresourcebookingid;
      if (bookingId && woNumber && existing[0]?.name !== woNumber) {
        try {
          await dv.update("bookableresourcebookings", bookingId, {
            name: woNumber,
          });
        } catch {
          /* heal best-effort */
        }
      }
      if (!bookingId) {
        const res = await safeCreate(
          dv,
          "bookableresourcebookings",
          {
            name: bookingName,
            starttime: start.toISOString(),
            endtime: end.toISOString(),
            "Resource@odata.bind": `/bookableresources(${resourceId})`,
            "BookingStatus@odata.bind": `/bookingstatuses(${bookingStatusId})`,
            "msdyn_workorder@odata.bind": `/msdyn_workorders(${woId})`,
          },
          makeSafeCtx(result, "bookings", "Bookings", bookingName),
        );
        if (!res.ok) {
          if (res.skipped.reason === "posted-wo") postedWoIds.add(woId);
          // FS booking validation can reject for many reasons (e.g. resource
          // type mismatch). Skip without breaking the rest of the seed.
          onProgress({
            step: "Bookings",
            done: i + 1,
            total: bookingTarget,
            detail: `Skipped (${res.skipped.reason})`,
          });
          continue;
        }
        bookingId = res.id;
      }
      result.bookingIds.push(bookingId);
      bookingMeta.push({ bookingId, woId, resourceId, start, end });
      setLabel(result, "bookings", bookingId, bookingName);
      onProgress({
        step: "Bookings",
        done: i + 1,
        total: bookingTarget,
        detail: `${bookingName} → ${start.toLocaleDateString()}`,
      });
    }
  }

  // ── WO Products (Phase 4) ───────────────────────────────────────────────
  // 1–3 product lines per WO. linestatus = Estimated for Open/Scheduled, Used
  // for Closed-Posted so closed WOs look "actually serviced" in the demo.
  const productIdList = Object.values(result.productIds);
  const skipWoProducts =
    (options.workOrderProducts?.mode ?? "create") !== "create";
  if (!skipWoProducts && productIdList.length > 0 && woMeta.length > 0) {
    // {productId → productName} so each WO product line can be labelled with
    // the product's name instead of "WO #1 part 1".
    const productNameById: Record<string, string> = {};
    // {productId → listPrice} so closed WOs get realistic financials.
    const productPriceById: Record<string, number> = {};
    for (const p of preset.products ?? []) {
      const id = result.productIds[p.productNumber];
      if (id) {
        productNameById[id] = p.name;
        if (typeof p.listPrice === "number" && p.listPrice > 0) {
          productPriceById[id] = p.listPrice;
        }
      }
    }
    // Target-Closed WOs are currently Open while we attach children, so
    // every WO accepts product lines. The line status (Estimated vs Used)
    // is keyed off targetStatus so closed WOs end up with "Used" lines.
    const productsWoMeta = woMeta;
    onProgress({
      step: "WO Products",
      done: 0,
      total: productsWoMeta.length,
    });
    for (let i = 0; i < productsWoMeta.length; i++) {
      const { woId, targetStatus } = productsWoMeta[i];
      if (postedWoIds.has(woId)) {
        onProgress({
          step: "WO Products",
          done: i + 1,
          total: productsWoMeta.length,
          detail: "Skipped (WO is Posted)",
        });
        continue;
      }
      const linesForThisWo = 1 + (i % 3); // 1, 2, or 3
      // Closed (target=690970004) → Used (690970001). Anything else → Estimated.
      const lineStatus = targetStatus === 690970004 ? 690970001 : 690970000;
      // FS rejects two product lines on the same WO with the same
      // msdyn_lineorder. Earlier seeder versions wrote lineorder 1..N
      // and didn't clean up on partial failure, so on re-runs new
      // names collided with old line orders. Compute the next free
      // line order from what's already on the WO.
      const existingOrders = await dv.query<{ msdyn_lineorder: number }>(
        "msdyn_workorderproducts",
        {
          filter: `_msdyn_workorder_value eq ${woId}`,
          select: ["msdyn_lineorder"],
          top: 50,
        },
      );
      let nextLineOrder =
        existingOrders.reduce(
          (m, r) => Math.max(m, r.msdyn_lineorder ?? 0),
          0,
        ) + 1;
      for (let j = 0; j < linesForThisWo; j++) {
        const productId = productIdList[(i + j) % productIdList.length];
        const lineName = productNameById[productId] ?? `WO part ${j + 1}`;

        const existing = await dv.query<{ msdyn_workorderproductid: string }>(
          "msdyn_workorderproducts",
          {
            filter: `msdyn_name eq '${oencode(lineName)}' and _msdyn_workorder_value eq ${woId}`,
            select: ["msdyn_workorderproductid"],
            top: 1,
          },
        );
        if (existing[0]) continue;

        const estQty = 1 + (j % 2);
        const usedQty = lineStatus === 690970001 ? estQty : 0;
        const unitPrice = productPriceById[productId] ?? 0;
        const isClosed = lineStatus === 690970001;
        const payload: Record<string, unknown> = {
          msdyn_name: lineName,
          msdyn_description: tag(),
          msdyn_linestatus: lineStatus,
          msdyn_estimatequantity: estQty,
          msdyn_quantity: usedQty,
          msdyn_lineorder: nextLineOrder,
          "msdyn_workorder@odata.bind": `/msdyn_workorders(${woId})`,
          "msdyn_product@odata.bind": `/products(${productId})`,
        };
        if (unitPrice > 0) {
          payload.msdyn_estimateunitamount = unitPrice;
          payload.msdyn_estimatesubtotal = unitPrice * estQty;
          if (isClosed) {
            payload.msdyn_unitamount = unitPrice;
            payload.msdyn_subtotal = unitPrice * usedQty;
            payload.msdyn_totalamount = unitPrice * usedQty;
          }
        }

        const lineRes = await safeCreate(
          dv,
          "msdyn_workorderproducts",
          payload,
          makeSafeCtx(result, "workOrderProducts", "WO Products", lineName),
        );
        if (!lineRes.ok) {
          if (lineRes.skipped.reason === "posted-wo") {
            postedWoIds.add(woId);
            break; // WO got Posted mid-flight — skip remaining lines
          }
          continue;
        }
        nextLineOrder++;
        trackCreated(result, "workOrderProducts", lineRes.id);
        setLabel(result, "workOrderProducts", lineRes.id, lineName);
      }
      onProgress({
        step: "WO Products",
        done: i + 1,
        total: productsWoMeta.length,
      });
    }
  }

  // ── Time Entries (Phase 4) ──────────────────────────────────────────────
  // One Time Entry per booking spanning its full window, type=Work,
  // entrystatus=Submitted. This populates the resource's timesheet view.
  const skipTimeEntries =
    (options.timeEntries?.mode ?? "create") !== "create";
  if (!skipTimeEntries && bookingMeta.length > 0) {
    onProgress({
      step: "Time Entries",
      done: 0,
      total: bookingMeta.length,
    });
    for (let i = 0; i < bookingMeta.length; i++) {
      const { bookingId, woId, resourceId, start, end } = bookingMeta[i];
      const durationMinutes = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 60000),
      );
      const entryName = tag(`Time entry for booking ${i + 1}`);

      const existing = await dv.query<{
        msdyn_timeentryid: string;
        _msdyn_bookableresourcebooking_value?: string | null;
        _msdyn_workorder_value?: string | null;
      }>("msdyn_timeentries", {
        filter: `msdyn_description eq '${oencode(entryName)}'`,
        select: [
          "msdyn_timeentryid",
          "_msdyn_bookableresourcebooking_value",
          "_msdyn_workorder_value",
        ],
        top: 1,
      });
      if (existing[0]) {
        // Heal orphan time entries created by earlier versions
        // (v1.20.12–14) which had no booking/WO link due to a casing
        // bug. PATCH whichever links are missing.
        const existingBookingId = existing[0]._msdyn_bookableresourcebooking_value;
        const existingWoId = existing[0]._msdyn_workorder_value;
        const patch: Record<string, string> = {};
        if (existingBookingId !== bookingId) {
          patch["msdyn_BookableResourceBooking@odata.bind"] = `/bookableresourcebookings(${bookingId})`;
        }
        if (existingWoId !== woId) {
          patch["msdyn_WorkOrder@odata.bind"] = `/msdyn_workorders(${woId})`;
        }
        if (Object.keys(patch).length > 0) {
          // safeUpdate so a heal failure (e.g. someone hand-edited the
          // existing time entry into a Posted state) records a skip
          // instead of aborting the whole phase mid-demo.
          await safeUpdate(
            dv,
            "msdyn_timeentries",
            existing[0].msdyn_timeentryid,
            patch,
            makeSafeCtx(
              result,
              "timeEntries",
              "Time Entries",
              `Heal ${entryName}`,
            ),
          );
        }
        trackCreated(result, "timeEntries", existing[0].msdyn_timeentryid);
        const woNumber = result.labels?.workOrders?.[woId];
        const label = woNumber
          ? `${woNumber} — ${start.toLocaleDateString()}`
          : `Time entry ${i + 1}`;
        setLabel(result, "timeEntries", existing[0].msdyn_timeentryid, label);
        onProgress({
          step: "Time Entries",
          done: i + 1,
          total: bookingMeta.length,
        });
        continue;
      }

      const teRes = await safeCreate(
        dv,
        "msdyn_timeentries",
        {
          msdyn_description: entryName,
          msdyn_start: start.toISOString(),
          msdyn_end: end.toISOString(),
          msdyn_duration: durationMinutes,
          // 192350000 = Work
          msdyn_type: 192350000,
          // 192350000 = Submitted
          msdyn_entrystatus: 192350000,
          "msdyn_bookableresource@odata.bind": `/bookableresources(${resourceId})`,
          // Dataverse OData navigation property names are case
          // sensitive. The *lookup column* is msdyn_bookableresourcebooking
          // (lowercase), but the *navigation property* used in
          // @odata.bind is PascalCase: msdyn_BookableResourceBooking.
          // Earlier lowercase attempts produced "undeclared property"
          // 400s. Same applies to the work order link
          // (msdyn_WorkOrder). The "All Time Entries (Field Service)"
          // view filters by Work Order, so without this bind the
          // entries are invisible in FS even though they exist.
          "msdyn_BookableResourceBooking@odata.bind": `/bookableresourcebookings(${bookingId})`,
          "msdyn_WorkOrder@odata.bind": `/msdyn_workorders(${woId})`,
        },
        makeSafeCtx(result, "timeEntries", "Time Entries", entryName),
      );
      if (!teRes.ok) {
        if (teRes.skipped.reason === "posted-wo") postedWoIds.add(woId);
        // Skip recorded; advance progress.
        onProgress({
          step: "Time Entries",
          done: i + 1,
          total: bookingMeta.length,
          detail: `Skipped (${teRes.skipped.reason})`,
        });
        continue;
      }
      trackCreated(result, "timeEntries", teRes.id);
      const woNumber = result.labels?.workOrders?.[woId];
      const label = woNumber
        ? `${woNumber} — ${start.toLocaleDateString()}`
        : `Time entry ${i + 1}`;
      setLabel(result, "timeEntries", teRes.id, label);
      onProgress({
        step: "Time Entries",
        done: i + 1,
        total: bookingMeta.length,
      });
    }
  }

  // ── Close Work Orders (Phase 5) ─────────────────────────────────────────
  // Transition target-Closed WOs from Open-Unscheduled → Closed-Posted now
  // that all child rows (tasks, products, booking, time entry) are
  // attached. Also fill in resolution + actual service duration so the
  // WO form has populated content (Summary card, Resolution, totals).
  const closeTargets = woMeta.filter((m) => m.targetStatus === 690970004);
  if (closeTargets.length > 0) {
    onProgress({
      step: "Close Work Orders",
      done: 0,
      total: closeTargets.length,
    });
    // Build {woId → booking duration in minutes} so each closed WO can
    // record an actual service duration that matches its booking.
    const bookingDurationByWo: Record<string, number> = {};
    for (const b of bookingMeta) {
      bookingDurationByWo[b.woId] = Math.max(
        1,
        Math.round((b.end.getTime() - b.start.getTime()) / 60000),
      );
    }
    // Resolution snippets that vary with the closed WO so they don't all
    // read identically in the demo.
    const resolutionTemplates = [
      "Service completed. Equipment back in spec; verified readings within tolerance.",
      "Replaced faulty component; system tested under load and returned to service.",
      "Cleaned, calibrated, and signed-off with site contact. No follow-up required.",
      "Root cause identified and corrected. Customer notified; PM scheduled at next interval.",
      "Repaired on-site; spare parts left in customer stock for next cycle.",
      "Performed lockout/tagout, replaced module, and restored service. Site contact acknowledged.",
    ];
    for (let i = 0; i < closeTargets.length; i++) {
      const { woId } = closeTargets[i];
      const durationMin = bookingDurationByWo[woId] ?? 120;
      const resolution = tag(
        resolutionTemplates[i % resolutionTemplates.length],
      );
      // Field names vary by FS version. We try the richest payload
      // first, then fall back to progressively smaller ones, then
      // finally just the status flip. This way a missing column on
      // this org doesn't block the close — it just means less rich
      // form content.
      const woNumber = result.labels?.workOrders?.[woId];
      const attempts: Array<{ label: string; payload: Record<string, unknown> }> = [
        {
          label: "resolution + actuals + status",
          payload: {
            msdyn_resolution: resolution,
            msdyn_actualserviceduration: durationMin,
            msdyn_systemstatus: 690970004,
          },
        },
        {
          label: "resolution + status",
          payload: {
            msdyn_resolution: resolution,
            msdyn_systemstatus: 690970004,
          },
        },
        {
          label: "status only",
          payload: { msdyn_systemstatus: 690970004 },
        },
      ];
      let closed = false;
      let lastSkipReason: string | null = null;
      for (const a of attempts) {
        // Use safeUpdate so a target-specific FS validation error
        // records a skip rather than throwing. We try richest payload
        // first, then progressively smaller ones — first successful
        // update wins. If ALL attempts skip (e.g. plugin refuses the
        // status flip because of bookings drift), the WO simply stays
        // Open in the demo. Better than a mid-demo abort.
        const upRes = await safeUpdate(
          dv,
          "msdyn_workorders",
          woId,
          a.payload,
          makeSafeCtx(
            result,
            "workOrders",
            "Close Work Orders",
            woNumber ? `${woNumber} (${a.label})` : `Close ${a.label}`,
          ),
        );
        if (upRes.ok) {
          closed = true;
          onProgress({
            step: "Close Work Orders",
            done: i + 1,
            total: closeTargets.length,
            detail: woNumber
              ? `${woNumber} \u2192 Posted (${a.label})`
              : `Posted (${a.label})`,
          });
          break;
        }
        lastSkipReason = upRes.skipped.reason;
      }
      if (!closed) {
        // All attempts skipped — record visible progress so the user
        // sees which WOs ended the run still Open.
        postedWoIds.add(woId);
        onProgress({
          step: "Close Work Orders",
          done: i + 1,
          total: closeTargets.length,
          detail: woNumber
            ? `${woNumber} (left Open: ${lastSkipReason ?? "unknown"})`
            : `Left Open (${lastSkipReason ?? "unknown"})`,
        });
      }
    }
  }

  // ── IoT Alerts (Phase 6) ────────────────────────────────────────────────
  // Mock alerts per customer asset so the FS Connected Field Service views
  // have data. Severities: 192350000=Info, 192350001=Warning, 192350002=Critical.
  // Status: 192350000=Active (most), 192350001=InProgress (some), 192350002=Closed (few).
  const iotAlertTemplates = [
    { severity: 192350002, message: "Compressor outlet pressure exceeded threshold (PSI > 175)" },
    { severity: 192350001, message: "Filter pressure differential rising — service due soon" },
    { severity: 192350000, message: "Routine telemetry checkpoint received" },
    { severity: 192350001, message: "Vibration above nominal — recommend inspection" },
    { severity: 192350002, message: "Temperature alarm: unit exceeded 85°C for >5 min" },
  ];
  const accountsWithAssets = Object.entries(assetsByAccount).filter(
    ([, ids]) => ids.length > 0,
  );
  const skipIotAlerts = (options.iotAlerts?.mode ?? "create") !== "create";
  if (!skipIotAlerts && accountsWithAssets.length > 0) {
    let totalAlerts = 0;
    for (const [, assetIds] of accountsWithAssets) {
      totalAlerts += assetIds.length; // 1 alert per asset
    }
    onProgress({ step: "IoT Alerts", done: 0, total: totalAlerts });
    let done = 0;
    let templateIdx = 0;
    for (const [accountId, assetIds] of accountsWithAssets) {
      for (let i = 0; i < assetIds.length; i++) {
        const assetId = assetIds[i];
        const template = iotAlertTemplates[templateIdx % iotAlertTemplates.length];
        templateIdx++;

        const alertTime = new Date();
        alertTime.setHours(alertTime.getHours() - (done * 3 + 1));
        const alertToken = `${DEMO_TAG}-IOT-${accountId.slice(0, 6)}-${i}`;
        const description = tag(template.message);

        const existing = await dv.query<{ msdyn_iotalertid: string }>(
          "msdyn_iotalerts",
          {
            filter: `msdyn_alerttoken eq '${oencode(alertToken)}'`,
            select: ["msdyn_iotalertid"],
            top: 1,
          },
        );
        const labelText =
          template.message.length > 60
            ? template.message.slice(0, 57) + "…"
            : template.message;
        if (existing[0]) {
          // Already created by an earlier run — still track it so it
          // appears in the run summary instead of silently dropping
          // off the dashboard.
          trackCreated(result, "iotAlerts", existing[0].msdyn_iotalertid);
          setLabel(result, "iotAlerts", existing[0].msdyn_iotalertid, labelText);
        } else {
          // safeCreate so a tenant-specific FS validation rule (e.g.
          // some orgs require msdyn_severity even though our $metadata
          // probe says it's optional) records a skip instead of
          // aborting the entire IoT Alerts phase.
          const alertRes = await safeCreate(
            dv,
            "msdyn_iotalerts",
            {
              msdyn_description: description,
              msdyn_alerttoken: alertToken,
              msdyn_alerttime: alertTime.toISOString(),
              msdyn_alertdata: JSON.stringify({
                source: "DEMO-FS",
                severity: template.severity,
                message: template.message,
              }),
              // Neither msdyn_severity nor msdyn_iotalertstatus exist
              // on msdyn_iotalert in this org's schema (Invalid
              // property errors). Severity stays in msdyn_alertdata
              // JSON; alert status is left at the platform default.
              // msdyn_iotalert has no Account lookup — relationship is
              // resolved via msdyn_CustomerAsset → msdyn_account. Verified via $metadata.
              "msdyn_CustomerAsset@odata.bind": `/msdyn_customerassets(${assetId})`,
            },
            makeSafeCtx(result, "iotAlerts", "IoT Alerts", labelText),
          );
          if (alertRes.ok) {
            trackCreated(result, "iotAlerts", alertRes.id);
            setLabel(result, "iotAlerts", alertRes.id, labelText);
          }
        }
        done++;
        onProgress({ step: "IoT Alerts", done, total: totalAlerts });
      }
    }
  }

  return result;
  } catch (err) {
    // Attach the partial result so the UI can record what was created
    // before the failure (so users can clean it up from the Reset page).
    if (err instanceof CancelledError) {
      result.cancelled = true;
    }
    (err as { partialResult?: SeedResult }).partialResult = result;
    throw err;
  }
}

/**
 * Reset: find every record we tagged with DEMO_TAG and delete them.
 * Order matters — children before parents to avoid FK errors.
 */
export async function resetDemoData(
  dv: DataverseClient,
  onProgress: ProgressFn,
): Promise<{ deletedByEntity: Record<string, number> }> {
  const deleted: Record<string, number> = {};
  const tagFilter = (field: string) =>
    `startswith(${field},'${oencode(DEMO_TAG)}')`;

  const sweep = async (
    label: string,
    entitySet: string,
    idField: string,
    descField: string,
  ): Promise<void> => {
    const rows = await dv.query<Record<string, string>>(entitySet, {
      filter: tagFilter(descField),
      select: [idField],
      top: 5000,
    });
    onProgress({ step: label, done: 0, total: rows.length });
    for (let i = 0; i < rows.length; i++) {
      try {
        await dv.delete(entitySet, rows[i][idField]);
      } catch {
        /* swallow individual failures — keep going */
      }
      onProgress({ step: label, done: i + 1, total: rows.length });
    }
    deleted[entitySet] = rows.length;
  };

  // Children → parents:
  // Bookings reference both the WO and the Resource — delete first.
  await sweep(
    "Bookings",
    "bookableresourcebookings",
    "bookableresourcebookingid",
    "name",
  );
  // Phase 2 — WO Service Tasks reference WOs, must go before WO sweep.
  await sweep(
    "WO Service Tasks",
    "msdyn_workorderservicetasks",
    "msdyn_workorderservicetaskid",
    "msdyn_description",
  );
  // Phase 4 — WO execution detail (products + time entries) — reference WOs.
  await sweep(
    "WO Products",
    "msdyn_workorderproducts",
    "msdyn_workorderproductid",
    "msdyn_description",
  );
  await sweep(
    "Time Entries",
    "msdyn_timeentries",
    "msdyn_timeentryid",
    "msdyn_description",
  );
  // Work-order-level associations next.
  await sweep(
    "Work Orders",
    "msdyn_workorders",
    "msdyn_workorderid",
    "msdyn_workordersummary",
  );
  // Phase 2 — assets / locations / task-type catalog (WOs referenced these).
  // Phase 6 IoT alerts reference assets, must go first.
  await sweep(
    "IoT Alerts",
    "msdyn_iotalerts",
    "msdyn_iotalertid",
    "msdyn_description",
  );
  await sweep(
    "Customer Assets",
    "msdyn_customerassets",
    "msdyn_customerassetid",
    "msdyn_description",
  );
  await sweep(
    "Functional Locations",
    "msdyn_functionallocations",
    "msdyn_functionallocationid",
    "msdyn_description",
  );
  await sweep(
    "Service Task Types",
    "msdyn_servicetasktypes",
    "msdyn_servicetasktypeid",
    "msdyn_description",
  );
  // Phase 3 — agreement subtree (child-first). All depend on accounts.
  await sweep(
    "Agreement Booking Incidents",
    "msdyn_agreementbookingincidents",
    "msdyn_agreementbookingincidentid",
    "msdyn_description",
  );
  await sweep(
    "Agreement Booking Products",
    "msdyn_agreementbookingproducts",
    "msdyn_agreementbookingproductid",
    "msdyn_description",
  );
  await sweep(
    "Agreement Booking Services",
    "msdyn_agreementbookingservices",
    "msdyn_agreementbookingserviceid",
    "msdyn_description",
  );
  await sweep(
    "Agreement Booking Setups",
    "msdyn_agreementbookingsetups",
    "msdyn_agreementbookingsetupid",
    "msdyn_description",
  );
  await sweep(
    "Agreements",
    "msdyn_agreements",
    "msdyn_agreementid",
    "msdyn_description",
  );
  // Phase 5 — Product Inventory before Warehouses (FK).
  await sweep(
    "Product Inventory",
    "msdyn_productinventories",
    "msdyn_productinventoryid",
    "msdyn_description",
  );
  await sweep(
    "Warehouses",
    "msdyn_warehouses",
    "msdyn_warehouseid",
    "msdyn_description",
  );
  // Resource-level associations next.
  await sweep(
    "Resource Territories",
    "msdyn_resourceterritories",
    "msdyn_resourceterritoryid",
    "msdyn_description",
  );
  // bookableresourcecharacteristic has no description field of its own —
  // it goes away when the parent resource is deleted (cascade).
  await sweep(
    "Bookable Resources",
    "bookableresources",
    "bookableresourceid",
    "description",
  );
  await sweep(
    "Service Tasks",
    "msdyn_incidenttypeservicetasks",
    "msdyn_incidenttypeservicetaskid",
    "msdyn_description",
  );
  await sweep(
    "Incident Types",
    "msdyn_incidenttypes",
    "msdyn_incidenttypeid",
    "msdyn_description",
  );
  await sweep(
    "WO Types",
    "msdyn_workordertypes",
    "msdyn_workordertypeid",
    "msdyn_description",
  );
  await sweep(
    "Characteristics",
    "characteristics",
    "characteristicid",
    "description",
  );
  await sweep("Products", "products", "productid", "description");
  await sweep("Accounts", "accounts", "accountid", "description");
  await sweep("Territories", "territories", "territoryid", "description");

  return { deletedByEntity: deleted };
}

/**
 * Delete a single seed run by exact id. Skips bookable resources that look
 * like pre-existing org records (we shouldn't delete those when the user
 * picked the "use existing" mode). A resource is considered "demo-created"
 * only if its description still starts with the DEMO_TAG.
 */
export async function deleteRun(
  dv: DataverseClient,
  result: SeedResult,
  onProgress: ProgressFn,
  options: { selectedSectionTitles?: Set<string> } = {},
): Promise<{ deletedByEntity: Record<string, number>; deletedIdsByKey: Record<string, string[]> }> {
  const deleted: Record<string, number> = {};
  const deletedIdsByKey: Record<string, string[]> = {};
  const selected = options.selectedSectionTitles;
  const isSelected = (sectionTitle: string): boolean =>
    !selected || selected.has(sectionTitle);

  const sweepIds = async (
    label: string,
    sectionTitle: string,
    entitySet: string,
    ids: string[],
    resultKey?: string,
  ): Promise<void> => {
    if (ids.length === 0) return;
    if (!isSelected(sectionTitle)) return;
    onProgress({ step: label, done: 0, total: ids.length });
    let count = 0;
    const successIds: string[] = [];
    for (let i = 0; i < ids.length; i++) {
      try {
        await dv.delete(entitySet, ids[i]);
        successIds.push(ids[i]);
        count++;
      } catch {
        /* swallow individual failures — record may already be gone */
      }
      onProgress({ step: label, done: i + 1, total: ids.length });
    }
    deleted[entitySet] = (deleted[entitySet] ?? 0) + count;
    if (resultKey) deletedIdsByKey[resultKey] = successIds;
  };

  // Children → parents.
  await sweepIds("Bookings", "Bookings", "bookableresourcebookings", result.bookingIds, "bookings");

  // Phase 2 entries that reference WOs (e.g. WO Service Tasks) — must be
  // deleted before the WOs themselves.
  const handled = new Set<string>();
  if (result.createdIds) {
    for (const entry of phase2EntityOrder.filter((e) => e.phase === "beforeWo")) {
      const ids = result.createdIds[entry.key];
      if (ids?.length) {
        await sweepIds(entry.label, entry.label, entry.entitySet, ids, entry.key);
        handled.add(entry.key);
      }
    }
  }

  await sweepIds("Work Orders", "Work Orders", "msdyn_workorders", result.workOrderIds, "workOrders");

  // Phase 2 entries that WOs reference (assets, locations, task types) — safe
  // to delete now that WOs are gone.
  if (result.createdIds) {
    for (const entry of phase2EntityOrder.filter((e) => e.phase === "afterWo")) {
      const ids = result.createdIds[entry.key];
      if (ids?.length) {
        // Agreement booking sub-rows + auto-created price lists don't appear
        // as their own picker section — they ride along with "Agreements".
        const sectionTitle =
          entry.key === "agreementBookingIncidents" ||
          entry.key === "agreementBookingProducts" ||
          entry.key === "agreementBookingServices" ||
          entry.key === "agreementBookingSetups" ||
          entry.key === "priceLists"
            ? "Agreements"
            : entry.label;
        await sweepIds(entry.label, sectionTitle, entry.entitySet, ids, entry.key);
        handled.add(entry.key);
      }
    }
    for (const [key, ids] of Object.entries(result.createdIds)) {
      if (handled.has(key)) continue;
      if (!ids?.length) continue;
      // Some keys (e.g. technicianContacts) are swept later via dedicated
      // sweepIds calls below (with their own resultKey). Skip warning for
      // those.
      if (KEYS_HANDLED_BY_DEDICATED_SWEEP.has(key)) continue;
      // Unknown key — caller forgot to register it; we don't know the
      // entitySet so skip rather than guess. Logged via progress for
      // visibility.
      onProgress({
        step: `Skipped unknown entity "${key}"`,
        done: 0,
        total: 0,
        detail: `${ids.length} record(s) — register in phase2EntityOrder to clean up`,
      });
    }
  }

  // Bookable resources: only delete the ones we created. v1.6+ runs track
  // these explicitly in `createdResourceIds`. For older v1.5 history entries
  // the field is missing — fall back to checking the legacy `DEMO-FS:`
  // description prefix so those runs can still be cleaned up safely.
  let ourResourceIds: string[] = [];
  if (Array.isArray(result.createdResourceIds)) {
    ourResourceIds = result.createdResourceIds;
  } else {
    const legacyIds = Object.values(result.resourceIds);
    for (const rid of legacyIds) {
      try {
        const row = await dv.retrieve<{ description?: string }>(
          "bookableresources",
          rid,
          ["description"],
        );
        if (row?.description?.startsWith(`${DEMO_TAG}:`)) {
          ourResourceIds.push(rid);
        }
      } catch {
        /* skip — record probably already deleted */
      }
    }
  }
  await sweepIds("Bookable Resources", "Bookable Resources", "bookableresources", ourResourceIds, "createdResourceIds");
  await sweepIds(
    "Technician Contacts",
    "Technician Contacts",
    "contacts",
    Object.values(result.idMaps?.technicianContacts ?? {}),
    "technicianContacts",
  );

  await sweepIds(
    "Incident Types",
    "Incident Types",
    "msdyn_incidenttypes",
    Object.values(result.incidentTypeIds),
    "incidentTypes",
  );
  await sweepIds(
    "Work Order Types",
    "Work Order Types",
    "msdyn_workordertypes",
    Object.values(result.workOrderTypeIds),
    "workOrderTypes",
  );
  await sweepIds(
    "Characteristics",
    "Characteristics",
    "characteristics",
    Object.values(result.characteristicIds),
    "characteristics",
  );
  await sweepIds("Products", "Products", "products", Object.values(result.productIds), "products");
  await sweepIds("Accounts", "Accounts", "accounts", Object.values(result.accountIds), "accounts");
  await sweepIds(
    "Territories",
    "Territories",
    "territories",
    Object.values(result.territoryIds),
    "territories",
  );

  return { deletedByEntity: deleted, deletedIdsByKey };
}

/**
 * Section-title parent → children dependency map for partial deletes.
 * If the user picks a parent, all listed children are also implicitly picked
 * (transitively closed by the UI). Order in this object doesn't matter.
 */
export const SECTION_DEPENDENCIES: Record<string, string[]> = {
  Accounts: [
    "Work Orders",
    "Customer Assets",
    "Functional Locations",
    "Agreements",
  ],
  "Work Orders": ["Bookings", "WO Service Tasks", "WO Products", "Time Entries"],
  "Customer Assets": ["IoT Alerts"],
  "Bookable Resources": ["Bookings", "Time Entries"],
  "Technician Contacts": ["Bookable Resources"],
  Products: ["WO Products", "Product Inventory", "Incident Type Products"],
  Warehouses: ["Product Inventory"],
  "Incident Types": ["Incident Type Products", "Work Orders"],
  "Service Task Types": ["WO Service Tasks"],
  "Work Order Types": ["Work Orders"],
  Territories: ["Bookable Resources", "Work Orders"],
  Characteristics: ["Bookable Resources"],
};

/** Expand a user selection to include all transitive children. */
export function expandSelection(picked: Iterable<string>): Set<string> {
  const out = new Set<string>();
  const stack = [...picked];
  while (stack.length) {
    const t = stack.pop()!;
    if (out.has(t)) continue;
    out.add(t);
    for (const c of SECTION_DEPENDENCIES[t] ?? []) stack.push(c);
  }
  return out;
}

/**
 * Apply the result of a successful partial delete back onto a SeedResult so
 * the run history record reflects what's left in Dataverse. Mutates in place.
 */
export function pruneDeletedFromResult(
  result: SeedResult,
  deletedIdsByKey: Record<string, string[]>,
): SeedResult {
  const removeFromArray = (arr: string[] | undefined, ids: string[]) =>
    arr?.filter((id) => !new Set(ids).has(id)) ?? [];
  const removeFromMap = (map: Record<string, string> | undefined, ids: string[]) => {
    if (!map) return {};
    const drop = new Set(ids);
    return Object.fromEntries(Object.entries(map).filter(([, v]) => !drop.has(v)));
  };
  for (const [key, ids] of Object.entries(deletedIdsByKey)) {
    if (!ids?.length) continue;
    switch (key) {
      case "bookings":
        result.bookingIds = removeFromArray(result.bookingIds, ids);
        break;
      case "workOrders":
        result.workOrderIds = removeFromArray(result.workOrderIds, ids);
        break;
      case "createdResourceIds":
        result.createdResourceIds = removeFromArray(result.createdResourceIds, ids);
        result.resourceIds = removeFromMap(result.resourceIds, ids);
        break;
      case "incidentTypes":
        result.incidentTypeIds = removeFromMap(result.incidentTypeIds, ids);
        break;
      case "workOrderTypes":
        result.workOrderTypeIds = removeFromMap(result.workOrderTypeIds, ids);
        break;
      case "characteristics":
        result.characteristicIds = removeFromMap(result.characteristicIds, ids);
        break;
      case "products":
        result.productIds = removeFromMap(result.productIds, ids);
        break;
      case "accounts":
        result.accountIds = removeFromMap(result.accountIds, ids);
        break;
      case "territories":
        result.territoryIds = removeFromMap(result.territoryIds, ids);
        break;
      default: {
        // Phase 2 entries live under createdIds[key] / idMaps[key].
        if (result.createdIds?.[key]) {
          result.createdIds[key] = removeFromArray(result.createdIds[key], ids);
        }
        if (result.idMaps?.[key]) {
          result.idMaps[key] = removeFromMap(result.idMaps[key], ids);
        }
      }
    }
    // Also drop labels for removed ids.
    if (result.labels?.[key]) {
      for (const id of ids) delete result.labels[key][id];
    }
  }
  return result;
}
