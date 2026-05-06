import { useMemo, useState } from "react";
import { CaretDown, CaretRight, Sparkle, MapPin, Clock } from "@phosphor-icons/react";
import type { PickedEntity } from "@/components/EntityPicker";
import {
  HOURS_PRESETS,
  type HoursPresetKey,
  type ResourceConfig,
} from "@/lib/fs/seed-config";
import type { FsPreset } from "@/lib/preset";

interface Props {
  /** Resources the user picked in the EntityPicker (existing-mode). */
  picks: PickedEntity[];
  /** Active preset — supplies the characteristic + territory option lists. */
  preset: FsPreset;
  /** Map of resourceId → ResourceConfig. */
  value: Record<string, ResourceConfig>;
  /** Replace the full configs map (caller persists). */
  onChange: (next: Record<string, ResourceConfig>) => void;
}

/**
 * Per-resource configuration UI for "use existing" Bookable Resources.
 * Renders one collapsible card per picked resource with:
 *  - multi-select chips of preset characteristics
 *  - dropdown of preset territories
 *  - dropdown of named hours presets
 *
 * Un-configured resources fall through to the seeder's historical defaults
 * (preset-tech name match, else random char + random territory + Mon–Fri
 * 8a–5p Pacific). v1.42.5.
 */
export function ResourceConfigPanel({ picks, preset, value, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const characteristics = preset.characteristics ?? [];
  const territories = preset.territories ?? [];

  const hoursOptions = useMemo(
    () =>
      (Object.entries(HOURS_PRESETS) as Array<[HoursPresetKey, typeof HOURS_PRESETS[HoursPresetKey]]>).map(
        ([key, p]) => ({ key, label: p.label }),
      ),
    [],
  );

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function patch(resourceId: string, p: Partial<ResourceConfig>) {
    const cur = value[resourceId] ?? {};
    onChange({ ...value, [resourceId]: { ...cur, ...p } });
  }

  function toggleChar(resourceId: string, name: string) {
    const cur = value[resourceId]?.characteristicNames;
    const set = new Set(cur ?? []);
    if (set.has(name)) set.delete(name);
    else set.add(name);
    patch(resourceId, { characteristicNames: Array.from(set) });
  }

  function summarize(resourceId: string): string {
    const cfg = value[resourceId];
    if (!cfg) return "Defaults";
    const parts: string[] = [];
    if (cfg.characteristicNames !== undefined) {
      parts.push(
        cfg.characteristicNames.length === 0
          ? "no chars"
          : `${cfg.characteristicNames.length} char${cfg.characteristicNames.length === 1 ? "" : "s"}`,
      );
    }
    if (cfg.territoryCode) {
      const t = territories.find((tt) => tt.code === cfg.territoryCode);
      parts.push(`territory: ${t?.code ?? cfg.territoryCode}`);
    }
    if (cfg.hoursPreset && cfg.hoursPreset !== "default") {
      parts.push(`hours: ${HOURS_PRESETS[cfg.hoursPreset].label}`);
    }
    return parts.length > 0 ? parts.join(" · ") : "Defaults";
  }

  if (picks.length === 0) return null;

  return (
    <div className="mt-3 space-y-1.5">
      <div className="text-[11px] uppercase tracking-wide text-muted px-1">
        Per-resource configuration ({picks.length})
      </div>
      {picks.map((p) => {
        const isOpen = expanded.has(p.id);
        const cfg = value[p.id] ?? {};
        const charNames = new Set(cfg.characteristicNames ?? []);
        const hoursKey: HoursPresetKey = cfg.hoursPreset ?? "default";
        return (
          <div
            key={p.id}
            className="border border-border rounded-md bg-bg-elevated/40"
          >
            <button
              type="button"
              onClick={() => toggleExpanded(p.id)}
              className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-bg-elevated/60"
            >
              {isOpen ? (
                <CaretDown size={14} className="text-muted flex-shrink-0" />
              ) : (
                <CaretRight size={14} className="text-muted flex-shrink-0" />
              )}
              <span className="flex-1 text-white truncate">{p.name}</span>
              <span className="text-[10px] text-muted flex-shrink-0">
                {summarize(p.id)}
              </span>
            </button>
            {isOpen && (
              <div className="px-3 py-3 space-y-3 border-t border-border">
                {/* Characteristics */}
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted mb-1.5">
                    <Sparkle size={12} weight="fill" className="text-accent" />
                    Characteristics
                  </div>
                  {characteristics.length === 0 ? (
                    <div className="text-xs text-muted">
                      Preset has no characteristics. Configure them at the
                      Characteristics row above.
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-1.5">
                      {characteristics.map((c) => {
                        const checked = charNames.has(c.name);
                        return (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => toggleChar(p.id, c.name)}
                            title={c.description}
                            className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                              checked
                                ? "bg-accent/20 border-accent/60 text-white"
                                : "bg-transparent border-border text-muted hover:text-white hover:border-border-strong"
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                  {cfg.characteristicNames === undefined && (
                    <div className="text-[10px] text-muted mt-1.5 italic">
                      Tip: pick chips above to override. Otherwise the seeder
                      matches by name to the preset techs (or picks one at
                      random).
                    </div>
                  )}
                </div>
                {/* Territory */}
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted mb-1.5">
                    <MapPin size={12} weight="fill" className="text-accent" />
                    Territory
                  </div>
                  <select
                    aria-label={`Territory for ${p.name}`}
                    value={cfg.territoryCode ?? ""}
                    onChange={(e) =>
                      patch(p.id, { territoryCode: e.target.value || undefined })
                    }
                    className="w-full bg-bg border border-border rounded-md px-2 py-1 text-xs text-white"
                  >
                    <option value="">Default (preset-driven)</option>
                    {territories.map((t) => (
                      <option key={t.code} value={t.code}>
                        {t.name} ({t.code})
                      </option>
                    ))}
                  </select>
                </div>
                {/* Hours */}
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted mb-1.5">
                    <Clock size={12} weight="fill" className="text-accent" />
                    Working hours
                  </div>
                  <select
                    aria-label={`Working hours for ${p.name}`}
                    value={hoursKey}
                    onChange={(e) =>
                      patch(p.id, {
                        hoursPreset: e.target.value as HoursPresetKey,
                      })
                    }
                    className="w-full bg-bg border border-border rounded-md px-2 py-1 text-xs text-white"
                  >
                    {hoursOptions.map((o) => (
                      <option key={o.key} value={o.key}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
