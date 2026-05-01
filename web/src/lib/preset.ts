/**
 * Field Service preset shape — what AI returns from analyzing a customer URL.
 * This is the same conceptual shape as fsloader's vertical presets, just expressed in TS.
 */

export type FsVertical =
  | "hvac"
  | "electrical"
  | "plumbing"
  | "fire_safety"
  | "elevator"
  | "telecom"
  | "industrial"
  | "facilities"
  | "medical_equipment"
  | "restaurant"
  | "utilities"
  | "solar"
  | "retail_tech"
  | "pest_control"
  | "construction"
  | "pool_spa"
  | "generic";

export interface FsPreset {
  vertical: FsVertical;
  companyName: string;
  companyDescription: string;
  /** Geographic territories (regions/zones). 3–8 items recommended. */
  territories: Array<{ name: string; code: string; description?: string }>;
  /** Work order types (e.g., Maintenance, Repair, Installation, Inspection). */
  workOrderTypes: Array<{ name: string; code: string; description?: string }>;
  /** Incident types — the catalog of "what's wrong" categories. */
  incidentTypes: Array<{
    name: string;
    description: string;
    estimatedDurationMinutes: number;
    serviceTasks: string[];
  }>;
  /** Resource characteristics / skills (e.g., EPA 608 Universal, OSHA-30). */
  characteristics: Array<{ name: string; description?: string }>;
  /** Sample products / parts the field crew installs/uses. */
  products: Array<{
    name: string;
    productNumber: string;
    description?: string;
    listPrice?: number;
  }>;
  /** Sample customer accounts the field crew services. */
  sampleAccounts: Array<{
    name: string;
    city?: string;
    state?: string;
    /** Free-form site description — surfaces on the WO. */
    siteDescription?: string;
  }>;
  /** Sample technicians (created as Equipment-type bookable resources to avoid needing admin). */
  sampleTechnicians: Array<{
    name: string;
    /** Must match one of the characteristics[].name above. */
    primarySkill: string;
    /** Must match one of the territories[].code above. */
    primaryTerritoryCode: string;
    /**
     * Working days of the week as RFC-5545 BYDAY tokens
     * (MO/TU/WE/TH/FR/SA/SU). Defaults to Mon–Fri when absent.
     * Empty array = resource has no working hours (will be skipped by
     * the Work Hours phase). Used by the seeder to build the
     * `RecurrencePattern` passed to the FS `msdyn_SaveCalendar` action.
     */
    workDays?: string[];
    /** Hour of day (0–23) the working window starts. Defaults to 8. */
    workStartHour?: number;
    /** Hour of day (0–24) the working window ends. Defaults to 17. */
    workEndHour?: number;
    /**
     * Windows time-zone code used by `msdyn_SaveCalendar`. Defaults to 4
     * (Pacific Time, US & Canada). Common codes:
     *   4=Pacific, 10=Mountain, 15=Arizona, 20=Central, 35=Eastern,
     *   85=London, 110=Berlin, 145=Moscow, 92=UTC.
     */
    timeZoneCode?: number;
    /**
     * v1.42.0 — Additional skills beyond the headline `primarySkill`.
     * Each entry creates one `bookableresourcecharacteristic` row linking
     * the resource to the matching characteristic; `rating` (1–5, where
     * 5 = Expert) is mapped to a Field Service `ratingvalue` lookup at
     * seed time using whatever rating model the org has configured.
     * Optional — older presets that only carry `primarySkill` keep
     * their single-skill behavior.
     */
    skills?: Array<{
      /** Must match one of the characteristics[].name above. */
      name: string;
      /**
       * 1–5 proficiency level. 1 = Familiar / Trainee, 5 = Expert.
       * Mapped to the org's `ratingvalue.value` column; if no value
       * matches, the characteristic is still linked but without a
       * rating (matches FS UI behavior of "untyped" skills).
       */
      rating?: number;
    }>;
    /**
     * v1.42.1 — Per-resource time off (PTO / vacation). Each entry adds
     * one `WorkHourType:3` rule to the resource's calendar via the same
     * `msdyn_SaveCalendar` action that emits working hours, so the
     * Schedule Assistant honors the absence. Optional — older presets
     * keep their full work-week schedule.
     *
     * `start` and `end` are ISO date strings (YYYY-MM-DD), inclusive.
     * `reason` is metadata for the UI only — FS doesn't have a
     * structured field for it.
     */
    timeOff?: Array<{ start: string; end: string; reason?: string }>;
  }>;
  /**
   * Phase 2 — Functional location tree per account. Optional; older presets
   * without this section just skip the Functional Locations step.
   *
   * `parentName` references another node's `name` within the same array, or is
   * undefined for the root of an account's tree.
   * `accountName` references one of the `sampleAccounts[].name` above.
   */
  functionalLocations?: Array<{
    name: string;
    accountName: string;
    parentName?: string;
    description?: string;
  }>;
  /**
   * Phase 2 — Customer assets owned by accounts, optionally hung off a
   * functional location and a product (asset → product gives the asset its
   * model/SKU). 5–10 per top-N accounts is plenty for demos.
   */
  customerAssets?: Array<{
    name: string;
    accountName: string;
    /** Optional — must match a functionalLocations[].name. */
    functionalLocationName?: string;
    /** Optional — must match a products[].productNumber. */
    productNumber?: string;
    /** Optional — references another customerAssets[].name for hierarchy. */
    parentAssetName?: string;
    serialNumber?: string;
    description?: string;
  }>;
  /**
   * Phase 2 — Reusable service-task catalog. Each Closed/Scheduled WO gets
   * 2–4 of these attached as msdyn_workorderservicetask rows so demos have
   * checklist data. 5–10 entries is enough.
   */
  serviceTaskTypes?: Array<{
    name: string;
    description?: string;
    estimatedDurationMinutes?: number;
  }>;
  /**
   * Phase 3 — Service agreements (recurring contracts). Each agreement gets a
   * booking-setup with a recurrence pattern, plus one or two covered
   * incident-types and product lines. We create them in **Estimate** status
   * (192350000) so the server-side recurrence engine doesn't auto-spawn WOs
   * during the demo run — the presenter can flip them to Active manually.
   */
  agreements?: Array<{
    name: string;
    accountName: string;
    /** ISO date YYYY-MM-DD. */
    startOn: string;
    /** ISO date YYYY-MM-DD. */
    endOn: string;
    /** RFC 5545-ish recurrence: FREQ=MONTHLY|WEEKLY|DAILY[;INTERVAL=N]. */
    recurrencePattern: string;
    estimatedDurationMinutes?: number;
    /** Names from incidentTypes[].name. */
    coveredIncidentTypeNames?: string[];
    /** productNumbers from products[].productNumber. */
    coveredProductNumbers?: string[];
    description?: string;
  }>;
  /**
   * Phase 5 — Warehouses (parts depots / vans / customer-site stock). Each
   * warehouse + product combo gets a Product Inventory row with on-hand
   * quantity so the FS Inventory views aren't empty. 2–4 entries works well.
   */
  warehouses?: Array<{
    name: string;
    description?: string;
    /** Optional city/state for realism in the warehouse list. */
    city?: string;
    state?: string;
  }>;
  /** Reasoning the AI gave for picking this vertical — surfaced in review UI. */
  rationale: string;
}

const SYSTEM_PROMPT = `You are an expert in Microsoft Dynamics 365 Field Service who designs realistic demo data for prospective customers. Given information about a company, you propose a believable Field Service catalog tailored to their industry.

Constraints:
- Pick a single primary vertical from this list: hvac, electrical, plumbing, fire_safety, elevator, telecom, industrial, facilities, medical_equipment, generic.
- 3–8 territories (regions or service zones), each with a short uppercase code (e.g., "NE", "SOCAL").
- 4–6 work order types covering the customer's likely service mix.
- 6–10 incident types with realistic durations (15–480 minutes) and 2–5 service tasks each.
- 4–8 resource characteristics representing certifications, skills, or licenses common in this industry.
- 6–12 products/parts with realistic SKU-style productNumber and list prices in USD.
- 8–12 sample customer accounts (companies the field crew would service) with city/state matching the territories above.
- 6–10 sample technicians with realistic first+last names. Each technician's primarySkill must match one of the characteristics[].name above, and primaryTerritoryCode must match one of the territories[].code above.
- Phase 2 sections (functionalLocations, customerAssets, serviceTaskTypes) are required:
  - 8–12 functional locations distributed across the top 3–4 accounts as a 2-level tree (Building → Floor / Zone). parentName references another node within this list. accountName must match a sampleAccounts[].name.
  - 8–14 customer assets distributed across those accounts. Each asset has an industry-appropriate name (e.g. "RTU-A1-01" for HVAC, "Generator-DC-A" for telecom, "Elevator Bank North" for elevator). accountName must match a sampleAccounts[].name. functionalLocationName, when set, must match a functionalLocations[].name. productNumber, when set, must match a products[].productNumber. Add a unique serialNumber to each.
  - 6–10 reusable serviceTaskTypes covering safety, diagnostic, repair, verify, and sign-off steps. Realistic for the vertical.
- Phase 3 — agreements (REQUIRED, 2–4 entries):
  - Each agreement is a recurring service contract for ONE of the top 3 sampleAccounts. accountName must match a sampleAccounts[].name.
  - startOn must be 2026-01-01 or earlier. endOn must be one full year later.
  - recurrencePattern is a short RFC-5545 fragment, one of: "FREQ=MONTHLY", "FREQ=MONTHLY;INTERVAL=3", "FREQ=WEEKLY", "FREQ=DAILY;INTERVAL=14".
  - estimatedDurationMinutes between 60 and 240.
  - coveredIncidentTypeNames: 1–2 names from incidentTypes[] above.
  - coveredProductNumbers: 1–2 productNumbers from products[] above.
- Phase 5 — warehouses (REQUIRED, 2–4 entries):
  - Realistic depot or service-truck names. Include city/state matching one of the territories. e.g. "Main Parts Depot — Atlanta", "Service Van #12", "Northeast Regional Warehouse".
- All names must be realistic — never lorem ipsum, never "Sample".
- The rationale field should be 1–2 sentences explaining why this vertical fits the company.`;

const USER_TEMPLATE = (
  url: string,
  title: string,
  description: string,
  bodyText: string,
) => `Company URL: ${url}
Page title: ${title}
Meta description: ${description}

Page text excerpt:
${bodyText}

Generate a Field Service preset for this company as JSON matching exactly this shape:
{
  "vertical": "<one of: hvac|electrical|plumbing|fire_safety|elevator|telecom|industrial|facilities|medical_equipment|generic>",
  "companyName": "<string>",
  "companyDescription": "<1-2 sentence overview>",
  "territories": [{ "name": "<string>", "code": "<UPPERCASE>", "description": "<optional>" }],
  "workOrderTypes": [{ "name": "<string>", "code": "<UPPERCASE>", "description": "<optional>" }],
  "incidentTypes": [{ "name": "<string>", "description": "<string>", "estimatedDurationMinutes": <int>, "serviceTasks": ["<string>", ...] }],
  "characteristics": [{ "name": "<string>", "description": "<optional>" }],
  "products": [{ "name": "<string>", "productNumber": "<SKU>", "description": "<optional>", "listPrice": <number> }],
  "sampleAccounts": [{ "name": "<string>", "city": "<string>", "state": "<2-letter>", "siteDescription": "<optional>" }],
  "sampleTechnicians": [{ "name": "<First Last>", "primarySkill": "<must match a characteristics[].name>", "primaryTerritoryCode": "<must match a territories[].code>" }],
  "functionalLocations": [{ "name": "<string>", "accountName": "<must match a sampleAccounts[].name>", "parentName": "<optional, must match another functionalLocations[].name>", "description": "<optional>" }],
  "customerAssets": [{ "name": "<string>", "accountName": "<must match a sampleAccounts[].name>", "functionalLocationName": "<optional>", "productNumber": "<optional, must match a products[].productNumber>", "parentAssetName": "<optional>", "serialNumber": "<string>", "description": "<optional>" }],
  "serviceTaskTypes": [{ "name": "<string>", "description": "<optional>", "estimatedDurationMinutes": <int> }],
  "agreements": [{ "name": "<string>", "accountName": "<must match a sampleAccounts[].name>", "startOn": "YYYY-MM-DD", "endOn": "YYYY-MM-DD", "recurrencePattern": "FREQ=MONTHLY", "estimatedDurationMinutes": <int>, "coveredIncidentTypeNames": ["<must match incidentTypes[].name>"], "coveredProductNumbers": ["<must match products[].productNumber>"], "description": "<optional>" }],
  "warehouses": [{ "name": "<string>", "city": "<string>", "state": "<2-letter>", "description": "<optional>" }],
  "rationale": "<1-2 sentences>"
}`;

import { fetchWebsite, generateJson } from "./aoai";

// Client-side analyzer cache. The AOAI call is the slow part of the
// analyzer (15–60s); re-running for the same URL within a session should
// be instant. Keyed by normalized URL, 30-minute TTL, sessionStorage so
// it survives soft refreshes but doesn't leak across browser sessions.
const ANALYZE_CACHE_KEY = "fs-data-studio:analyze-cache:v1";
const ANALYZE_CACHE_TTL_MS = 30 * 60 * 1000;

interface AnalyzeCacheEntry {
  ts: number;
  preset: FsPreset;
}

function normalizeUrl(url: string): string {
  const trimmed = url.trim().toLowerCase();
  return /^https?:\/\//.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/** Cache key includes the model so different models keep separate analyses. */
function cacheKey(url: string, model?: string): string {
  return model ? `${normalizeUrl(url)}::${model}` : normalizeUrl(url);
}

function readAnalyzeCache(url: string, model?: string): FsPreset | null {
  try {
    const raw = sessionStorage.getItem(ANALYZE_CACHE_KEY);
    if (!raw) return null;
    const map = JSON.parse(raw) as Record<string, AnalyzeCacheEntry>;
    const hit = map[cacheKey(url, model)];
    if (!hit) return null;
    if (Date.now() - hit.ts > ANALYZE_CACHE_TTL_MS) return null;
    return hit.preset;
  } catch {
    return null;
  }
}

function writeAnalyzeCache(url: string, preset: FsPreset, model?: string): void {
  try {
    const raw = sessionStorage.getItem(ANALYZE_CACHE_KEY);
    const map = (raw ? JSON.parse(raw) : {}) as Record<string, AnalyzeCacheEntry>;
    map[cacheKey(url, model)] = { ts: Date.now(), preset };
    sessionStorage.setItem(ANALYZE_CACHE_KEY, JSON.stringify(map));
  } catch {
    // sessionStorage full or disabled — silently skip caching.
  }
}

export async function analyzeCompany(
  url: string,
  onStatus?: (msg: string) => void,
  model?: string,
): Promise<FsPreset> {
  // Fast path: did we already analyze this URL+model this session?
  const cached = readAnalyzeCache(url, model);
  if (cached) {
    onStatus?.("Using cached analysis from this session.");
    return cached;
  }

  onStatus?.("Fetching company website…");
  const site = await fetchWebsite(url);
  onStatus?.(
    `Read ${site.text.length.toLocaleString()} chars from "${site.title || site.url}". Asking GPT to infer the Field Service vertical…`,
  );
  // 5000 tokens is a comfortable budget for the full preset (~3K visible
  // JSON + reasoning headroom for gpt-5-mini at "low" effort). The previous
  // 9000-token cap let the model meander; tightening it shaves 10–20s off
  // typical analyses without truncating output.
  const result = await generateJson<FsPreset>({
    systemPrompt: SYSTEM_PROMPT,
    prompt: USER_TEMPLATE(site.url, site.title, site.description, site.text),
    maxCompletionTokens: 5000,
    reasoningEffort: "low",
    model,
  });
  onStatus?.("Building your tailored preset…");
  writeAnalyzeCache(url, result, model);
  return result;
}
