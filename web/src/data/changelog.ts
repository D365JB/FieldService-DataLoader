export interface ChangelogEntry {
  version: string;
  date: string;
  tag?: string;
  features?: string[];
  improvements?: string[];
  fixes?: string[];
}

export const APP_VERSION = "v1.18.3";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.18.3",
    date: "April 30, 2026",
    tag: "RESET",
    features: [
      "**Failed runs now show up in Reset.** When generation crashes mid-run, whatever was already created (territories, work order types, etc.) is recorded as a `(partial)` run on the Reset page so you can clean it up. Previously the run history only captured fully-successful runs, so partial loads became invisible zombies.",
    ],
  },
  {
    version: "v1.18.2",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Incident type service tasks no longer 400.** Lookup binding navigation property is `msdyn_incidenttype` (lowercase) on this Dataverse schema, not `msdyn_IncidentType`.",
    ],
  },
  {
    version: "v1.18.1",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Work Order Types create no longer 400s.** Removed the unsupported `msdyn_description` field from the create payload — `msdyn_workordertypes` only carries `msdyn_name` on this Dataverse schema.",
    ],
  },
  {
    version: "v1.18.0",
    date: "April 30, 2026",
    tag: "DEMO PACKS",
    features: [
      "**11 new curated demo packs** — Medical/Biomed (JCAHO PMs, MRI/CT), Manufacturing OEM (CNC + robotics warranty), Fire & Life Safety (NFPA 25/72 inspections), Restaurant/Kitchen (fryers, walk-ins, hood cleaning), Electric Utility (meter exchange, outage), Solar O&M (drone thermal, IV-curve), Retail Tech Break-Fix (POS/kiosk/ATM), Pest Control (route + termite warranty), Elevator (monthly PM + entrapment), Heavy Equipment (telematics PM + warranty recovery), and Pool & Spa (weekly route + seasonal). 15 packs total now ship with the app — pick the closest match on Analyze and the AI fills in accounts, technicians, locations, assets, agreements, and warehouses around the curated incident catalog.",
    ],
  },
  {
    version: "v1.17.2",
    date: "April 30, 2026",
    tag: "BRANDING",
    features: [
      "**Fixed PublishTheme 404 + `Default status cannot be updated` fallback.** The Web API only exposes `PublishTheme` as a bound action on a theme record, not unbound at the root. Switched to `POST /themes({id})/Microsoft.Dynamics.CRM.PublishTheme` and removed the `isdefaulttheme=true` PATCH fallback (that field is server-managed). Apply now publishes successfully end to end.",
    ],
  },
  {
    version: "v1.17.1",
    date: "April 30, 2026",
    tag: "BRANDING",
    features: [
      "**Fixed `System or Default theme can only be created out of box` on Apply.** Removed the explicit `type` value from the theme PATCH/POST body and from the existing-theme lookup filter — different Dataverse orgs treat `type` as boolean vs option-set, and explicitly sending `false` was being coerced to the System option. The platform now assigns `type` correctly on its own.",
    ],
  },
  {
    version: "v1.17.0",
    date: "April 30, 2026",
    tag: "GENERATE",
    features: [
      "**Dependency warnings on Generate.** Each entity row now flashes an amber alert when an upstream prerequisite is set to Skip — so you'll know before you click Start that, e.g., Skipping Accounts will leave Functional Locations, Customer Assets, Agreements, and Work Orders with nothing to attach to.",
      "**'Use existing' clarified for AI-generated entities.** Functional Locations, Customer Assets, Service Task Types, Agreements, Warehouses, Product Inventory, WO Service Tasks, WO Products, Time Entries, and IoT Alerts now show an info icon explaining why 'Use existing' isn't offered: their records are tied to *this* run's preset (accounts, products, incident types) and wouldn't connect to anything if pulled from your org. Skip is the way to opt out.",
    ],
  },
  {
    version: "v1.16.3",
    date: "April 30, 2026",
    tag: "BRANDING",
    features: [
      "**Fixed `pagecolor` invalid-property error when applying themes.** The Dataverse `theme` entity has no `pagecolor` attribute — the correct field is `pageheaderbackgroundcolor`. Branding apply now succeeds without 400 errors.",
    ],
  },
  {
    version: "v1.16.2",
    date: "April 30, 2026",
    tag: "RESET",
    features: [
      "**Removed legacy DEMO-FS tag sweep from Reset page.** Every run since v1.6 tracks records by id, so the catch-all tag sweep was just dead UI. Reset is now exclusively per-run cleanup — pick a load, delete it, done.",
    ],
  },
  {
    version: "v1.16.1",
    date: "April 30, 2026",
    tag: "REVIEW",
    features: [
      "**Analyze review now shows everything the AI generated.** Added detail sections for Functional Locations, Customer Assets, Service Task Types, Service Agreements (with recurrence + covered incidents/products as chips), and Warehouses — so you can see exactly what will be created before you hit Generate, and tweak it with the AI editor first.",
    ],
  },
  {
    version: "v1.16.0",
    date: "April 30, 2026",
    tag: "CONTROL",
    features: [
      "**Skip support for every Phase 2-6 entity.** The Generate plan now lets you choose Create / Skip independently for Functional Locations, Customer Assets, Service Task Types, Agreements, Warehouses, Product Inventory, WO Service Tasks, WO Products, Time Entries, and IoT Alerts.",
      "Useful for partial demos — e.g. skip IoT Alerts when CFS isn't enabled, skip Agreements for a transactional-only demo, or skip Time Entries for orgs without timesheet flows.",
      "Skips are honoured both in the seeder and in the per-run delete (skipped entities never produce ids, so reset only removes what was actually created).",
    ],
  },
  {
    version: "v1.15.5",
    date: "April 30, 2026",
    tag: "POLISH",
    features: [
      "**Analyze review** — preset summary cards now include Locations, Assets, Task Types, Agreements, and Warehouses, so you can see the full Phase 2-6 footprint before generating.",
      "**Generate \"What to load\"** — added explicit auto-loaded rows for Functional Locations, Customer Assets, Service Task Types, Agreements, Warehouses + Product Inventory, WO Service Tasks/Products/Time Entries, and IoT Alerts. They run automatically (no Skip yet) but you can now see them in the plan.",
    ],
  },
  {
    version: "v1.15.4",
    date: "April 30, 2026",
    tag: "POLISH",
    features: [
      "**Reset page** — legacy tag-sweep blurb now lists every entity the sweep actually deletes (IoT alerts, time entries, WO products, WO service tasks, agreements + booking subtree, customer assets, functional locations, service task types, product inventory, warehouses, and the original catalog), instead of just the v1.0 set.",
      "**Changelog dates** — corrected v1.11.0–v1.15.0 dates that were stamped with future May/June values during the rapid-fire polish session. All entries now correctly show April 30, 2026.",
    ],
  },
  {
    version: "v1.15.3",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Branding fix #2** — Apply theme was failing with `An undeclared property 'LogoImage'`. Dataverse `theme` entity's logo navigation property is `logoimage` (lowercase), not `LogoImage`. OData binding annotation is now `logoimage@odata.bind` and resolves to `/webresourceset(...)` correctly.",
    ],
  },
  {
    version: "v1.15.2",
    date: "April 30, 2026",
    tag: "POLISH",
    features: [
      "**Generate page now reflects every entity.** The progress tracker and result summary were still showing only the original 9 steps from v1.0 — Phase 2-6 entities (Functional Locations, Customer Assets, Service Task Types, Agreements, Warehouses, Product Inventory, WO Service Tasks, WO Products, Time Entries, IoT Alerts) were silently writing to Dataverse without UI feedback. Now all 19 steps render with progress and the success view groups every created record with a deep link.",
      "**Dashboard** — refreshed the AI generator tile copy to mention the full demo (assets, agreements, IoT, inventory) instead of the v1.0 minimum, and removed the stale 'Phase 1C — Dataverse write-back is live' banner.",
    ],
  },
  {
    version: "v1.15.1",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Branding fix** — theme lookup was failing with `400 A binary operator with incompatible types was detected` because the `theme.type` column is Edm.Boolean (system vs custom flag), not an integer. Filter now uses `type eq false` and the create payload sends `type: false`. Branding apply works again.",
    ],
  },
  {
    version: "v1.15.0",
    date: "April 30, 2026",
    tag: "DEMO PACKS",
    features: [
      "**Curated Demo Packs** — pick a pre-tuned vertical pack on the Analyze page instead of running web analysis or starting from generic. Four packs ship today: **Generic**, **HVAC** (RTUs / chillers / refrigerant), **Telecom** (towers / generators / 5G), and **Property / Facilities** (lighting / plumbing / elevator coord).",
      "Each pack swaps in vertical-specific characteristics, incident types with realistic service tasks, and product/parts catalogs. Everything else (territories, accounts, agreements, etc.) is still fully editable in the review step.",
      "**Phases 1–7 complete** — the seeder now covers every major Field Service entity tier: catalog, accounts, resources, work orders, bookings, customer assets, functional locations, agreements, WO products, time entries, warehouses, product inventory, and IoT alerts. All with idempotent re-runs and child-first cleanup.",
    ],
  },
  {
    version: "v1.14.0",
    date: "April 30, 2026",
    tag: "CONNECTED",
    features: [
      "**IoT Alerts** — Connected Field Service mock alerts now seed automatically. Each Customer Asset gets an alert with realistic severity (Info / Warning / Critical), status (mostly Active with some In Progress and Closed), and a believable telemetry payload — so the IoT Alerts dashboard isn't empty during demos.",
      "Alerts are linked to both the Account and the Customer Asset so drill-downs from either entity work out of the box.",
      "Skipped from this phase by design: **Inspections** (require a hand-authored form schema per vertical) and **Resource Pay Types** (rare in demos). Both can be added later if there's customer demand.",
      "Reset and per-run delete clean up IoT Alerts before Customer Assets (correct child-first order).",
      "Internal cleanup: phase2EntityOrder reorganised into clear beforeWo/afterWo blocks for easier maintenance as new entities are added.",
    ],
  },
  {
    version: "v1.13.0",
    date: "April 30, 2026",
    tag: "INVENTORY",
    features: [
      "**Warehouses** — depots and service-van stock locations now seed automatically (3 by default in the generic preset).",
      "**Product Inventory** — every warehouse × product combo gets an on-hand quantity row (5–50 units) so the FS Inventory and parts-availability views aren't empty.",
      "Smart unit lookup — the seeder reads each product's primary unit on the fly. If a product has no default unit configured, that inventory row is skipped silently rather than failing the whole run.",
      "AI preset generator now produces 2–4 vertical-appropriate warehouses with city/state matching the territories.",
      "Reset and per-run delete clean up Product Inventory before Warehouses (correct child-first order).",
    ],
  },
  {
    version: "v1.12.0",
    date: "April 30, 2026",
    tag: "EXECUTION",
    features: [
      "**WO Products** — every Work Order now ships with 1–3 product/parts lines so the WO form's products tab is populated. Open & Scheduled WOs get **Estimated** lines; Closed-Posted WOs get **Used** lines so historical costs roll up.",
      "**Time Entries** — every Booking automatically gets a Time Entry of type *Work* spanning the full booking window, status *Submitted*. The resource's timesheet view lights up out of the box.",
      "Per-run delete and tag-sweep reset clean up WO Products and Time Entries before WOs (correct child-first order).",
      "No new preset fields required — Phase 4 piggybacks on existing products + bookings, so AI-analyzed and generic presets both benefit immediately.",
    ],
  },
  {
    version: "v1.11.0",
    date: "April 30, 2026",
    tag: "AGREEMENTS",
    features: [
      "**Service Agreements** — recurring service contracts now seed automatically. Each top account gets an annual agreement with a recurrence pattern, covered incident types, and estimated parts.",
      "**Booking Setup + line items** — every agreement gets a child booking-setup carrying the recurrence rule plus 1–2 covered incident links and 1–2 estimated product lines, so the agreement form is realistic out of the box.",
      "**Safe by default** — agreements are created in **Estimate** status with `auto-generate WO = false`, so the server-side recurrence engine stays dormant during the demo. Flip them to Active manually when you want to see WOs spawn.",
      "AI preset generator now produces 2–4 vertical-appropriate agreements per analyzed company; the generic preset ships with 3 ready-to-demo contracts.",
      "Reset and per-run delete clean up the agreement subtree (booking-incidents → booking-products → booking-setups → agreements) in the right child-first order.",
    ],
  },
  {
    version: "v1.10.0",
    date: "April 30, 2026",
    tag: "ASSETS",
    features: [
      "**Customer Assets** — generates 8–14 named, serial-numbered assets per run distributed across the top accounts, linked to product SKUs and functional locations. Work Orders auto-attach a customer asset for the right account so the WO form lights up like a real demo.",
      "**Functional Locations** — 2-level location tree per top accounts (Building → Floor / Zone). Customer Assets hang off the right location.",
      "**Service Task Types** — reusable safety / diagnostic / repair / sign-off task catalog (8 entries by default).",
      "**WO Service Tasks** — every generated Work Order auto-attaches 2–4 service tasks from the catalog, so the checklist tab is populated.",
      "AI preset generator and the generic skip-preset both produce all three new sections out of the box.",
      "Reset and per-run delete clean up everything in the right child-first order — assets, locations, task types, WO tasks — automatically.",
    ],
  },
  {
    version: "v1.9.0",
    date: "April 30, 2026",
    tag: "INFRA",
    improvements: [
      "Internal refactor: every catalog step (Territories, WO Types, Characteristics, Incident Types, Products, Accounts, Bookable Resources) now flows through a single generic engine. Behaviour is unchanged — but adding new entity types in upcoming releases is now ~20 lines instead of ~80 each.",
      "New generic id registry on each run result. Phase 2+ entities (Customer Assets, Functional Locations, Agreements, Inspections, etc.) plug into per-run delete automatically.",
      "Reset / per-run delete is now driven by an ordered dependency list, so future entity types get cleaned up safely without bespoke code.",
    ],
  },
  {
    version: "v1.8.0",
    date: "April 30, 2026",
    tag: "UNIFIED",
    features: [
      "Generate page now shows a single, uniform list — every entity (Territories, WO Types, Characteristics, Incident Types, Products, Accounts, Bookable Resources, Work Orders, Bookings) gets the same dropdown: Create from preset / Use existing / Skip.",
      "Bookable Resources joined the unified list — the dedicated 'Technicians' card and resource picker are gone, plus their old territory/skill side-bindings.",
      "Removed the 'Use existing + create' combo mode in favour of a clean three-way choice. Reuse means reuse, create means create.",
      "Work Orders and Bookings keep Create / Skip (no Existing — there's no incoming demo data to reuse for those).",
    ],
  },
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
