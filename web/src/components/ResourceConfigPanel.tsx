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
 *  - dropdown of preset territories (the codes generated/synced this run)
 *  - dropdown of named hours presets, plus *each preset technician's
 *    schedule* (so an existing resource can adopt the same hours the seeder
 *    applies to a brand-new technician), plus a "Custom…" inline editor
 *    for ad-hoc days / hours / timezone.
 *
 * Un-configured resources fall through to the seeder's historical defaults
 * (preset-tech name match, else random char + random territory + Mon–Fri
 * 8a–5p Pacific). v1.42.6.
 */
export function ResourceConfigPanel({ picks, preset, value, onChange }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const characteristics = preset.characteristics ?? [];
  const territories = preset.territories ?? [];
  const techsWithHours = useMemo(
    () => (preset.sampleTechnicians ?? []).filter((t) => !!t?.name),
    [preset.sampleTechnicians],
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

  function describeHours(cfg: ResourceConfig | undefined): string | null {
    if (!cfg?.hoursPreset || cfg.hoursPreset === "default") return null;
    if (cfg.hoursPreset === "custom" && cfg.hoursCustom) {
      const d = cfg.hoursCustom;
      const days = d.days.length > 0 ? d.days.join("/") : "no days";
      return `Custom ${days} ${d.startHour}–${d.endHour} (TZ ${d.tz})`;
    }
    if (cfg.hoursPreset.startsWith("tech:")) {
      return `${cfg.hoursPreset.slice(5)}'s hours`;
    }
    if (cfg.hoursPreset in HOURS_PRESETS) {
      return HOURS_PRESETS[cfg.hoursPreset as HoursPresetKey].label;
    }
    return cfg.hoursPreset;
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
    const hoursLabel = describeHours(cfg);
    if (hoursLabel) parts.push(`hours: ${hoursLabel}`);
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
        const hoursValue = cfg.hoursPreset ?? "default";
        const isCustom = hoursValue === "custom";
        const customDefault: CustomHoursValue = {
          days: ["MO", "TU", "WE", "TH", "FR"],
          startHour: 8,
          endHour: 17,
          tz: 4,
        };
        const customCurrent = cfg.hoursCustom ?? customDefault;
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
                  <div className="text-[10px] text-muted mt-1 italic">
                    These are the territories the active preset
                    generates/syncs this run.
                  </div>
                </div>
                {/* Hours */}
                <div>
                  <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted mb-1.5">
                    <Clock size={12} weight="fill" className="text-accent" />
                    Working hours
                  </div>
                  <select
                    aria-label={`Working hours for ${p.name}`}
                    value={hoursValue}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "custom") {
                        patch(p.id, {
                          hoursPreset: "custom",
                          hoursCustom: cfg.hoursCustom ?? customDefault,
                        });
                      } else {
                        patch(p.id, { hoursPreset: v });
                      }
                    }}
                    className="w-full bg-bg border border-border rounded-md px-2 py-1 text-xs text-white"
                  >
                    <optgroup label="Named presets">
                      {(Object.entries(HOURS_PRESETS) as Array<
                        [HoursPresetKey, (typeof HOURS_PRESETS)[HoursPresetKey]]
                      >).map(([key, hp]) => (
                        <option key={key} value={key}>
                          {hp.label}
                        </option>
                      ))}
                    </optgroup>
                    {techsWithHours.length > 0 && (
                      <optgroup label="From sample technicians (preset)">
                        {techsWithHours.map((t) => {
                          const days = (t.workDays ?? ["MO", "TU", "WE", "TH", "FR"]).join("/");
                          const sH = typeof t.workStartHour === "number" ? t.workStartHour : 8;
                          const eH = typeof t.workEndHour === "number" ? t.workEndHour : 17;
                          return (
                            <option key={`tech:${t.name}`} value={`tech:${t.name}`}>
                              {t.name} — {days} {sH}–{eH}
                            </option>
                          );
                        })}
                      </optgroup>
                    )}
                    <optgroup label="Custom">
                      <option value="custom">Custom…</option>
                    </optgroup>
                  </select>
                  {isCustom && (
                    <CustomHoursEditor
                      value={customCurrent}
                      onChange={(next) =>
                        patch(p.id, {
                          hoursPreset: "custom",
                          hoursCustom: next,
                        })
                      }
                      resourceName={p.name}
                    />
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

const DAY_TOKENS: ReadonlyArray<{ key: string; label: string }> = [
  { key: "MO", label: "Mon" },
  { key: "TU", label: "Tue" },
  { key: "WE", label: "Wed" },
  { key: "TH", label: "Thu" },
  { key: "FR", label: "Fri" },
  { key: "SA", label: "Sat" },
  { key: "SU", label: "Sun" },
];

const TIME_ZONES: ReadonlyArray<{ code: number; label: string }> = [
  { code: 4, label: "(GMT-08:00) Pacific" },
  { code: 10, label: "(GMT-07:00) Mountain" },
  { code: 15, label: "(GMT-07:00) Arizona" },
  { code: 20, label: "(GMT-06:00) Central" },
  { code: 35, label: "(GMT-05:00) Eastern" },
  { code: 50, label: "(GMT-04:00) Atlantic (Canada)" },
  { code: 92, label: "(GMT) UTC" },
  { code: 85, label: "(GMT) London" },
  { code: 110, label: "(GMT+01:00) Berlin / Rome" },
  { code: 145, label: "(GMT+03:00) Moscow" },
  { code: 190, label: "(GMT+05:30) India" },
  { code: 235, label: "(GMT+09:00) Tokyo" },
  { code: 255, label: "(GMT+10:00) Sydney" },
];

interface CustomHoursValue {
  days: string[];
  startHour: number;
  endHour: number;
  tz: number;
}

function CustomHoursEditor({
  value,
  onChange,
  resourceName,
}: {
  value: CustomHoursValue;
  onChange: (next: CustomHoursValue) => void;
  resourceName: string;
}) {
  const dayset = new Set(value.days);
  function toggleDay(k: string) {
    const next = new Set(dayset);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    // Preserve canonical week ordering.
    const ordered = DAY_TOKENS.map((d) => d.key).filter((dk) => next.has(dk));
    onChange({ ...value, days: ordered });
  }
  function clamp24(n: number): number {
    if (!Number.isFinite(n)) return 0;
    if (n < 0) return 0;
    if (n > 24) return 24;
    return Math.floor(n);
  }
  return (
    <div className="mt-2 border border-border/70 rounded-md p-2 bg-bg-base/40 space-y-2">
      <div>
        <div className="text-[10px] uppercase tracking-wider text-muted mb-1">
          Days
        </div>
        <div className="flex flex-wrap gap-1">
          {DAY_TOKENS.map((d) => {
            const checked = dayset.has(d.key);
            return (
              <button
                key={d.key}
                type="button"
                onClick={() => toggleDay(d.key)}
                className={`text-[11px] px-2 py-0.5 rounded-full border transition-colors ${
                  checked
                    ? "bg-accent/20 border-accent/60 text-white"
                    : "bg-transparent border-border text-muted hover:text-white"
                }`}
              >
                {d.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            Start
          </span>
          <input
            aria-label={`Custom start hour for ${resourceName}`}
            type="number"
            min={0}
            max={24}
            value={value.startHour}
            onChange={(e) =>
              onChange({ ...value, startHour: clamp24(Number(e.target.value)) })
            }
            className="bg-bg border border-border rounded px-2 py-1 text-white text-xs w-16"
          />
        </label>
        <label className="flex flex-col gap-0.5">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            End
          </span>
          <input
            aria-label={`Custom end hour for ${resourceName}`}
            type="number"
            min={0}
            max={24}
            value={value.endHour}
            onChange={(e) =>
              onChange({ ...value, endHour: clamp24(Number(e.target.value)) })
            }
            className="bg-bg border border-border rounded px-2 py-1 text-white text-xs w-16"
          />
        </label>
        <label className="flex flex-col gap-0.5 flex-1 min-w-[180px]">
          <span className="text-[10px] uppercase tracking-wider text-muted">
            Time zone
          </span>
          <select
            aria-label={`Custom time zone for ${resourceName}`}
            value={value.tz}
            onChange={(e) => onChange({ ...value, tz: Number(e.target.value) })}
            className="bg-bg border border-border rounded px-2 py-1 text-white text-xs"
          >
            {!TIME_ZONES.find((z) => z.code === value.tz) && (
              <option value={value.tz}>Code {value.tz}</option>
            )}
            {TIME_ZONES.map((z) => (
              <option key={z.code} value={z.code}>
                {z.label}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="text-[10px] text-muted italic">
        Empty days = "no schedule" (the SaveCalendar call is skipped).
      </div>
    </div>
  );
}
