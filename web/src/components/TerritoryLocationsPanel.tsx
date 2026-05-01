import { useEffect, useMemo } from "react";
import { MapPin } from "@phosphor-icons/react";
import { METROS, autoMatchMetro } from "@/lib/fs/metros";
import { territoryLocations, type TerritoryLocationMap } from "@/lib/territoryLocations";

interface Props {
  orgUrl: string;
  territories: Array<{ name: string; code: string; description?: string }>;
  value: TerritoryLocationMap;
  onChange: (next: TerritoryLocationMap) => void;
}

/**
 * Lets the user pick a US metro for each territory in the preset. Accounts
 * and technician home addresses are scattered inside the chosen metro so
 * pins look coherent on the schedule board map and FS can compute travel
 * time when Bing Maps is enabled on the org.
 */
export function TerritoryLocationsPanel({
  orgUrl,
  territories,
  value,
  onChange,
}: Props) {
  // Auto-match any territory that doesn't yet have a metro picked. We only
  // fill blanks — never override the user's choice.
  const autoMatched = useMemo(() => {
    const map: TerritoryLocationMap = { ...value };
    let changed = false;
    for (const t of territories) {
      if (!map[t.code]) {
        map[t.code] = autoMatchMetro(t.name, t.code).id;
        changed = true;
      }
    }
    return changed ? map : value;
  }, [territories, value]);

  // Persist + notify parent the first time we auto-match.
  useEffect(() => {
    if (autoMatched !== value) {
      onChange(autoMatched);
      territoryLocations.save(orgUrl, autoMatched);
    }
  }, [autoMatched, value, onChange, orgUrl]);

  function pick(code: string, metroId: string) {
    const next = { ...autoMatched, [code]: metroId };
    onChange(next);
    territoryLocations.save(orgUrl, next);
  }

  if (territories.length === 0) {
    return null;
  }

  return (
    <div className="card p-6 mb-6">
      <div className="flex items-center gap-2 mb-1">
        <MapPin size={18} weight="duotone" className="text-accent" />
        <h3 className="font-semibold text-white">Territory locations</h3>
      </div>
      <p className="text-xs text-muted mb-4">
        Pick the US metro each territory anchors to. Accounts and technician
        home addresses scatter randomly inside a 15-mile radius around the
        metro, so pins cluster sensibly on the FS schedule board.{" "}
        <span className="text-slate-400">
          Travel-time arrows on the board require <em>Field Service → Settings → Maps</em> to be set to <em>Bing Maps</em>.
        </span>
      </p>
      <div className="space-y-2">
        {territories.map((t) => {
          const selected = autoMatched[t.code];
          return (
            <div
              key={t.code}
              className="flex items-center gap-3 p-2 rounded-lg border border-border bg-bg-base/40"
            >
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-white truncate">
                  {t.name}
                </div>
                <div className="text-xs text-muted truncate">
                  Code: <code>{t.code}</code>
                  {t.description ? ` · ${t.description}` : ""}
                </div>
              </div>
              <select
                aria-label={`Metro for ${t.name}`}
                value={selected ?? ""}
                onChange={(e) => pick(t.code, e.target.value)}
                className="text-xs bg-bg-elevated border border-border hover:border-accent rounded-md px-2 py-1.5 text-white focus:outline-none focus:border-accent"
              >
                {METROS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          );
        })}
      </div>
    </div>
  );
}
