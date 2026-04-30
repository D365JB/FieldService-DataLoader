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
  resourceIds: Record<string, string>;
  workOrderIds: string[];
  bookingIds: string[];
}

type ProgressFn = (p: SeedProgress) => void;

/**
 * Resource sourcing for the bookable-resource step. Default is "create" which
 * builds Equipment-type resources from `preset.sampleTechnicians`. Pass
 * `mode: "existing"` plus a list of resource IDs already in the org and the
 * seeder will skip creation and use those for booking work orders instead.
 */
export interface SeedOptions {
  resources?:
    | { mode: "create" }
    | {
        mode: "existing";
        existing: Array<{
          id: string;
          name: string;
          /** Optional territory code from the preset to bind to. */
          territoryCode?: string;
          /** Optional characteristic name from the preset to bind to. */
          primarySkill?: string;
        }>;
        /**
         * If true, also create the preset's technicians in addition to the
         * existing ones. Default false (existing only).
         */
        alsoCreateFromPreset?: boolean;
      };
}

function tag(description?: string): string {
  return `${DEMO_TAG}: ${description ?? ""}`.trim();
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
    workOrderIds: [],
    bookingIds: [],
  };

  // ── Territories ──────────────────────────────────────────────────────────
  onProgress({ step: "Territories", done: 0, total: preset.territories.length });
  for (let i = 0; i < preset.territories.length; i++) {
    const t = preset.territories[i];
    const existing = await findByField(dv, "territories", "name", t.name, "territoryid");
    if (existing) {
      result.territoryIds[t.code] = existing;
    } else {
      const id = await dv.create("territories", {
        name: t.name,
        description: tag(t.description),
      });
      result.territoryIds[t.code] = id;
    }
    onProgress({
      step: "Territories",
      done: i + 1,
      total: preset.territories.length,
      detail: t.name,
    });
  }

  // ── Work Order Types ─────────────────────────────────────────────────────
  onProgress({
    step: "Work Order Types",
    done: 0,
    total: preset.workOrderTypes.length,
  });
  for (let i = 0; i < preset.workOrderTypes.length; i++) {
    const wt = preset.workOrderTypes[i];
    const existing = await findByField(
      dv,
      "msdyn_workordertypes",
      "msdyn_name",
      wt.name,
      "msdyn_workordertypeid",
    );
    if (existing) {
      result.workOrderTypeIds[wt.code] = existing;
    } else {
      const id = await dv.create("msdyn_workordertypes", {
        msdyn_name: wt.name,
        msdyn_description: tag(wt.description),
      });
      result.workOrderTypeIds[wt.code] = id;
    }
    onProgress({
      step: "Work Order Types",
      done: i + 1,
      total: preset.workOrderTypes.length,
      detail: wt.name,
    });
  }

  // ── Characteristics ──────────────────────────────────────────────────────
  onProgress({
    step: "Characteristics",
    done: 0,
    total: preset.characteristics.length,
  });
  for (let i = 0; i < preset.characteristics.length; i++) {
    const c = preset.characteristics[i];
    const existing = await findByField(
      dv,
      "characteristics",
      "name",
      c.name,
      "characteristicid",
    );
    if (existing) {
      result.characteristicIds[c.name] = existing;
    } else {
      const id = await dv.create("characteristics", {
        name: c.name,
        description: tag(c.description),
        // 1 = Skill (most common for FS demo certifications)
        characteristictype: 1,
      });
      result.characteristicIds[c.name] = id;
    }
    onProgress({
      step: "Characteristics",
      done: i + 1,
      total: preset.characteristics.length,
      detail: c.name,
    });
  }

  // ── Incident Types + Service Tasks ───────────────────────────────────────
  const totalIncidents = preset.incidentTypes.length;
  onProgress({ step: "Incident Types", done: 0, total: totalIncidents });
  for (let i = 0; i < totalIncidents; i++) {
    const inc = preset.incidentTypes[i];
    let incidentId = await findByField(
      dv,
      "msdyn_incidenttypes",
      "msdyn_name",
      inc.name,
      "msdyn_incidenttypeid",
    );
    if (!incidentId) {
      incidentId = await dv.create("msdyn_incidenttypes", {
        msdyn_name: inc.name,
        msdyn_description: tag(inc.description),
        msdyn_estimatedduration: inc.estimatedDurationMinutes,
      });
    }
    result.incidentTypeIds[inc.name] = incidentId;

    // Child service tasks — link via @odata.bind on the incident lookup.
    for (let j = 0; j < inc.serviceTasks.length; j++) {
      const taskName = inc.serviceTasks[j];
      const taskFilter = `msdyn_name eq '${oencode(taskName)}' and _msdyn_incidenttype_value eq ${incidentId}`;
      const existing = await dv.query<{ msdyn_incidenttypeservicetaskid: string }>(
        "msdyn_incidenttypeservicetasks",
        {
          filter: taskFilter,
          select: ["msdyn_incidenttypeservicetaskid"],
          top: 1,
        },
      );
      if (!existing[0]) {
        await dv.create("msdyn_incidenttypeservicetasks", {
          msdyn_name: taskName,
          msdyn_description: tag(),
          "msdyn_IncidentType@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
        });
      }
    }

    onProgress({
      step: "Incident Types",
      done: i + 1,
      total: totalIncidents,
      detail: `${inc.name} (${inc.serviceTasks.length} tasks)`,
    });
  }

  // ── Products ─────────────────────────────────────────────────────────────
  onProgress({ step: "Products", done: 0, total: preset.products.length });
  for (let i = 0; i < preset.products.length; i++) {
    const p = preset.products[i];
    // productnumber is a default alternate key on product — we can use upsert.
    const existing = await findByField(
      dv,
      "products",
      "productnumber",
      p.productNumber,
      "productid",
    );
    if (existing) {
      result.productIds[p.productNumber] = existing;
    } else {
      const id = await dv.create("products", {
        name: p.name,
        productnumber: p.productNumber,
        description: tag(p.description),
        price: p.listPrice ?? 0,
        // Sensible defaults to avoid required-field rejections:
        productstructure: 1, // Product
        statecode: 0, // Draft (cannot create as Active without a price list)
      });
      result.productIds[p.productNumber] = id;
    }
    onProgress({
      step: "Products",
      done: i + 1,
      total: preset.products.length,
      detail: p.name,
    });
  }

  // ── Accounts ─────────────────────────────────────────────────────────────
  const accounts = preset.sampleAccounts ?? [];
  onProgress({ step: "Accounts", done: 0, total: accounts.length });
  for (let i = 0; i < accounts.length; i++) {
    const a = accounts[i];
    const existing = await findByField(dv, "accounts", "name", a.name, "accountid");
    if (existing) {
      result.accountIds[a.name] = existing;
    } else {
      const id = await dv.create("accounts", {
        name: a.name,
        description: tag(a.siteDescription),
        address1_city: a.city,
        address1_stateorprovince: a.state,
        address1_country: "United States",
      });
      result.accountIds[a.name] = id;
    }
    onProgress({
      step: "Accounts",
      done: i + 1,
      total: accounts.length,
      detail: a.name,
    });
  }

  // ── Bookable Resources (Equipment-type, no admin needed) ─────────────────
  const existingResources =
    options.resources?.mode === "existing" ? options.resources.existing : [];
  const alsoCreate =
    options.resources?.mode === "existing"
      ? options.resources.alsoCreateFromPreset === true
      : true;

  // First, register any existing resources the caller pre-selected. We optionally
  // bind their primary skill / territory so bookings + Schedule Assistant
  // continue to work the same as freshly-created technicians.
  if (existingResources.length > 0) {
    onProgress({
      step: "Bookable Resources",
      done: 0,
      total: existingResources.length,
    });
    for (let i = 0; i < existingResources.length; i++) {
      const r = existingResources[i];
      result.resourceIds[r.name] = r.id;

      // Best-effort skill link.
      if (r.primarySkill) {
        const charId = result.characteristicIds[r.primarySkill];
        if (charId) {
          try {
            // Avoid duplicating the link if it already exists.
            const dup = await dv.query<{
              bookableresourcecharacteristicid: string;
            }>("bookableresourcecharacteristics", {
              filter: `_resource_value eq ${r.id} and _characteristic_value eq ${charId}`,
              select: ["bookableresourcecharacteristicid"],
              top: 1,
            });
            if (!dup[0]) {
              await dv.create("bookableresourcecharacteristics", {
                "Resource@odata.bind": `/bookableresources(${r.id})`,
                "Characteristic@odata.bind": `/characteristics(${charId})`,
              });
            }
          } catch {
            /* skill linking is non-critical */
          }
        }
      }

      // Best-effort territory link.
      if (r.territoryCode) {
        const terrId = result.territoryIds[r.territoryCode];
        if (terrId) {
          try {
            const dup = await dv.query<{ msdyn_resourceterritoryid: string }>(
              "msdyn_resourceterritories",
              {
                filter: `_msdyn_resource_value eq ${r.id} and _msdyn_territory_value eq ${terrId}`,
                select: ["msdyn_resourceterritoryid"],
                top: 1,
              },
            );
            if (!dup[0]) {
              await dv.create("msdyn_resourceterritories", {
                "msdyn_Resource@odata.bind": `/bookableresources(${r.id})`,
                "msdyn_Territory@odata.bind": `/territories(${terrId})`,
                msdyn_description: tag(),
              });
            }
          } catch {
            /* territory linking is non-critical */
          }
        }
      }

      onProgress({
        step: "Bookable Resources",
        done: i + 1,
        total: existingResources.length,
        detail: `${r.name} (existing)`,
      });
    }
  }

  // Then, optionally also create the preset's technicians as Equipment resources.
  const techs = alsoCreate ? preset.sampleTechnicians ?? [] : [];
  const totalResources = existingResources.length + techs.length;
  if (techs.length > 0 || existingResources.length === 0) {
    onProgress({
      step: "Bookable Resources",
      done: existingResources.length,
      total: totalResources,
    });
  }
  for (let i = 0; i < techs.length; i++) {
    const t = techs[i];
    let resourceId = await findByField(
      dv,
      "bookableresources",
      "name",
      t.name,
      "bookableresourceid",
    );
    if (!resourceId) {
      resourceId = await dv.create("bookableresources", {
        name: t.name,
        description: tag(`Technician — ${t.primarySkill} (${t.primaryTerritoryCode})`),
        // 4 = Equipment. We use this so we don't need to create a systemuser.
        resourcetype: 4,
      });

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
    }
    result.resourceIds[t.name] = resourceId;
    onProgress({
      step: "Bookable Resources",
      done: existingResources.length + i + 1,
      total: totalResources,
      detail: t.name,
    });
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
  const targetWoCount =
    accountIdList.length > 0 && incidentIdList.length > 0 && woTypeIdList.length > 0
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
        woId = await dv.create("msdyn_workorders", {
          msdyn_workordersummary: summary,
          msdyn_systemstatus: status,
          "msdyn_ServiceAccount@odata.bind": `/accounts(${accountId})`,
          "msdyn_BillingAccount@odata.bind": `/accounts(${accountId})`,
          "msdyn_WorkOrderType@odata.bind": `/msdyn_workordertypes(${woTypeId})`,
          "msdyn_PrimaryIncidentType@odata.bind": `/msdyn_incidenttypes(${incidentId})`,
        });
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

  // ── Bookings (one per Scheduled WO) ──────────────────────────────────────
  // Bookings populate the schedule board. We only book WOs that we set to
  // Scheduled status above, and we spread them across the next 5 business days.
  const resourceIdList = Object.values(result.resourceIds);
  let bookingTarget = 0;
  if (scheduledWoIds.length > 0 && resourceIdList.length > 0) {
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
  // Work-order-level associations next.
  await sweep(
    "Work Orders",
    "msdyn_workorders",
    "msdyn_workorderid",
    "msdyn_workordersummary",
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
