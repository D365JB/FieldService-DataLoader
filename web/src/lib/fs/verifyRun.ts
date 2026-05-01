// Reset-page state verifier. v1.41.6.
//
// For a given saved run, hits Dataverse once per tracked record id and
// returns a per-section breakdown of which ids are still present, which are
// already gone (404 / deleted), and which the request failed for. The Reset
// UI uses this to (a) confirm what a "Delete this run" will actually touch,
// (b) prune ids whose records have already been deleted out-of-band so the
// run's count badges stop lying.
//
// Concurrency: 8 parallel GETs. Dataverse will happily 429 a single client
// pegging it harder; the DataverseClient already retries those, but we keep
// the in-flight count modest so the Reset page UI stays responsive while a
// large run (hundreds of records) is being verified.

import type { DataverseClient } from "@/lib/dataverse";
import { buildResultSections, type ResultSection } from "./resultSections";
import type { SeedResult } from "./seed-config";

export type VerifyState = "present" | "missing" | "error";

export interface VerifyEntry {
  /** Friendly label from the original run (e.g. "WO #3"). */
  label: string;
  id: string;
  state: VerifyState;
  /** Populated only when state === "error". */
  errorMessage?: string;
}

export interface VerifySectionResult {
  title: string;
  entitySet: string;
  total: number;
  presentCount: number;
  missingCount: number;
  errorCount: number;
  entries: VerifyEntry[];
}

export interface VerifyRunResult {
  sections: VerifySectionResult[];
  totals: {
    total: number;
    present: number;
    missing: number;
    error: number;
  };
}

export interface VerifyProgress {
  /** 0..total — number of GETs completed so far. */
  completed: number;
  total: number;
  /** Currently-running section title, useful for status text. */
  currentSection?: string;
}

/** Single id GET; classifies result into present / missing / error. */
async function checkOne(
  dv: DataverseClient,
  entitySet: string,
  id: string,
): Promise<{ state: VerifyState; errorMessage?: string }> {
  try {
    const res = await dv.request(`/${entitySet}(${id})?$select=${primaryKeyFor(entitySet)}`);
    if (res.ok) return { state: "present" };
    // 404 is the canonical "deleted" response. 410/Gone shows up rarely.
    if (res.status === 404 || res.status === 410) return { state: "missing" };
    return {
      state: "error",
      errorMessage: `${res.status} ${res.statusText}`,
    };
  } catch (err) {
    return {
      state: "error",
      errorMessage: (err as Error).message,
    };
  }
}

/**
 * Best-effort primary-key column for a given entity set. Dataverse's pattern
 * is `{logicalname}id`, but `accounts`, `contacts`, `bookableresources`, and
 * a handful of OOB tables need explicit overrides because the entity-set
 * name is a pluralized human form, not a strict singular+id derivation.
 */
function primaryKeyFor(entitySet: string): string {
  const overrides: Record<string, string> = {
    accounts: "accountid",
    contacts: "contactid",
    territories: "territoryid",
    products: "productid",
    characteristics: "characteristicid",
    bookableresources: "bookableresourceid",
    bookableresourcebookings: "bookableresourcebookingid",
  };
  if (overrides[entitySet]) return overrides[entitySet];
  // For msdyn_* (and other custom) entity sets, strip a trailing 's' if the
  // set is plural. Dataverse plurals are simple: append 's' (msdyn_workorder
  // → msdyn_workorders). Edge cases with -ies/-es exist (msdyn_warehouses →
  // msdyn_warehouse) and are handled by the override map above when needed.
  const singular = entitySet.endsWith("s") ? entitySet.slice(0, -1) : entitySet;
  return `${singular}id`;
}

/**
 * Verify every id in a run against the live Dataverse environment.
 *
 * Entries that don't have a stable `entitySet` (e.g. associations exposed
 * only through createdIds with no GET endpoint) are skipped — verification
 * is best-effort, not exhaustive.
 */
export async function verifyRun(
  dv: DataverseClient,
  result: SeedResult,
  onProgress?: (p: VerifyProgress) => void,
): Promise<VerifyRunResult> {
  const sections: ResultSection[] = buildResultSections(result);
  const total = sections.reduce((acc, s) => acc + Object.keys(s.ids).length, 0);
  let completed = 0;
  const out: VerifySectionResult[] = [];

  for (const section of sections) {
    onProgress?.({ completed, total, currentSection: section.title });
    const idEntries = Object.entries(section.ids); // [label, id][]
    const entries: VerifyEntry[] = new Array(idEntries.length);
    const concurrency = 8;
    let cursor = 0;

    async function worker(): Promise<void> {
      while (true) {
        const i = cursor++;
        if (i >= idEntries.length) return;
        const [label, id] = idEntries[i];
        const r = await checkOne(dv, section.entitySet, id);
        entries[i] = {
          label,
          id,
          state: r.state,
          errorMessage: r.errorMessage,
        };
        completed++;
        onProgress?.({ completed, total, currentSection: section.title });
      }
    }

    await Promise.all(
      Array.from({ length: Math.min(concurrency, idEntries.length) }, () =>
        worker(),
      ),
    );

    const presentCount = entries.filter((e) => e.state === "present").length;
    const missingCount = entries.filter((e) => e.state === "missing").length;
    const errorCount = entries.filter((e) => e.state === "error").length;
    out.push({
      title: section.title,
      entitySet: section.entitySet,
      total: entries.length,
      presentCount,
      missingCount,
      errorCount,
      entries,
    });
  }

  return {
    sections: out,
    totals: {
      total,
      present: out.reduce((a, s) => a + s.presentCount, 0),
      missing: out.reduce((a, s) => a + s.missingCount, 0),
      error: out.reduce((a, s) => a + s.errorCount, 0),
    },
  };
}

/**
 * Build a pruned SeedResult that drops every id flagged as `missing` by a
 * verify run. Errors are kept (we can't be sure they're really gone). Used
 * by the Reset page's "Prune missing" button so the on-device history
 * matches reality after out-of-band deletions.
 */
export function prunePresentResult(
  result: SeedResult,
  verify: VerifyRunResult,
): SeedResult {
  const missingIdsByEntitySet = new Map<string, Set<string>>();
  for (const s of verify.sections) {
    if (s.missingCount === 0) continue;
    const set = new Set(
      s.entries.filter((e) => e.state === "missing").map((e) => e.id),
    );
    missingIdsByEntitySet.set(s.entitySet, set);
  }
  if (missingIdsByEntitySet.size === 0) return result;

  // The SeedResult shape mirrors buildResultSections: simple Record<string,
  // string> id maps + a few string[] lists. We rebuild only the ones that
  // had any missing ids, leaving the rest untouched.
  const next: SeedResult = { ...result };
  const dropFromMap = (
    entitySet: string,
    map: Record<string, string>,
  ): Record<string, string> => {
    const drop = missingIdsByEntitySet.get(entitySet);
    if (!drop) return map;
    return Object.fromEntries(
      Object.entries(map).filter(([, id]) => !drop.has(id)),
    );
  };
  const dropFromList = (entitySet: string, list: string[]): string[] => {
    const drop = missingIdsByEntitySet.get(entitySet);
    if (!drop) return list;
    return list.filter((id) => !drop.has(id));
  };

  next.territoryIds = dropFromMap("territories", result.territoryIds);
  next.workOrderTypeIds = dropFromMap("msdyn_workordertypes", result.workOrderTypeIds);
  next.incidentTypeIds = dropFromMap("msdyn_incidenttypes", result.incidentTypeIds);
  next.characteristicIds = dropFromMap("characteristics", result.characteristicIds);
  next.productIds = dropFromMap("products", result.productIds);
  next.accountIds = dropFromMap("accounts", result.accountIds);
  next.resourceIds = dropFromMap("bookableresources", result.resourceIds);
  next.workOrderIds = dropFromList("msdyn_workorders", result.workOrderIds);
  next.bookingIds = dropFromList("bookableresourcebookings", result.bookingIds);
  next.createdResourceIds = dropFromList(
    "bookableresources",
    result.createdResourceIds,
  );

  // idMaps are nested Record<string, Record<string, string>>. Each top-level
  // key has a known entity-set mapping; build it from buildResultSections so
  // there's a single source of truth.
  if (result.idMaps) {
    const idMapEntitySet: Record<string, string> = {
      incidentTypeProducts: "msdyn_incidenttypeproducts",
      technicianContacts: "contacts",
      functionalLocations: "msdyn_functionallocations",
      customerAssets: "msdyn_customerassets",
      serviceTaskTypes: "msdyn_servicetasktypes",
      agreements: "msdyn_agreements",
      agreementBookingSetups: "msdyn_agreementbookingsetups",
      agreementBookingIncidents: "msdyn_agreementbookingincidents",
      agreementBookingProducts: "msdyn_agreementbookingproducts",
      warehouses: "msdyn_warehouses",
      productInventory: "msdyn_productinventories",
      workOrderServiceTasks: "msdyn_workorderservicetasks",
      workOrderProducts: "msdyn_workorderproducts",
      timeEntries: "msdyn_timeentries",
      iotAlerts: "msdyn_iotalerts",
    };
    const nextIdMaps: typeof result.idMaps = {};
    for (const [k, map] of Object.entries(result.idMaps)) {
      const es = idMapEntitySet[k];
      nextIdMaps[k] = es ? dropFromMap(es, map) : map;
    }
    next.idMaps = nextIdMaps;
  }
  if (result.createdIds) {
    const createdIdsEntitySet: Record<string, string> = {
      priceLists: "pricelevels",
      productInventory: "msdyn_productinventories",
      workOrderServiceTasks: "msdyn_workorderservicetasks",
      workOrderProducts: "msdyn_workorderproducts",
      timeEntries: "msdyn_timeentries",
      iotAlerts: "msdyn_iotalerts",
    };
    const nextCreatedIds: typeof result.createdIds = {};
    for (const [k, list] of Object.entries(result.createdIds)) {
      const es = createdIdsEntitySet[k];
      nextCreatedIds[k] = es ? dropFromList(es, list) : list;
    }
    next.createdIds = nextCreatedIds;
  }

  return next;
}
