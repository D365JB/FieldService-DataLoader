export interface ChangelogEntry {
  version: string;
  date: string;
  tag?: string;
  features?: string[];
  improvements?: string[];
  fixes?: string[];
}

export const APP_VERSION = "v1.34.0";

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "v1.34.0",
    date: "May 1, 2026",
    tag: "FEATURE",
    features: [
      "**Switched the analyzer model to `gpt-4o-mini`.** Smoke test through the proxy now returns in ~2.5 seconds (was 30–60s on gpt-5-mini), and the per-call AOAI cost drops ~3×. Quality trade-off is small for this workload — extracting a vertical from web text and emitting JSON doesn't benefit from reasoning tokens, and the seeder's `safeWrite` wrapper already absorbs any occasional cross-reference miss in the generated preset.",
      "**Both models stay deployed.** Bicep now provisions `gpt-4o-mini` (active) and `gpt-5-mini` (fallback, capacity 100) on the same AOAI account. To roll back at any time: `az functionapp config appsettings set -g rg-fsdemo -n func-fsdemo-vnoq6fosbmk2i --settings AOAI_DEPLOYMENT=gpt-5-mini` — flip is ~30s, no redeploy.",
    ],
  },
  {
    version: "v1.33.2",
    date: "May 1, 2026",
    tag: "POLISH",
    improvements: [
      "**Customer Analyzer is faster.** Per-session client-side cache (sessionStorage, 30-min TTL) keyed by normalized URL — re-analyzing the same site is now instant. Also reduced the AOAI completion budget from 9000 to 5000 tokens, which trims 10–20s off typical first-time runs without truncating output.",
      "Status panel now shows *\"Using cached analysis from this session\"* on cache hit so the instant return doesn't feel like a glitch.",
    ],
  },
  {
    version: "v1.33.1",
    date: "May 1, 2026",
    tag: "POLISH",
    improvements: [
      "**Customer Analyzer: press Enter in the URL field to run.** No more reaching for the mouse during a demo.",
      "**Live status during analysis.** The card now shows the current stage (*Fetching company website* → *Read N chars, asking GPT…* → *Building your tailored preset*), an animated spinner, and an elapsed-seconds counter. After 30s it surfaces a soft \"AI service may be under load\" hint so the user knows the app isn't hung.",
    ],
  },
  {
    version: "v1.33.0",
    date: "May 1, 2026",
    tag: "FEATURE",
    features: [
      "**Multi-user stability sweep across the AI proxy and helper APIs.** The app is now hardened against the kind of contention you get when several presenters demo simultaneously: the upstream-fetch endpoints (`fetchWebsite`, `fetchImage`) keep a per-instance 10-minute / 1-hour TTL cache and coalesce concurrent requests for the same URL into a single upstream call, and the AOAI proxy honors the model's `Retry-After` header, adds jitter to its exponential backoff, enforces a hard per-attempt timeout, caps prompt input size, and surfaces `Retry-After` to the client on saturation. The browser layer (`generateContent`, `fetchWebsite`) does one outer retry on transient 429/502/503/504 with friendlier error messages.",
    ],
    improvements: [
      "AOAI proxy retry budget bumped from 5 to 6 attempts; uses full-jitter so simultaneous 429s don't resync into a thundering herd.",
      "Generate proxy now returns 503 with `Retry-After` (not 502) on final exhaustion so the UI can wait politely instead of erroring.",
      "Per-attempt 110s `AbortController` budget on the AOAI fetch so a single hung connection can't hold the function instance for SWA's full 230s gateway window.",
      "Image proxy: 415 on disallowed content-types and 504 on upstream timeouts (was previously a generic 502 in both cases).",
      "Note: a brief Customer Analyzer outage on Apr 30 was traced to the deployment storage's `publicNetworkAccess` flipping to *Disabled* out-of-band — Bicep specifies *Enabled*, so suspect Azure Policy drift. Re-enabling it and restarting the function restored service.",
    ],
  },
  {
    version: "v1.32.0",
    date: "May 1, 2026",
    tag: "FEATURE",
    features: [
      "**Stability sweep: a single Field Service plugin error can no longer abort the run.** Every Dataverse write in the seeder now flows through a `safeCreate` / `safeUpdate` wrapper that classifies known-benign 400s — Posted Work Order, asset/account mismatch, missing lookup, FS validation, permission denial — and records them on the run summary instead of throwing. The previous five hotfixes (v1.31.2–v1.31.6) addressed specific failure modes one at a time; this generalizes the pattern across all 12 catalog steps plus Work Orders, Service Tasks, Bookings, WO Products, and Time Entries.",
      "**\"N records skipped\" panel on the success card.** When the seeder gracefully skips records, the success view now shows a collapsible panel grouped by entity, with counts per skip reason (e.g. *\"3 already Posted, 1 missing lookup\"*) and a sample of the affected record labels. Run history is unaffected; existing runs still load correctly.",
    ],
    improvements: [
      "Schema-fallback retry (which strips columns the org's FS solution doesn't ship) is now centralized in `safeCreate` instead of duplicated in `createWithSchemaFallback`. All catalog steps benefit, not just Work Orders.",
      "Removed three rounds of ad-hoc `try/catch` + `isPostedWoError` handlers added in v1.31.4–v1.31.6; the same behavior is now driven by `classifyError` in one place.",
    ],
  },
  {
    version: "v1.31.6",
    date: "May 1, 2026",
    tag: "FIX",
    fixes: [
      "**A single Posted Work Order can no longer abort the run.** Previously when an existing target-Closed WO was already Posted in Dataverse and FS refused to re-Open it, child-row phases (Service Tasks, Bookings, WO Products, Time Entries) would still try to attach rows and 400 with *\"A record can't be added to a work order that's been posted.\"* Now: failed re-Opens mark the WO as Posted in a skip-set, and every child-create site detects the Posted error and gracefully skips the WO. The run completes; affected WOs simply end with whatever rows they already had.",
    ],
  },
  {
    version: "v1.31.5",
    date: "May 1, 2026",
    tag: "FIX",
    fixes: [
      "**Work Order create no longer 400s mid-run with *\"The customer asset must be related to the service account of the current work order.\"*** When a Customer Asset already existed in Dataverse and got reused, we were indexing it under the *preset's* expected account, but the live record's `msdyn_account` could point somewhere else (different demo run, manual edit, prior preset). Now: (1) on reuse, the asset's real `_msdyn_account_value` is queried and it's indexed under that account; (2) right before each WO is created, we re-verify the candidate asset still matches the service account and skip the binding if it doesn't, so the run continues with no asset rather than failing.",
    ],
  },
  {
    version: "v1.31.4",
    date: "May 1, 2026",
    tag: "FIX",
    fixes: [
      "**Bookable Resource create no longer 400s with *\"latitude or longitude for the Contact record … is invalid\"*.** The previous fix stamped lat/long on the Contact, but the FS plugin's validation of *Resource Address* mode is too strict for synthetic demo contacts (no full street address, etc.). Dropped the `msdyn_startlocation`/`endlocation = Resource Address` flag from the bookable resource payload. Lat/long is still written to both the Contact and the resource, so map pins and RSO routing keep working — without triggering the plugin's Contact-address validation.",
    ],
  },
  {
    version: "v1.31.3",
    date: "May 1, 2026",
    tag: "FIX",
    fixes: [
      "**Bookable Resource create no longer 400s with *\"latitude or longitude for the Contact record … is invalid\"* when the geocode toggle is on.** For Contact-type resources, the FS plugin reads lat/long from the **Contact** (not the bookable resource) when `msdyn_startlocation = Resource Address`. Now `address1_latitude` / `address1_longitude` are stamped on the technician Contact at create, and existing contacts missing coords are healed before the resource is created.",
    ],
  },
  {
    version: "v1.31.2",
    date: "May 1, 2026",
    tag: "FIX",
    fixes: [
      "**Final fix for \"Cannot access 'ut' before initialization\" in Bookable Resources.** Root cause was a temporal-dead-zone inside `seedFromPreset`: `knobs` was first declared later in the function (near Work Orders) but was already being read in the Bookable Resources `build`/`onResolved` callbacks. In production this minified binding appeared as `ut`. Moved `const knobs = options.knobs ?? DEFAULT_KNOBS` to the top of `seedFromPreset` before any step uses it.",
    ],
  },
  {
    version: "v1.31.1",
    date: "May 1, 2026",
    tag: "FIX",
    fixes: [
      "**\"Cannot access 'ut' before initialization\" — proper fix.** v1.30.1 swapped the geo import to a relative path but Rollup still chunked `seed-config` and `geo` together, and depending on initialisation order the closure inside the bookable-resource `build()` could reference the imported `geocodeTech` binding before the `geo` module had finished initialising. Inlined the geocode lookup table + helper directly into `seed-config.ts` so there is no cross-module import to race against. The `Geocode techs to territory` toggle still works the same way.",
    ],
  },
  {
    version: "v1.31.0",
    date: "May 1, 2026",
    tag: "FEATURE",
    features: [
      "**Instant row removal on Review & Tweak.** Every entry — territory, work-order type, incident, skill, product, account, technician, functional location, customer asset, service task, agreement, warehouse — now has a hover-to-reveal trash icon. Click it and the row is gone in milliseconds. No AI round-trip, no waiting.",
      "**Same referential cleanup as the AI editor**, applied locally: removing a territory repoints every technician that pointed to it; removing a characteristic repoints `primarySkill`; removing an incident drops it from agreement coverage; removing a product clears `customerAssets.productNumber` and agreement `coveredProductNumbers`; removing an account cascades to its assets, locations, and agreements; removing a functional location clears asset references and child locations.",
      "**One Undo stack** for both AI edits and manual removals — Undo reverts whichever was the most recent change.",
    ],
    fixes: [
      "**Belt-and-suspenders around the geocode step.** Wrapped both call sites of `geocodeTech` in try/catch so any unexpected runtime issue (TDZ, undefined coord, anything else) is logged and the seeder continues — instead of failing the whole run before contacts are written.",
    ],
  },
  {
    version: "v1.30.1",
    date: "May 1, 2026",
    tag: "FIX",
    fixes: [
      "**\"Cannot access 'ut' before initialization\" on Generate.** The geocode helper added in v1.29 was imported via the `@/lib/fs/geo` path alias from a file already inside `lib/fs/` — under Vite's production minifier this can produce a temporal-dead-zone reference when both modules land in the same chunk. Switched to a relative `./geo` import which the bundler treats deterministically.",
      "Production sourcemaps are now generated alongside the bundle so any future runtime error gives a real `seed-config.ts:line:col` stack in the browser console instead of a minified two-letter variable name.",
    ],
  },
  {
    version: "v1.30.0",
    date: "April 30, 2026",
    tag: "PERF",
    improvements: [
      "**Edit with AI is noticeably faster.** Three changes layered together: (1) reasoning effort dropped to *minimal* for edits since add/remove/rename/repoint operations don't benefit from extra thinking budget; (2) Azure OpenAI **JSON mode** turned on so the model emits a single valid object and stops sooner — no more fence-stripping retry path; (3) the preset payload sent to the model is now compact JSON instead of pretty-printed, cutting input tokens (and prefill latency) by roughly a third on large presets.",
      "Net effect: typical edits like *Add three territories* or *Rename the company* now return in a few seconds instead of 10–20. Quality is unchanged — referential-integrity rules in the system prompt still cascade through technicians, agreements, customer assets, etc.",
    ],
  },
  {
    version: "v1.29.0",
    date: "April 30, 2026",
    tag: "FEATURE",
    features: [
      "**Geocode techs to territory.** New toggle on the Generation knobs panel auto-positions every bookable resource at its primary territory's metro centre (with a small per-name jitter so techs don't stack on the same pin). Sets `msdyn_startlocation` + `msdyn_endlocation` to *Resource Address* (690970000) and writes `msdyn_latitude` / `msdyn_longitude` so RSO can compute travel time on bookings. Off by default. Re-runs heal existing techs that have no coords without disturbing ones that already do.",
      "Built-in metro lookup covers PNW, BAY/SFO/SV, LA/SD, PHX, DEN, SLC, LV, CTX/ATX, DFW, HOU, SATX, NOLA, MIA, TPA, ORL, ATL, CLT, RDU, NSH, NYC, NJ, PHL, DC, BAL, NE/BOS, PIT, CLE, CIN, DET, MW/CHI, IND, STL, MSP, KC, OKC. Unrecognised codes fall back to the contiguous-US centroid so geocoding never crashes a run.",
      "Note: a Bing Maps key configured in Field Service is still required for *real* route distance/time. Without it the coords sit on the records but RSO won't render minutes — the toggle preps the data either way.",
    ],
  },
  {
    version: "v1.28.0",
    date: "April 30, 2026",
    tag: "FEATURE",
    features: [
      "**Schedule start date.** New date picker on the Generation knobs panel anchors the schedule. Future bookings step forward from this date by *Days forward*; closed bookings step backward by *Days backward*. Leave it blank to keep the previous behaviour (anchor = tomorrow). Persists per-org alongside the other knobs.",
      "**Larger demos.** Maximum *Work orders* per run raised from 60 → 200. Note that 200 WOs run for several minutes since each WO produces tasks, products, a booking, and a time entry; pace yourself.",
    ],
  },
  {
    version: "v1.27.1",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Edit with AI** now actually removes items when you say *remove*. The system prompt was too defensive (\"preserve every field that wasn't asked to be changed\") so the model often returned the territories/products/etc. unchanged. The prompt now explicitly states: apply removals literally, then cascade-fix references (technicians' territory codes & skills, agreement coverage lists, asset product / functional-location pointers, account-scoped children) so the preset stays internally consistent. Token budget bumped 9k → 16k to avoid truncated edits on large presets.",
    ],
  },
  {
    version: "v1.27.0",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Reset audit:** the unknown-entity warning during a Reset no longer fires for `technicianContacts`. Those rows are tracked by the seeder and cleaned up via a dedicated sweep after Bookable Resources, but the audit pass didn't know that and surfaced a misleading *Skipped unknown entity* line. A new `KEYS_HANDLED_BY_DEDICATED_SWEEP` allowlist documents this contract so future entities don't have to choose between *register-in-phase2EntityOrder* and *trigger-spurious-warnings*.",
      "Audit confirmed coverage for v1.21–v1.26 entities: WO Service Tasks, WO Products (incl. new pricing fields), Time Entries, Incident Type Products, IoT Alerts, Customer Assets, Functional Locations, Service Task Types, Agreement booking subtree, Price Lists, Warehouses, Product Inventory, Technician Contacts. No new entity types were introduced by v1.24/v1.25/v1.26 (those features added fields/behavior to existing entities only).",
    ],
  },
  {
    version: "v1.26.0",
    date: "April 30, 2026",
    tag: "FEATURE",
    features: [
      "**Closed-Posted financials.** WO product lines now carry pricing pulled from each product's `listPrice` in the preset. Estimated lines populate `msdyn_estimateunitamount` + `msdyn_estimatesubtotal`; Closed-Posted (Used) lines additionally set `msdyn_unitamount`, `msdyn_subtotal`, and `msdyn_totalamount` so closed WOs render real revenue numbers in dashboards and KPIs.",
    ],
  },
  {
    version: "v1.25.0",
    date: "April 30, 2026",
    tag: "FEATURE",
    features: [
      "**Weighted technician picker.** Bookings no longer round-robin evenly across techs. Each tech gets a deterministic 1×/2×/3× weight derived from their name, so the same person consistently looks like a 'top performer' across runs. Toggle off to fall back to flat round-robin.",
      "**Skill-matched bookings.** Optional toggle that filters booking candidates to techs whose `primarySkill` substring-matches the WO's incident type (case-insensitive, either direction). Empty match falls back to the full roster so nothing goes unassigned.",
    ],
  },
  {
    version: "v1.24.0",
    date: "April 30, 2026",
    tag: "FEATURE",
    features: [
      "**Generation knobs.** New panel on the Generate page tunes the next run's volume and shape: total work-order count (2–60), status mix (Open-Unscheduled / Scheduled / Closed-Posted), priority mix (Low / Medium / High / Critical), forward and backward scheduling windows, and the workday-start hour. Settings persist per-org.",
      "**Status mix** replaces the old fixed `[3 × Open, 2 × Scheduled, 1 × Closed]` round-robin. Closed-Posted entries still go through the create-as-Open then post-at-end flow, so child rows attach cleanly.",
      "**Priority mix** resolves to `msdyn_priority` records by name (Low/Medium/High/Critical) and binds them on each WO. Orgs missing a given priority record skip the field for that WO instead of failing.",
      "**Scheduling window** drives booking dates: future bookings spread across 1..*daysForward* days, Closed-Posted backdated bookings spread across 1..*daysBackward* days. Bookings still occupy four 2-hour slots starting at the configured workday hour.",
    ],
  },
  {
    version: "v1.23.0",
    date: "April 30, 2026",
    tag: "FEATURE",
    features: [
      "**Reset → partial delete.** Each run row now has a *Custom delete…* button next to *Delete this run*. Open it to pick exactly which entity types you want to clean up (Bookings only, or Time Entries + IoT Alerts, etc.). Picking a parent automatically ticks its children — *Work Orders* pulls in Bookings, WO Service Tasks, WO Products, Time Entries; *Customer Assets* pulls in IoT Alerts; *Accounts* cascades through everything that references it. The history record updates in place so re-runs only re-create the bits you wiped.",
      "**Technician Contacts** now verify the candidate id from the fullname search still exists with a direct retrieve before reusing it. After a Reset, Dataverse's search index can briefly return ids for already-deleted rows, which surfaced as `Entity 'Contact' With Id = ... Does Not Exist` when binding `ContactId` on the bookable resource. A 404 on the retrieve falls through to creating a fresh contact.",
    ],
  },
  {
    version: "v1.22.2",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Work Orders** create now uses a schema-aware fallback: if Dataverse rejects the payload with *\"Invalid property 'X'\"* or *\"undeclared property 'X'\"*, that single column is stripped and the create is retried. This org doesn't ship `msdyn_accountinstructions` on `msdyn_workorder`, so the field gets dropped automatically and the WO still lands with the rest of the demo content. Nav properties (`@odata.bind`) are never stripped — only structural columns.",
    ],
  },
  {
    version: "v1.22.1",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Bookable Resources** create/heal now bind via `ContactId@odata.bind` (PascalCase nav property matching the `contactid` lookup column). The previous `Contact@odata.bind` was undeclared on this org and produced *\"An undeclared property 'Contact' which only has property annotations\"*. New runs will now create resources as Contact-type cleanly, and existing Equipment-typed rows will be healed on subsequent runs.",
    ],
  },
  {
    version: "v1.22.0",
    date: "April 30, 2026",
    tag: "FEATURE",
    features: [
      "**Reset → Recent loads** rows now expand into the same rich detail you see right after a Generate run: per-entity counts plus named, clickable chips for every record (Accounts, WOs, Bookings, Time Entries, IoT Alerts, etc.) that deep-link straight into Dynamics. Click a row's title to expand. The shared section builder is extracted to `resultSections.ts` so Generate and Reset stay in sync going forward.",
    ],
  },
  {
    version: "v1.21.4",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Bookable Resources** heal step now selects the correct lookup column `_contactid_value` (not `_contact_value`). The heal in v1.21.3 short-circuited the entire run with *\"Could not find a property named '_contact_value'\"*; column name corrected.",
    ],
  },
  {
    version: "v1.21.3",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Bookable Resources** now heal to `Contact` type on re-runs. Earlier runs created the seeded technicians as `Equipment` (the Dataverse default `resourcetype`); reused rows are now PATCHed to `resourcetype = 2` with the matching Contact bound, so they show up correctly on the *Resources* view instead of as Equipment.",
    ],
  },
  {
    version: "v1.21.2",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Close Work Orders** now uses `msdyn_resolution` instead of the non-existent `msdyn_followupresolution`, and falls back through progressively smaller payloads (resolution+actuals+status → resolution+status → status only) so a missing column on this org's schema doesn't block the close. The status flip will always succeed even if richer fields are unavailable.",
    ],
  },
  {
    version: "v1.21.1",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**WO Products** now compute the next free `msdyn_lineorder` from existing rows on each WO. Earlier runs left lines at orders 1..N and the new closed-WO content tried to insert at colliding orders, producing *\"You can't add a product with the same line order.\"*. New lines now append after the highest existing order on each WO.",
    ],
  },
  {
    version: "v1.21.0",
    date: "April 30, 2026",
    tag: "FEATURE",
    features: [
      "**Posted Work Orders are no longer barren.** Closed-Posted WOs now ship with the full child-row set: service tasks, product lines (status = *Used*), a backdated booking, and a time entry. They are created as Open-Unscheduled, populated, and *then* transitioned to Closed-Posted in a new final phase so the FS \"can't add records to a posted WO\" plugin doesn't block child creation.",
      "**WO form fields populated**: every WO now writes `msdyn_accountinstructions` (rotating per WO) and `msdyn_estimatedserviceduration` (90–180 min based on slot) so the form is no longer mostly blank.",
      "**Resolution + actuals on closed WOs**: the new *Close Work Orders* phase patches `msdyn_followupresolution` and `msdyn_actualserviceduration` (matched to booking duration) before flipping the status to Posted, giving the Copilot summary card and totals real content.",
      "**Backdated bookings for closed WOs**: closed bookings land 7–28 days in the past and use the *Completed* booking status when available, so the schedule board shows historical activity in addition to upcoming work.",
      "**Heal pre-existing posted WOs**: WOs that earlier seeder versions created directly as Posted (with no children) are re-Opened on idempotent match so this run can attach the missing rows and re-Post them.",
      "**New step in the run dashboard**: *Close Work Orders* appears between Time Entries and IoT Alerts.",
    ],
  },
  {
    version: "v1.20.18",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**IoT Alerts** that already exist from prior runs are now tracked and labeled in the run summary. The idempotency skip path was leaving the alerts off the dashboard even though the rows existed in Dataverse.",
    ],
  },
  {
    version: "v1.20.17",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Time Entries** now bind the **Work Order** as well as the booking, using the PascalCase nav property `msdyn_WorkOrder@odata.bind`. The *All Time Entries (Field Service)* view filters by Work Order, so without this lookup populated the rows were invisible in FS even though they existed. Existing rows are healed in place.",
    ],
  },
  {
    version: "v1.20.16",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Time Entries** now heal pre-existing orphan rows. Time entries created by v1.20.12–14 had no booking link (the casing bug). The idempotency check matched those orphans and silently skipped them, leaving Time Entries absent from the run summary. The seeder now PATCHes the booking link onto any existing row that's missing it, and tracks both newly-created and healed rows so they appear in the summary.",
    ],
  },
  {
    version: "v1.20.15",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Time Entries** are now linked back to their booking using the correct **PascalCase** OData navigation property: `msdyn_BookableResourceBooking@odata.bind`. The earlier *undeclared property* 400 was a casing bug — Dataverse nav property names are case-sensitive (the lookup column is lowercase `msdyn_bookableresourcebooking`, but the nav property is PascalCase). Without the booking link, time entries were created but invisible in any FS view filtered by booking/WO.",
    ],
  },
  {
    version: "v1.20.14",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**IoT Alerts** no longer write `msdyn_iotalertstatus`. Like `msdyn_severity`, that column does not exist on `msdyn_iotalert` in some orgs. New alerts are created at the platform default state and can be transitioned post-create if a demo needs Active/InProgress/Closed mix.",
    ],
  },
  {
    version: "v1.20.13",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**IoT Alerts** no longer write a top-level `msdyn_severity` column. That property does not exist on `msdyn_iotalert` in some orgs (the table only carries severity inside `msdyn_alertdata` JSON). Severity is still preserved in the alert data payload.",
    ],
  },
  {
    version: "v1.20.12",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Time Entries** no longer attempt to bind to a work order *or* a booking. Both `msdyn_workorder` and `msdyn_bookableresourcebooking` are reported as undeclared navigation properties on `msdyn_timeentry` in some orgs. The minimum viable Time Entry only needs the bookable resource + time window; booking/WO context is recoverable via the resource and overlapping time range.",
    ],
  },
  {
    version: "v1.20.11",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Time Entries** now bind to the booking (`msdyn_bookableresourcebooking`) instead of the work order. The `msdyn_workorder` navigation property is not declared on `msdyn_timeentry` in many FS orgs, which produced an OData *undeclared property* 400. The work order is reached transitively through the booking.",
    ],
  },
  {
    version: "v1.20.10",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Time Entries** and **IoT Alerts** no longer fail silently. The previous `try/catch` on each row swallowed every schema/permission error, so the steps reported success while creating zero records — both now surface the real Dataverse error so the failure can be diagnosed and fixed.",
      "Time Entries and IoT Alerts now show meaningful labels in the run output (e.g. *WO-01016 — 5/1/2026*, *Compressor outlet pressure exceeded threshold*).",
    ],
  },
  {
    version: "v1.20.9",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Bookable Resources** are now created as **Contact**-type resources backed by real Contact records (firstname/lastname split from the technician name) instead of Equipment. New seeder step *Technician Contacts* runs before Bookable Resources.",
      "**Incident Type Products** now show their *Product → Incident* label even for rows reused from a previous run (the label was previously only applied to newly-created rows, so re-runs still showed GUIDs).",
      "Reset now sweeps the technician contacts it created.",
    ],
  },
  {
    version: "v1.20.8",
    date: "April 30, 2026",
    tag: "POLISH",
    features: [
      "**Run output dashboard** now shows real names instead of synthetic labels: Work Order chips show the WO number (e.g. *WO-01016*); WO Service Tasks show the task type; WO Products show the product; Bookings show the WO number; Incident Type Products show *Product → Incident*.",
      "Backed by a new per-record label registry (`result.labels`) populated during seeding. Old runs in history without labels still render using the previous numbered fallback.",
    ],
  },
  {
    version: "v1.20.7",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Closed-Posted work orders** no longer break generation. The FS plugin rejects child rows on posted WOs (`A record can't be added to a work order that's been posted.`); WO Service Tasks and WO Products now skip those WOs. Phase E of the roadmap will add lines BEFORE posting to fully populate Closed-Posted financials.",
      "**Booking titles** now reliably show the WO number (e.g. *WO-01016*). All WO numbers are batch-fetched in a single query after the WO loop so the FS auto-number plugin has time to populate. Existing bookings from prior runs are renamed in place.",
    ],
  },
  {
    version: "v1.20.6",
    date: "April 30, 2026",
    tag: "POLISH",
    features: [
      "**Bookings** are now titled with the work order's auto-numbered name (e.g. *WO-01016*) instead of *Booking for WO #1*, so the schedule board shows the same identifier the field tech sees on the work order.",
    ],
  },
  {
    version: "v1.20.5",
    date: "April 30, 2026",
    tag: "POLISH",
    features: [
      "**WO Service Tasks** are now named after the **task type** (e.g. *Safety Lockout/Tagout*) instead of *WO #1 task 1*.",
      "**WO Products** are now named after the **product** (e.g. *RTU-45T Rooftop Unit*) instead of *WO #1 part 1*.",
      "Removed silent `try/catch` swallows on those steps so any future Dataverse error surfaces as a real generation failure with the actual message.",
    ],
  },
  {
    version: "v1.20.4",
    date: "April 30, 2026",
    tag: "POLISH",
    features: [
      "**Incident Type Product rows now have a Name** matching the product (e.g. *RTU-45T Rooftop Unit*) instead of an empty `---`. Previously the field was left blank, making the list view less readable.",
    ],
  },
  {
    version: "v1.20.3",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Correct column name for Field Service product type.** v1.20.2 used `msdyn_fieldservicetype`, but the actual column on `product` is **`msdyn_fieldserviceproducttype`** — verified via `$metadata`. The wrong name was silently swallowed by a try/catch, so the auto-heal never fired and the FS plugin kept rejecting the link.",
      "**Removed the silent catch** around the product retrieve/heal step so schema mismatches surface as real errors instead of hiding behind generic FS plugin messages.",
    ],
  },
  {
    version: "v1.20.2",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Products now created with `msdyn_fieldservicetype = Non-Inventory`** so the Field Service plugin allows them on incident-type and work-order product lines. Without this, the FS plugin rejected the link with *“The Field Service product type must be Inventory or Non-Inventory.”*",
      "**Auto-heals existing products** missing the field service type — the Incident Type Products step now patches any product on the fly when it's neither Inventory nor Non-Inventory, so older runs don't have to be reset first.",
      "Added a generic `update()` method to the Dataverse client (`PATCH /entityset(id)` with `If-Match: *`) used by the auto-heal path.",
    ],
  },
  {
    version: "v1.20.1",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Incident Type ↔ Product mapping uses correct Dataverse fields.** Was sending `msdyn_estimateduration`/`msdyn_estimateunit` (those are agreement-product columns); the actual `msdyn_incidenttypeproduct` schema uses `msdyn_quantity` and the `msdyn_unit` lookup. Removed the non-existent `msdyn_lineitemtype` field.",
    ],
  },
  {
    version: "v1.20.0",
    date: "April 30, 2026",
    tag: "FIX + FEATURE",
    features: [
      "**Work orders now actually land in Dataverse.** The WO loop previously had a `try/catch` that swallowed every Dataverse 400 and still ticked the progress bar to 16/16 — so the UI showed all green even when zero rows were created. The catch is gone; real errors now surface immediately.",
      "**Work orders bind a price list.** Most Field Service configs require `msdyn_pricelist` on `msdyn_workorder`. The price-list resolver from v1.19.1 is now shared between agreements and work orders, and is called before the WO loop starts (auto-creates one if the org has none).",
      "**🆕 Incident Type ↔ Product mappings.** New step (`msdyn_incidenttypeproduct`) runs after Products. Each incident type gets ~3 products attached as Estimated lines with quantity 1. When a tech opens a work order with that incident type, Field Service auto-copies these as `msdyn_workorderproduct` rows — exactly the demo flow customers ask about.",
      "**Per-run delete cleans up the new mappings + price list** in the right order (mappings → WOs → agreements → price list).",
      "**Reset breakdown** lists \"Incident Type Products\" alongside the rest of the entities.",
    ],
  },
  {
    version: "v1.19.1",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Agreements now bind a price list.** `msdyn_agreement` requires `msdyn_pricelist`. The loader resolves the first active `pricelevel` in your org, and if none exists it auto-creates a demo price list (\"FSDL Demo Price List\") tied to the org's base currency. Resolves *“The price list must be set.”*",
      "**Auto-created price lists are tracked** so per-run delete removes them after the agreements that referenced them.",
      "**Clearer failure path:** if no currency exists either, generation stops up-front with a precise message instead of a generic 400.",
    ],
  },
  {
    version: "v1.19.0",
    date: "April 30, 2026",
    tag: "FEATURE",
    features: [
      "**Per-run record breakdown on the Reset page.** Click any load to expand a full inventory of what it created — territories, work order types, incident types, products, accounts, resources, functional locations, customer assets, agreements, work orders, bookings, IoT alerts, and more.",
      "**Export & Import runs.** Download your run history as JSON and restore it on another device (or browser) with one click. Useful for moving the cleanup record after demos or sharing across a team.",
      "**Clearer storage docs in the UI.** New explainer states exactly where runs live (`localStorage` under `fsdl:runs:<org>`), that the 25 newest are kept, and how to back them up.",
      "**Agreement create fix:** `msdyn_systemstatus` now uses `690970000` (Estimate) instead of the wrong `192350000`, matching this org's accepted values.",
    ],
  },
  {
    version: "v1.18.14",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Lowercased every wrong-cased nav-property binding** flagged by Dataverse \u2014 Agreement, WorkOrder, WorkOrderProduct/Service/ServiceTask, AgreementBookingSetup/Incident/Product, ResourceTerritory, and Warehouse all now use the lowercase nav-prop names verified against `$metadata`. Functional Location, Customer Asset, IoT Alert and Parent Functional Location keep the Pascal casing the schema actually uses.",
    ],
  },
  {
    version: "v1.18.13",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Customer Asset create no longer sends `msdyn_description` or `msdyn_serialnumber`** — neither column exists on `msdyn_customerasset` in this org. Serial numbers now go into `msdyn_assettag` (the standard FS asset identifier).",
    ],
  },
  {
    version: "v1.18.12",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Functional Location create no longer sends `msdyn_description`** — the column doesn't exist on `msdyn_functionallocation` (verified via `$metadata`). Dropped from the payload.",
    ],
  },
  {
    version: "v1.18.11",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Functional Locations / Customer Assets / IoT Alerts now create cleanly.** Verified nav-property casing against `$metadata`: dropped the bogus `msdyn_Account` binding on Functional Locations (it's a many-to-many, not a lookup), switched Customer Assets to lowercase `msdyn_account` / `msdyn_product` plus the correct self-ref nav `msdyn_parentasset_msdyn_customerasset`, and dropped the unsupported account binding on IoT Alerts.",
    ],
  },
  {
    version: "v1.18.10",
    date: "April 30, 2026",
    tag: "COPY",
    features: [
      "**“Sandbox” → “demo org”** in user-facing copy on Landing and Dashboard.",
    ],
  },
  {
    version: "v1.18.9",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Bookable resource create now sets a default `timezone`.** Required field on this Dataverse schema; defaults to `4` (Pacific Time, US & Canada). No UI needed — picking a per-resource timezone or work-hour calendar is overkill for demo data.",
    ],
  },
  {
    version: "v1.18.8",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Bookable resource create no longer 400s.** `bookableresource` has no `description` column on this org's schema — verified via `$metadata`. Removed the field from the create payload; primary skill / territory still get linked through `bookableresourcecharacteristic` and `msdyn_resourceterritory`.",
    ],
  },
  {
    version: "v1.18.7",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Product create UoM bind names corrected (third try, verified against `$metadata`).** The single-valued navigation properties on `product` are lowercase `defaultuomid` and `defaultuomscheduleid` on this org.",
    ],
  },
  {
    version: "v1.18.6",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Product create now uses the correct nav-property names** — `DefaultUoMScheduleId` + `DefaultUoMId` instead of `DefaultUoMSchedule`/`DefaultUoM`. Resolves the “undeclared property 'DefaultUoMSchedule'” 400.",
    ],
  },
  {
    version: "v1.18.5",
    date: "April 30, 2026",
    tag: "RESET",
    features: [
      "**Refresh button on the Reset page.** Click it after a Generate run completes (or fails) to pull the latest run history from this device without reloading the app.",
    ],
  },
  {
    version: "v1.18.4",
    date: "April 30, 2026",
    tag: "FIX",
    features: [
      "**Products no longer fail with “unit schedule id is missing.”** Now resolves the org's first `uomschedule` + a unit under it and binds them as `DefaultUoMSchedule` + `DefaultUoM` on every product create.",
    ],
  },
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
