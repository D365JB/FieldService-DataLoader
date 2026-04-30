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
  // Phase 2 — child-first delete order:
  { key: "workOrderServiceTasks", label: "WO Service Tasks", entitySet: "msdyn_workorderservicetasks", phase: "beforeWo" },
  { key: "customerAssets", label: "Customer Assets", entitySet: "msdyn_customerassets", phase: "afterWo" },
  { key: "functionalLocations", label: "Functional Locations", entitySet: "msdyn_functionallocations", phase: "afterWo" },
  { key: "serviceTaskTypes", label: "Service Task Types", entitySet: "msdyn_servicetasktypes", phase: "afterWo" },
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
        msdyn_description: tag(wt.description),
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
              "msdyn_IncidentType@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
            });
          }
        }
      },
    },
    onProgress,
  );

  // ── Products ─────────────────────────────────────────────────────────────
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
      build: (p) => ({
        name: p.name,
        productnumber: p.productNumber,
        description: tag(p.description),
        price: p.listPrice ?? 0,
        // Sensible defaults to avoid required-field rejections:
        productstructure: 1, // Product
        statecode: 0, // Draft (cannot create as Active without a price list).
      }),
    },
    onProgress,
  );

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
        description: tag(`Technician — ${t.primarySkill} (${t.primaryTerritoryCode})`),
        // 4 = Equipment. Avoids needing to create a systemuser.
        resourcetype: 4,
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
              "msdyn_Resource@odata.bind": `/bookableresources(${resourceId})`,
              "msdyn_Territory@odata.bind": `/territories(${terrId})`,
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
      // Phase 2 entities don't have a per-entity choice yet — we treat them
      // as "create" by default and skip if the preset section is empty.
      choice: undefined,
      target: flMap,
      entitySet: "msdyn_functionallocations",
      idField: "msdyn_functionallocationid",
      findField: "msdyn_name",
      findValue: (fl) => fl.name,
      mapKey: (fl) => fl.name,
      build: (fl) => {
        const accountId = result.accountIds[fl.accountName];
        const parentId = fl.parentName ? flMap[fl.parentName] : undefined;
        const payload: Record<string, unknown> = {
          msdyn_name: fl.name,
          msdyn_description: tag(fl.description),
        };
        if (accountId) {
          payload["msdyn_Account@odata.bind"] = `/accounts(${accountId})`;
        }
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
      choice: undefined,
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
          msdyn_description: tag(a.description),
        };
        if (a.serialNumber) {
          payload["msdyn_serialnumber"] = a.serialNumber;
        }
        if (accountId) {
          payload["msdyn_Account@odata.bind"] = `/accounts(${accountId})`;
        }
        if (productId) {
          payload["msdyn_Product@odata.bind"] = `/products(${productId})`;
        }
        if (flId) {
          payload["msdyn_FunctionalLocation@odata.bind"] =
            `/msdyn_functionallocations(${flId})`;
        }
        if (parentAssetId) {
          payload["msdyn_ParentAsset@odata.bind"] =
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
      choice: undefined,
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
  onProgress({ step: "Work Orders", done: 0, total: targetWoCount });
  const scheduledWoIds: string[] = [];
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
      try {
        const woPayload: Record<string, unknown> = {
          msdyn_workordersummary: summary,
          msdyn_systemstatus: status,
          "msdyn_ServiceAccount@odata.bind": `/accounts(${accountId})`,
          "msdyn_BillingAccount@odata.bind": `/accounts(${accountId})`,
          "msdyn_WorkOrderType@odata.bind": `/msdyn_workordertypes(${woTypeId})`,
          "msdyn_PrimaryIncidentType@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
        };
        // Phase 2: attach a customer asset for this account if we have one.
        // Round-robin through the account's assets so multiple WOs against
        // the same account spread across different equipment.
        const accountAssets = assetsByAccount[accountId] ?? [];
        if (accountAssets.length > 0) {
          const assetId = accountAssets[i % accountAssets.length];
          woPayload["msdyn_CustomerAsset@odata.bind"] =
            `/msdyn_customerassets(${assetId})`;
        }
        woId = await dv.create("msdyn_workorders", woPayload);
      } catch (e) {
        // Some FS configs require additional fields (price list, tax code). Skip
        // gracefully — the catalog is still seeded; just no WOs.
        onProgress({
          step: "Work Orders",
          done: i + 1,
          total: targetWoCount,
          detail: `Skipped (${(e as Error).message?.slice(0, 60) ?? "error"})`,
        });
        continue;
      }
    }
    result.workOrderIds.push(woId);
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
  if (taskTypeIds.length > 0 && result.workOrderIds.length > 0) {
    const tasksPerWo = Math.min(4, Math.max(2, Math.floor(taskTypeIds.length / 2)));
    onProgress({
      step: "WO Service Tasks",
      done: 0,
      total: result.workOrderIds.length,
    });
    for (let i = 0; i < result.workOrderIds.length; i++) {
      const woId = result.workOrderIds[i];
      for (let j = 0; j < tasksPerWo; j++) {
        const taskTypeId = taskTypeIds[(i + j) % taskTypeIds.length];
        const taskName = tag(`WO #${i + 1} task ${j + 1}`);
        // Idempotency: skip if a task with this synthetic name already exists
        // on this WO.
        const existing = await dv.query<{ msdyn_workorderservicetaskid: string }>(
          "msdyn_workorderservicetasks",
          {
            filter: `msdyn_name eq '${oencode(taskName)}' and _msdyn_workorder_value eq ${woId}`,
            select: ["msdyn_workorderservicetaskid"],
            top: 1,
          },
        );
        if (existing[0]) continue;
        try {
          const id = await dv.create("msdyn_workorderservicetasks", {
            msdyn_name: taskName,
            msdyn_description: tag(),
            "msdyn_WorkOrder@odata.bind": `/msdyn_workorders(${woId})`,
            "msdyn_TaskType@odata.bind": `/msdyn_servicetasktypes(${taskTypeId})`,
          });
          trackCreated(result, "workOrderServiceTasks", id);
        } catch {
          /* per-WO best effort — keep going */
        }
      }
      onProgress({
        step: "WO Service Tasks",
        done: i + 1,
        total: result.workOrderIds.length,
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

    for (let i = 0; i < scheduledWoIds.length; i++) {
      const woId = scheduledWoIds[i];
      const resourceId = resourceIdList[i % resourceIdList.length];
      const dayOffset = Math.floor(i / slotsPerDay);
      const slotInDay = i % slotsPerDay;
      const start = new Date(baseStart);
      start.setDate(start.getDate() + dayOffset);
      start.setHours(9 + slotInDay * slotHours);
      const end = new Date(start.getTime() + slotHours * 60 * 60 * 1000);
      const bookingName = tag(`Booking for WO #${result.workOrderIds.indexOf(woId) + 1}`);

      // Idempotency by tagged name.
      const existing = await dv.query<{ bookableresourcebookingid: string }>(
        "bookableresourcebookings",
        {
          filter: `name eq '${oencode(bookingName)}'`,
          select: ["bookableresourcebookingid"],
          top: 1,
        },
      );
      let bookingId = existing[0]?.bookableresourcebookingid;
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
      onProgress({
        step: "Bookings",
        done: i + 1,
        total: bookingTarget,
        detail: `${bookingName} → ${start.toLocaleDateString()}`,
      });
    }
  }

  return result;
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
  // Work-order-level associations next.
  await sweep(
    "Work Orders",
    "msdyn_workorders",
    "msdyn_workorderid",
    "msdyn_workordersummary",
  );
  // Phase 2 — assets / locations / task-type catalog (WOs referenced these).
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
