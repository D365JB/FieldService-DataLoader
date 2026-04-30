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

export async function analyzeCompany(url: string): Promise<FsPreset> {
  const site = await fetchWebsite(url);
  return generateJson<FsPreset>({
    systemPrompt: SYSTEM_PROMPT,
    prompt: USER_TEMPLATE(site.url, site.title, site.description, site.text),
    maxCompletionTokens: 9000,
    reasoningEffort: "low",
  });
}
