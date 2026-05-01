// Shared "what was created in this run" breakdown used by both the post-run
// summary on the Generate page AND the expandable detail on the Reset page.
// Returns sections with named, deep-linkable ids so users can click straight
// through to records in Dynamics.

import type { SeedResult } from "./seed-config";

export interface ResultSection {
  title: string;
  /** Dataverse entity set name for `deepLink()`. */
  entitySet: string;
  /** Map of friendly label -> record id. Empty maps are filtered out. */
  ids: Record<string, string>;
}

export function buildResultSections(result: SeedResult): ResultSection[] {
  const idMaps = result.idMaps ?? {};
  const createdIds = result.createdIds ?? {};
  const labels = result.labels ?? {};

  const fromIdMap = (key: string): Record<string, string> => {
    const map = idMaps[key] ?? {};
    const lbl = labels[key];
    if (!lbl) return map;
    const out: Record<string, string> = {};
    for (const [k, id] of Object.entries(map)) {
      out[lbl[id] ?? k] = id;
    }
    return out;
  };
  const fromCreatedIds = (key: string, label: string): Record<string, string> => {
    const ids = createdIds[key] ?? [];
    const lbl = labels[key] ?? {};
    return Object.fromEntries(
      ids.map((id, i) => [lbl[id] ?? `${label} #${i + 1}`, id]),
    );
  };
  const namedIdList = (
    ids: string[],
    key: string,
    label: string,
  ): Record<string, string> => {
    const lbl = labels[key] ?? {};
    return Object.fromEntries(
      ids.map((id, i) => [lbl[id] ?? `${label} #${i + 1}`, id]),
    );
  };

  const sections: ResultSection[] = [
    { title: "Territories", entitySet: "territories", ids: result.territoryIds },
    { title: "Work Order Types", entitySet: "msdyn_workordertypes", ids: result.workOrderTypeIds },
    { title: "Incident Types", entitySet: "msdyn_incidenttypes", ids: result.incidentTypeIds },
    { title: "Characteristics", entitySet: "characteristics", ids: result.characteristicIds },
    { title: "Products", entitySet: "products", ids: result.productIds },
    { title: "Incident Type Products", entitySet: "msdyn_incidenttypeproducts", ids: fromIdMap("incidentTypeProducts") },
    { title: "Accounts", entitySet: "accounts", ids: result.accountIds },
    { title: "Technician Contacts", entitySet: "contacts", ids: fromIdMap("technicianContacts") },
    { title: "Bookable Resources", entitySet: "bookableresources", ids: result.resourceIds },
    { title: "Functional Locations", entitySet: "msdyn_functionallocations", ids: fromIdMap("functionalLocations") },
    { title: "Customer Assets", entitySet: "msdyn_customerassets", ids: fromIdMap("customerAssets") },
    { title: "Service Task Types", entitySet: "msdyn_servicetasktypes", ids: fromIdMap("serviceTaskTypes") },
    { title: "Agreements", entitySet: "msdyn_agreements", ids: fromIdMap("agreements") },
    { title: "Warehouses", entitySet: "msdyn_warehouses", ids: fromIdMap("warehouses") },
    { title: "Product Inventory", entitySet: "msdyn_productinventories", ids: fromCreatedIds("productInventory", "Inventory") },
    {
      title: "Work Orders",
      entitySet: "msdyn_workorders",
      ids: namedIdList(result.workOrderIds, "workOrders", "WO"),
    },
    { title: "WO Service Tasks", entitySet: "msdyn_workorderservicetasks", ids: fromCreatedIds("workOrderServiceTasks", "Task") },
    {
      title: "Bookings",
      entitySet: "bookableresourcebookings",
      ids: namedIdList(result.bookingIds, "bookings", "Booking"),
    },
    { title: "WO Products", entitySet: "msdyn_workorderproducts", ids: fromCreatedIds("workOrderProducts", "Line") },
    { title: "Time Entries", entitySet: "msdyn_timeentries", ids: fromCreatedIds("timeEntries", "Entry") },
    { title: "IoT Alerts", entitySet: "msdyn_iotalerts", ids: fromCreatedIds("iotAlerts", "Alert") },
  ];
  return sections.filter((s) => Object.keys(s.ids).length > 0);
}
