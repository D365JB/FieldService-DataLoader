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
