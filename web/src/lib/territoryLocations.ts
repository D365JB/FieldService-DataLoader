// Per-org persistence for "which metro should each territory anchor to?"
// Stored in localStorage so re-runs keep the same map layout.

const KEY_PREFIX = "fsdl:territoryLocations:";

/** territoryCode -> metroId */
export type TerritoryLocationMap = Record<string, string>;

function keyFor(orgUrl: string): string {
  return `${KEY_PREFIX}${orgUrl.replace(/\/+$/, "").toLowerCase()}`;
}

export const territoryLocations = {
  load(orgUrl: string): TerritoryLocationMap {
    try {
      const raw = localStorage.getItem(keyFor(orgUrl));
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? (parsed as TerritoryLocationMap) : {};
    } catch {
      return {};
    }
  },
  save(orgUrl: string, map: TerritoryLocationMap): void {
    try {
      localStorage.setItem(keyFor(orgUrl), JSON.stringify(map));
    } catch {
      /* quota — ignore, the map will just not persist this time */
    }
  },
};
