import { DataverseClient, oencode } from "@/lib/dataverse";
import type { FsPreset } from "@/lib/preset";

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
}

export interface EntityChoice {
  mode: "create" | "existing" | "skip";
  existing?: Array<{ id: string; name: string }>;
}

function tag(description?: string): string {
  // Historically prefixed every description with `${DEMO_TAG}:` so a tag-sweep
  // could find them. As of v1.6 we track every record id in run history
  // instead, so descriptions stay clean. The function is preserved (and the
  // DEMO_TAG export retained) so older history entries from v1.5 and earlier
  // can still be reset via the legacy tag-sweep.
  return (description ?? "").trim();
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
  cfg: EntityStepConfig<T>,
  onProgress: ProgressFn,
): Promise<void> {
  registerExisting(cfg.target, cfg.choice);
  const create = shouldCreate(cfg.choice);
  const total = create ? cfg.items.length : 0;
  onProgress({ step: cfg.label, done: 0, total });
  if (!create) return;

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
      id = await dv.create(cfg.entitySet, cfg.build(item));
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

export async function seedFromPreset(
  dv: DataverseClient,
  preset: FsPreset,
  onProgress: ProgressFn,
  options: SeedOptions = {},
): Promise<SeedResult> {
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
  };

  try {

  // ── Territories ──────────────────────────────────────────────────────────
  await runEntityStep(
    dv,
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
            await dv.create("msdyn_incidenttypeservicetasks", {
              msdyn_name: taskName,
              msdyn_description: tag(),
              "msdyn_incidenttype@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
            });
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
          const prod = await dv.retrieve<{
            name: string;
            _defaultuomid_value: string;
            msdyn_fieldserviceproducttype: number | null;
          }>("products", productId, [
            "name",
            "_defaultuomid_value",
            "msdyn_fieldserviceproducttype",
          ]);
          uomId = prod._defaultuomid_value ?? null;
          // FS plugin requires Inventory (690970000) or Non-Inventory (690970001)
          // before a product can be referenced by msdyn_incidenttypeproduct.
          // Patch any product missing it (e.g. seeded by v1.20.0/.1) up to
          // Non-Inventory so the link succeeds without a reset.
          if (
            prod.msdyn_fieldserviceproducttype !== 690970000 &&
            prod.msdyn_fieldserviceproducttype !== 690970001
          ) {
            await dv.update("products", productId, {
              msdyn_fieldserviceproducttype: 690970001,
            });
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
          id = await dv.create("msdyn_incidenttypeproducts", payload);
          trackCreated(result, "incidentTypeProducts", id);
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
      build: (a) => ({
        name: a.name,
        description: tag(a.siteDescription),
        address1_city: a.city,
        address1_stateorprovince: a.state,
        address1_country: "United States",
      }),
    },
    onProgress,
  );

  // ── Bookable Resources (Equipment-type, no admin needed) ─────────────────
  // We need post-create side-effects (track createdResourceIds, link primary
  // skill + territory) that only fire when we actually inserted the row, so we
  // use onCreated rather than onResolved.
  await runEntityStep(
    dv,
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
      build: (t) => ({
        name: t.name,
        // bookableresource has no `description` column on this org's schema.
        // 4 = Equipment. Avoids needing to create a systemuser.
        resourcetype: 4,
        // Required field on this org. 4 = Pacific Time (US & Canada).
        // Standard Windows TimeZoneCode; safe US default for demo data.
        timezone: 4,
      }),
      onCreated: async (resourceId, t) => {
        result.createdResourceIds.push(resourceId);

        // Best-effort: link primary skill via bookableresourcecharacteristic.
        const charId = result.characteristicIds[t.primarySkill];
        if (charId) {
          try {
            await dv.create("bookableresourcecharacteristics", {
              "Resource@odata.bind": `/bookableresources(${resourceId})`,
              "Characteristic@odata.bind": `/characteristics(${charId})`,
            });
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

  // ── Functional Locations (Phase 2) ───────────────────────────────────────
  // Hierarchical: each node may reference a parent node by name within the
  // same preset list. We rely on the AI / preset producer to list parents
  // before children. Cross-account references aren't allowed.
  const functionalLocations = preset.functionalLocations ?? [];
  const flMap = getIdMap(result, "functionalLocations");
  await runEntityStep(
    dv,
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
    },
    onProgress,
  );

  // ── Customer Assets (Phase 2) ───────────────────────────────────────────
  // Linked to account + optional functional location + optional product. Also
  // builds a side-index `assetsByAccount` so the WO step can wire one asset
  // per WO without an extra Dataverse query.
  const customerAssets = preset.customerAssets ?? [];
  const assetMap = getIdMap(result, "customerAssets");
  const assetsByAccount: Record<string, string[]> = {};
  await runEntityStep(
    dv,
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
      onResolved: (id, a) => {
        const accountId = result.accountIds[a.accountName];
        if (accountId) {
          (assetsByAccount[accountId] ??= []).push(id);
        }
      },
      onCreated: (id) => {
        trackCreated(result, "customerAssets", id);
      },
    },
    onProgress,
  );

  // ── Service Task Types (Phase 2) ────────────────────────────────────────
  // Reusable task catalog. WOs created later will randomly attach 2–4 of
  // these as msdyn_workorderservicetask rows.
  const serviceTaskTypes = preset.serviceTaskTypes ?? [];
  const taskTypeMap = getIdMap(result, "serviceTaskTypes");
  await runEntityStep(
    dv,
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
  const woStatusMix = [
    690970000, // Open-Unscheduled (weighted heavier — most common on a fresh demo)
    690970000,
    690970000,
    690970001, // Scheduled
    690970001,
    690970004, // Closed-Posted (historical)
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
      ? Math.min(accountIdList.length * 2, 24)
      : 0;
  // Work orders also require msdyn_pricelist in most FS configs. Resolve
  // (and auto-create if needed) BEFORE the loop so we don't silently fail
  // 16 times in a row.
  const woPriceListId =
    targetWoCount > 0 ? await ensurePriceList() : null;
  onProgress({ step: "Work Orders", done: 0, total: targetWoCount });
  const scheduledWoIds: string[] = [];
  // Per-WO metadata used by Phase 4 (WO Products + Time Entries) so we don't
  // need a second query pass.
  const woMeta: Array<{ woId: string; status: number; accountId: string }> = [];
  for (let i = 0; i < targetWoCount; i++) {
    const accountId = accountIdList[i % accountIdList.length];
    const incidentId = incidentIdList[i % incidentIdList.length];
    const woTypeId = woTypeIdList[i % woTypeIdList.length];
    const status = woStatusMix[i % woStatusMix.length];
    const summary = tag(`Auto-generated WO #${i + 1}`);

    // Idempotency: search by tagged summary so re-runs don't duplicate.
    const existing = await dv.query<{ msdyn_workorderid: string }>(
      "msdyn_workorders",
      {
        filter: `msdyn_workordersummary eq '${oencode(summary)}'`,
        select: ["msdyn_workorderid"],
        top: 1,
      },
    );
    let woId = existing[0]?.msdyn_workorderid;
    if (!woId) {
      const woPayload: Record<string, unknown> = {
        msdyn_workordersummary: summary,
        msdyn_systemstatus: status,
        "msdyn_serviceaccount@odata.bind": `/accounts(${accountId})`,
        "msdyn_billingaccount@odata.bind": `/accounts(${accountId})`,
        "msdyn_workordertype@odata.bind": `/msdyn_workordertypes(${woTypeId})`,
        "msdyn_primaryincidenttype@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
      };
      if (woPriceListId) {
        woPayload["msdyn_pricelist@odata.bind"] = `/pricelevels(${woPriceListId})`;
      }
      // Phase 2: attach a customer asset for this account if we have one.
      // Round-robin through the account's assets so multiple WOs against
      // the same account spread across different equipment.
      const accountAssets = assetsByAccount[accountId] ?? [];
      if (accountAssets.length > 0) {
        const assetId = accountAssets[i % accountAssets.length];
        woPayload["msdyn_customerasset@odata.bind"] =
          `/msdyn_customerassets(${assetId})`;
      }
      // Surface real failures instead of silently swallowing them — historically
      // the catch here marked all 16 WOs "complete" while none actually landed.
      woId = await dv.create("msdyn_workorders", woPayload);
    }
    result.workOrderIds.push(woId);
    trackCreated(result, "workOrders", woId);
    woMeta.push({ woId, status, accountId });
    if (status === 690970001) {
      scheduledWoIds.push(woId);
    }
    onProgress({
      step: "Work Orders",
      done: i + 1,
      total: targetWoCount,
      detail: `${summary} (${
        status === 690970004 ? "Closed" : status === 690970001 ? "Scheduled" : "Open"
      })`,
    });
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
    // Closed-Posted WOs (690970004) reject child rows with the FS plugin
    // error "A record can't be added to a work order that's been posted.".
    // Skip them here — Phase E of the roadmap will add lines BEFORE posting.
    const tasksWoMeta = woMeta.filter((m) => m.status !== 690970004);
    onProgress({
      step: "WO Service Tasks",
      done: 0,
      total: tasksWoMeta.length,
    });
    for (let i = 0; i < tasksWoMeta.length; i++) {
      const woId = tasksWoMeta[i].woId;
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
        const id = await dv.create("msdyn_workorderservicetasks", {
          msdyn_name: taskName,
          msdyn_description: tag(),
          "msdyn_workorder@odata.bind": `/msdyn_workorders(${woId})`,
          "msdyn_tasktype@odata.bind": `/msdyn_servicetasktypes(${taskTypeId})`,
        });
        trackCreated(result, "workOrderServiceTasks", id);
      }
      onProgress({
        step: "WO Service Tasks",
        done: i + 1,
        total: tasksWoMeta.length,
      });
    }
  }

  // ── Bookings (one per Scheduled WO) ──────────────────────────────────────
  // Bookings populate the schedule board. We only book WOs that we set to
  // Scheduled status above, and we spread them across the next 5 business days.
  const resourceIdList = Object.values(result.resourceIds);
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

  // Resolve "Scheduled" booking status once. Statecode=0 (Active) filters out
  // any inactive/customised duplicates.
  let scheduledStatusId: string | null = null;
  if (bookingTarget > 0) {
    try {
      const rows = await dv.query<{ bookingstatusid: string }>("bookingstatuses", {
        filter: "name eq 'Scheduled' and statecode eq 0",
        select: ["bookingstatusid"],
        top: 1,
      });
      scheduledStatusId = rows[0]?.bookingstatusid ?? null;
    } catch {
      scheduledStatusId = null;
    }
  }

  if (bookingTarget > 0 && scheduledStatusId) {
    // Spread bookings across business days starting tomorrow at 9am local.
    const baseStart = new Date();
    baseStart.setDate(baseStart.getDate() + 1);
    baseStart.setHours(9, 0, 0, 0);
    const slotHours = 2;
    const slotsPerDay = 4; // 9am, 11am, 1pm, 3pm

    // Batch-fetch every scheduled WO's auto-numbered name (e.g. "WO-01016") in
    // a single query. Per-WO lookups inside the loop sometimes returned empty
    // because the FS auto-number plugin can lag right after create — batching
    // after all WOs are committed gives the plugin time and only costs 1 call.
    const woNumberById: Record<string, string> = {};
    if (scheduledWoIds.length > 0) {
      try {
        const idFilter = scheduledWoIds
          .map((id) => `msdyn_workorderid eq ${id}`)
          .join(" or ");
        const rows = await dv.query<{
          msdyn_workorderid: string;
          msdyn_name: string;
        }>("msdyn_workorders", {
          filter: idFilter,
          select: ["msdyn_workorderid", "msdyn_name"],
          top: scheduledWoIds.length,
        });
        for (const r of rows) {
          if (r.msdyn_name) woNumberById[r.msdyn_workorderid] = r.msdyn_name;
        }
      } catch {
        /* fall back to synthetic name */
      }
    }

    for (let i = 0; i < scheduledWoIds.length; i++) {
      const woId = scheduledWoIds[i];
      const resourceId = resourceIdList[i % resourceIdList.length];
      const dayOffset = Math.floor(i / slotsPerDay);
      const slotInDay = i % slotsPerDay;
      const start = new Date(baseStart);
      start.setDate(start.getDate() + dayOffset);
      start.setHours(9 + slotInDay * slotHours);
      const end = new Date(start.getTime() + slotHours * 60 * 60 * 1000);
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
        try {
          bookingId = await dv.create("bookableresourcebookings", {
            name: bookingName,
            starttime: start.toISOString(),
            endtime: end.toISOString(),
            "Resource@odata.bind": `/bookableresources(${resourceId})`,
            "BookingStatus@odata.bind": `/bookingstatuses(${scheduledStatusId})`,
            "msdyn_workorder@odata.bind": `/msdyn_workorders(${woId})`,
          });
        } catch (e) {
          // FS booking validation can reject for many reasons (e.g. resource
          // type mismatch). Skip without breaking the rest of the seed.
          onProgress({
            step: "Bookings",
            done: i + 1,
            total: bookingTarget,
            detail: `Skipped (${(e as Error).message?.slice(0, 60) ?? "error"})`,
          });
          continue;
        }
      }
      result.bookingIds.push(bookingId);
      bookingMeta.push({ bookingId, woId, resourceId, start, end });
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
    for (const p of preset.products ?? []) {
      const id = result.productIds[p.productNumber];
      if (id) productNameById[id] = p.name;
    }
    // Closed-Posted WOs (690970004) reject child rows with the FS plugin
    // error "A record can't be added to a work order that's been posted.".
    // Skip them here — Phase E of the roadmap will add lines BEFORE posting.
    const productsWoMeta = woMeta.filter((m) => m.status !== 690970004);
    onProgress({
      step: "WO Products",
      done: 0,
      total: productsWoMeta.length,
    });
    for (let i = 0; i < productsWoMeta.length; i++) {
      const { woId, status } = productsWoMeta[i];
      const linesForThisWo = 1 + (i % 3); // 1, 2, or 3
      // Closed (690970004) → Used (690970001). Anything else → Estimated.
      const lineStatus = status === 690970004 ? 690970001 : 690970000;
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

        const lineId = await dv.create("msdyn_workorderproducts", {
          msdyn_name: lineName,
          msdyn_description: tag(),
          msdyn_linestatus: lineStatus,
          msdyn_estimatequantity: 1 + (j % 2),
          msdyn_quantity: lineStatus === 690970001 ? 1 + (j % 2) : 0,
          msdyn_lineorder: j + 1,
          "msdyn_workorder@odata.bind": `/msdyn_workorders(${woId})`,
          "msdyn_product@odata.bind": `/products(${productId})`,
        });
        trackCreated(result, "workOrderProducts", lineId);
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
      const { woId, resourceId, start, end } = bookingMeta[i];
      const durationMinutes = Math.max(
        1,
        Math.round((end.getTime() - start.getTime()) / 60000),
      );
      const entryName = tag(`Time entry for booking ${i + 1}`);

      const existing = await dv.query<{ msdyn_timeentryid: string }>(
        "msdyn_timeentries",
        {
          filter: `msdyn_description eq '${oencode(entryName)}'`,
          select: ["msdyn_timeentryid"],
          top: 1,
        },
      );
      if (existing[0]) {
        onProgress({
          step: "Time Entries",
          done: i + 1,
          total: bookingMeta.length,
        });
        continue;
      }

      try {
        const teId = await dv.create("msdyn_timeentries", {
          msdyn_description: entryName,
          msdyn_start: start.toISOString(),
          msdyn_end: end.toISOString(),
          msdyn_duration: durationMinutes,
          // 192350000 = Work
          msdyn_type: 192350000,
          // 192350000 = Submitted
          msdyn_entrystatus: 192350000,
          "msdyn_bookableresource@odata.bind": `/bookableresources(${resourceId})`,
          "msdyn_workorder@odata.bind": `/msdyn_workorders(${woId})`,
        });
        trackCreated(result, "timeEntries", teId);
      } catch {
        /* per-row best effort — entity may not be enabled in this org */
      }
      onProgress({
        step: "Time Entries",
        done: i + 1,
        total: bookingMeta.length,
      });
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
        // Most alerts are still Active so the demo shows active issues to triage.
        const status =
          done % 5 === 4 ? 192350002 // Closed
            : done % 3 === 2 ? 192350001 // InProgress
              : 192350000; // Active

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
        if (!existing[0]) {
          try {
            const alertId = await dv.create("msdyn_iotalerts", {
              msdyn_description: description,
              msdyn_alerttoken: alertToken,
              msdyn_alerttime: alertTime.toISOString(),
              msdyn_alertdata: JSON.stringify({
                source: "DEMO-FS",
                severity: template.severity,
                message: template.message,
              }),
              msdyn_severity: template.severity,
              msdyn_iotalertstatus: status,
              // msdyn_iotalert has no Account lookup — relationship is
              // resolved via msdyn_CustomerAsset → msdyn_account. Verified via $metadata.
              "msdyn_CustomerAsset@odata.bind": `/msdyn_customerassets(${assetId})`,
            });
            trackCreated(result, "iotAlerts", alertId);
          } catch {
            /* IoT entity may not be enabled in this org — skip silently */
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
): Promise<{ deletedByEntity: Record<string, number> }> {
  const deleted: Record<string, number> = {};

  const sweepIds = async (
    label: string,
    entitySet: string,
    ids: string[],
  ): Promise<void> => {
    if (ids.length === 0) return;
    onProgress({ step: label, done: 0, total: ids.length });
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
      try {
        await dv.delete(entitySet, ids[i]);
        count++;
      } catch {
        /* swallow individual failures — record may already be gone */
      }
      onProgress({ step: label, done: i + 1, total: ids.length });
    }
    deleted[entitySet] = count;
  };

  // Children → parents.
  await sweepIds("Bookings", "bookableresourcebookings", result.bookingIds);

  // Phase 2 entries that reference WOs (e.g. WO Service Tasks) — must be
  // deleted before the WOs themselves.
  const handled = new Set<string>();
  if (result.createdIds) {
    for (const entry of phase2EntityOrder.filter((e) => e.phase === "beforeWo")) {
      const ids = result.createdIds[entry.key];
      if (ids?.length) {
        await sweepIds(entry.label, entry.entitySet, ids);
        handled.add(entry.key);
      }
    }
  }

  await sweepIds("Work Orders", "msdyn_workorders", result.workOrderIds);

  // Phase 2 entries that WOs reference (assets, locations, task types) — safe
  // to delete now that WOs are gone.
  if (result.createdIds) {
    for (const entry of phase2EntityOrder.filter((e) => e.phase === "afterWo")) {
      const ids = result.createdIds[entry.key];
      if (ids?.length) {
        await sweepIds(entry.label, entry.entitySet, ids);
        handled.add(entry.key);
      }
    }
    for (const [key, ids] of Object.entries(result.createdIds)) {
      if (handled.has(key)) continue;
      if (!ids?.length) continue;
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
  await sweepIds("Bookable Resources", "bookableresources", ourResourceIds);

  await sweepIds(
    "Incident Types",
    "msdyn_incidenttypes",
    Object.values(result.incidentTypeIds),
  );
  await sweepIds(
    "WO Types",
    "msdyn_workordertypes",
    Object.values(result.workOrderTypeIds),
  );
  await sweepIds(
    "Characteristics",
    "characteristics",
    Object.values(result.characteristicIds),
  );
  await sweepIds("Products", "products", Object.values(result.productIds));
  await sweepIds("Accounts", "accounts", Object.values(result.accountIds));
  await sweepIds(
    "Territories",
    "territories",
    Object.values(result.territoryIds),
  );

  return { deletedByEntity: deleted };
}
