export interface ChangelogEntry {
  version: string;
  date: string;
  tag?: string;
  features?: string[];
  improvements?: string[];
  fixes?: string[];
}

export const APP_VERSION = "v1.7.1";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.7.1",
    date: "April 30, 2026",
    tag: "FIX",
    fixes: [
      "Changelog modal now opens as a single, properly centered overlay. Previously the sticky header's backdrop-blur created a containing block that anchored the modal inside the header bar (and the footer rendered a duplicate underneath). Modal now portals to document.body so it always covers the full viewport.",
    ],
  },
  {
    version: "v1.7.0",
    date: "April 30, 2026",
    tag: "REUSE",
    features: [
      "New “Catalog sourcing (advanced)” section on Generate lets you choose “Create from preset”, “Use existing only”, or “Use existing + create” for each catalog type independently: Territories, Work Order Types, Characteristics, Incident Types, Products, and Accounts.",
      "Picked existing records flow through to Work Order generation — your bookings reference your real accounts and incident types instead of demo copies.",
      "Work Orders and Bookings can each be skipped entirely if you only want the catalog seeded.",
      "Brand-your-environment tile is now the first dashboard tile since most demos start there.",
    ],
    fixes: [
      "Fixed white-on-white invisible text in URL input fields when Chrome autofill kicked in — autofill now respects the dark theme everywhere.",
    ],
  },
  {
    version: "v1.6.0",
    date: "April 30, 2026",
    tag: "CLEAN",
    features: [
      "Generated records no longer carry the DEMO-FS: prefix in their descriptions — your demo data looks production-clean.",
      "Per-run deletion now tracks bookable resources we created in a dedicated id list, so existing-org resources stay protected without needing a tag.",
      "New “Delete all N runs” button on the Reset page tears down every load in one click.",
      "Legacy DEMO-FS tag sweep is still available as a fallback for runs created before v1.6 or from another browser.",
    ],
  },
  {
    version: "v1.5.0",
    date: "April 30, 2026",
    tag: "HISTORY",
    features: [
      "Reset page now lists every recent generation run (per-device, stored in localStorage) with timestamp, company name, and per-entity counts.",
      "New “Delete this run” button on each run wipes only that load by exact record id — useful for stacking multiple demo orgs without nuking each other.",
      "Existing bookable resources brought in via “use existing” mode are protected from per-run deletion (only resources we created are removed).",
      "“Wipe everything” fallback still does the catch-all DEMO-FS tag sweep for older runs or other devices.",
    ],
  },
  {
    version: "v1.4.0",
    date: "April 30, 2026",
    tag: "RESOURCES",
    features: [
      "New \u201cTechnicians\u201d step on the Generate screen lets you pick where bookable resources come from: create the preset technicians as Equipment-type resources (default), use existing resources already in your D365 org, or combine both.",
      "Resource picker queries your org's active User, Contact, and Equipment bookable resources and lets you multi-select them, with optional per-resource territory and primary-skill bindings.",
      "When existing resources are selected, work-order bookings round-robin across them \u2014 no synthetic Equipment records are created unless you ask for them.",
    ],
  },
  {
    version: "v1.3.0",
    date: "April 30, 2026",
    tag: "REVIEW",
    features: [
      "Generated presets are now displayed in friendly section cards \u2014 Territories, Work order types, Incident types (with durations + service-task chips), Skills, Products with prices, Accounts, Technicians \u2014 instead of a wall of JSON.",
      "New \u201cEdit with AI\u201d input on the Analyze screen: type natural-language instructions like \u201cAdd 3 territories in Texas\u201d or \u201cMake every incident 30 minutes longer\u201d and GPT rewrites the preset.",
      "Suggestion chips with example edits, plus an Undo button that restores the last 10 versions.",
      "Raw JSON is still available behind a collapsible toggle for power users.",
    ],
    improvements: [
      "Analyze screen restores the last generated preset when you navigate back, so you don't lose tweaks.",
    ],
  },
  {
    version: "v1.2.1",
    date: "April 30, 2026",
    tag: "UX",
    fixes: [
      "Disabled EasyAuth on the Function App so the AOAI proxy is reachable from the SPA (was returning 400 \"Login not supported for provider azureStaticWebApps\").",
    ],
    improvements: [
      "Sign-in and connected org URL now persist in localStorage instead of sessionStorage \u2014 you stay logged in and don't have to re-enter your D365 environment URL on every visit.",
      "Connect screen now pre-fills the previously connected environment URL.",
      "AppHeader now shows Back and Dashboard buttons on every subpage.",
      "Analyze screen now offers a Skip & use generic preset button to bypass the AI analysis with a vertical-agnostic Field Service catalog.",
    ],
  },
  {
    version: "v1.2.0",
    date: "April 30, 2026",
    tag: "BRAND",
    features: [
      "New Brand your environment wizard at /brand: detects logo + brand colors from any website URL, lets you preview & tweak, then publishes a Dynamics 365 theme as the default for the connected org.",
      "Server-side branding extractor (favicon / apple-touch-icon / og:image / theme-color meta / page palette) plus an SSRF-guarded image proxy for cross-origin logo download.",
      "Theme apply pipeline: creates the theme record, optionally uploads the logo as a web resource and publishes it, then calls PublishTheme so the new colors are immediately effective.",
    ],
    improvements: [
      "Dashboard tile grid now has three cards: Generate, Brand, Reset.",
      "fetchWebsite client auto-prepends https:// when the user omits the scheme.",
    ],
  },
  {
    version: "v1.1.0",
    date: "April 30, 2026",
    tag: "ATTRIBUTION",
    features: [
      "Version history & changelog modal accessible from the header version badge.",
      'Global footer with attribution: "Built by James Bowen — Principal Solution Specialist, Manufacturing & Mobility".',
    ],
    improvements: [
      "Layout switched to a flex column so the footer pins to the bottom on every page.",
    ],
  },
  {
    version: "v1.0.0",
    date: "April 30, 2026",
    tag: "GA",
    features: [
      "Public launch on Azure Static Web Apps + Azure Functions (Flex Consumption).",
      "Multi-tenant Entra ID sign-in with the FS Data Studio app registration.",
      "Azure OpenAI (gpt-5-mini) proxied via managed identity — no keys in the browser.",
    ],
    improvements: [
      "Function App migrated to Flex Consumption (FC1) to work around D365 demo subscription compute quotas.",
      "AOAI account hardened with disableLocalAuth=true; Function App MI granted Cognitive Services OpenAI User.",
    ],
  },
  {
    version: "v0.9.0",
    date: "April 28, 2026",
    tag: "PREVIEW",
    features: [
      "Connect → Dashboard → Analyze → Generate flow with D365 org URL + customer record URL inputs.",
      "AI-driven vertical detection and Field Service preset proposals.",
      "End-to-end dependency graph: territories → work order types → incident types → service tasks → characteristics → products → bookable resources → work orders with bookings.",
    ],
    improvements: [
      "Reset page lets you wipe demo data scoped by tag.",
    ],
    fixes: [
      "Sign-in popup now correctly sets the active account before routing to Connect.",
    ],
  },
];
