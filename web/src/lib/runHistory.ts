/**
 * Persisted history of `seedFromPreset` runs, keyed per Dataverse org URL.
 *
 * Each entry stores the timestamp, the company name from the preset, totals
 * for quick display, and the full id-set returned by the seeder so the Reset
 * page can delete a single run by id (more precise than the global tag-sweep).
 */
import type { SeedResult } from "./fs/seed-config";

const KEY_PREFIX = "fsdl:runs:";
const MAX_PER_ORG = 25;

export interface RunRecord {
  id: string;
  timestamp: string; // ISO
  orgUrl: string;
  companyName: string;
  totals: {
    territories: number;
    workOrderTypes: number;
    incidentTypes: number;
    characteristics: number;
    products: number;
    accounts: number;
    resources: number;
    workOrders: number;
    bookings: number;
  };
  result: SeedResult;
}

function keyFor(orgUrl: string): string {
  return KEY_PREFIX + orgUrl.replace(/\/+$/, "").toLowerCase();
}

function uuid(): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }
  return `r${Date.now()}${Math.random().toString(16).slice(2, 8)}`;
}

export const runHistory = {
  list(orgUrl: string): RunRecord[] {
    if (!orgUrl) return [];
    try {
      const raw = localStorage.getItem(keyFor(orgUrl));
      if (!raw) return [];
      const arr = JSON.parse(raw) as RunRecord[];
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  },

  add(
    orgUrl: string,
    companyName: string,
    result: SeedResult,
  ): RunRecord {
    const record: RunRecord = {
      id: uuid(),
      timestamp: new Date().toISOString(),
      orgUrl,
      companyName,
      totals: {
        territories: Object.keys(result.territoryIds).length,
        workOrderTypes: Object.keys(result.workOrderTypeIds).length,
        incidentTypes: Object.keys(result.incidentTypeIds).length,
        characteristics: Object.keys(result.characteristicIds).length,
        products: Object.keys(result.productIds).length,
        accounts: Object.keys(result.accountIds).length,
        resources: Object.keys(result.resourceIds).length,
        workOrders: result.workOrderIds.length,
        bookings: result.bookingIds.length,
      },
      result,
    };
    const next = [record, ...runHistory.list(orgUrl)].slice(0, MAX_PER_ORG);
    try {
      localStorage.setItem(keyFor(orgUrl), JSON.stringify(next));
    } catch {
      /* storage quota — drop silently */
    }
    return record;
  },

  remove(orgUrl: string, id: string): void {
    const next = runHistory.list(orgUrl).filter((r) => r.id !== id);
    try {
      localStorage.setItem(keyFor(orgUrl), JSON.stringify(next));
    } catch {
      /* ignore */
    }
  },

  /**
   * Replace the result + recompute totals for an existing run record. Used
   * after a partial delete so the history reflects what's left in Dataverse.
   * No-op if the run isn't found.
   */
  update(orgUrl: string, id: string, result: SeedResult): void {
    const list = runHistory.list(orgUrl);
    const idx = list.findIndex((r) => r.id === id);
    if (idx === -1) return;
    const totals: RunRecord["totals"] = {
      territories: Object.keys(result.territoryIds).length,
      workOrderTypes: Object.keys(result.workOrderTypeIds).length,
      incidentTypes: Object.keys(result.incidentTypeIds).length,
      characteristics: Object.keys(result.characteristicIds).length,
      products: Object.keys(result.productIds).length,
      accounts: Object.keys(result.accountIds).length,
      resources: Object.keys(result.resourceIds).length,
      workOrders: result.workOrderIds.length,
      bookings: result.bookingIds.length,
    };
    list[idx] = { ...list[idx], result, totals };
    try {
      localStorage.setItem(keyFor(orgUrl), JSON.stringify(list));
    } catch {
      /* ignore */
    }
  },

  clear(orgUrl: string): void {
    try {
      localStorage.removeItem(keyFor(orgUrl));
    } catch {
      /* ignore */
    }
  },
};
