import { useEffect, useMemo, useState } from "react";
import {
  CircleNotch,
  MagnifyingGlass,
  Warning,
  CheckSquare,
  Square,
} from "@phosphor-icons/react";
import { DataverseClient } from "@/lib/dataverse";
import type { FsPreset } from "@/lib/preset";

export interface PickedResource {
  id: string;
  name: string;
  /** Optional preset territory code to bind to this existing resource. */
  territoryCode?: string;
  /** Optional preset characteristic name to bind to this existing resource. */
  primarySkill?: string;
}

interface OrgResource {
  bookableresourceid: string;
  name: string;
  resourcetype: number;
}

interface Props {
  orgUrl: string;
  preset: FsPreset;
  value: PickedResource[];
  onChange: (next: PickedResource[]) => void;
}

const RESOURCE_TYPE_LABEL: Record<number, string> = {
  1: "User",
  2: "Account",
  3: "Contact",
  4: "Equipment",
  5: "Crew",
  6: "Pool",
};

export function ResourcePicker({ orgUrl, preset, value, onChange }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resources, setResources] = useState<OrgResource[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const dv = new DataverseClient({ orgUrl });
    dv
      .query<OrgResource>("bookableresources", {
        filter: "statecode eq 0 and (resourcetype eq 1 or resourcetype eq 3 or resourcetype eq 4)",
        select: ["bookableresourceid", "name", "resourcetype"],
        orderby: "name asc",
        top: 250,
      })
      .then((rows) => {
        if (!cancelled) setResources(rows);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgUrl]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return resources;
    return resources.filter((r) => r.name.toLowerCase().includes(q));
  }, [resources, search]);

  const valueById = useMemo(() => {
    const m = new Map<string, PickedResource>();
    for (const v of value) m.set(v.id, v);
    return m;
  }, [value]);

  function toggle(r: OrgResource) {
    if (valueById.has(r.bookableresourceid)) {
      onChange(value.filter((v) => v.id !== r.bookableresourceid));
    } else {
      onChange([
        ...value,
        {
          id: r.bookableresourceid,
          name: r.name,
        },
      ]);
    }
  }

  function updatePick(id: string, patch: Partial<PickedResource>) {
    onChange(
      value.map((v) => (v.id === id ? { ...v, ...patch } : v)),
    );
  }

  return (
    <div className="mt-4 border border-border rounded-lg p-4 bg-bg-base/40">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div>
          <div className="text-sm font-semibold text-white">
            Pick from your org
          </div>
          <div className="text-xs text-muted">
            {value.length} selected · {resources.length} available
          </div>
        </div>
        <div className="relative">
          <MagnifyingGlass
            size={14}
            className="absolute left-2.5 top-2.5 text-muted"
          />
          <input
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-bg-base border border-border rounded-md pl-8 pr-2 py-1.5 text-xs text-white w-48 focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted py-4">
          <CircleNotch size={14} className="animate-spin" />
          Loading bookable resources…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md p-2">
          <Warning size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && resources.length === 0 && (
        <div className="text-xs text-muted py-4">
          No bookable resources found in this org.
        </div>
      )}

      {!loading && !error && resources.length > 0 && (
        <div className="max-h-72 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {filtered.map((r) => {
            const checked = valueById.has(r.bookableresourceid);
            return (
              <button
                key={r.bookableresourceid}
                type="button"
                onClick={() => toggle(r)}
                className={`w-full flex items-center gap-3 px-3 py-2 text-left text-xs hover:bg-bg-elevated/60 ${
                  checked ? "bg-accent/5" : ""
                }`}
              >
                {checked ? (
                  <CheckSquare
                    size={16}
                    weight="fill"
                    className="text-accent flex-shrink-0"
                  />
                ) : (
                  <Square size={16} className="text-muted flex-shrink-0" />
                )}
                <span className="flex-1 text-white">{r.name}</span>
                <span className="px-2 py-0.5 rounded bg-bg-elevated text-muted text-[10px] uppercase tracking-wide">
                  {RESOURCE_TYPE_LABEL[r.resourcetype] ?? `Type ${r.resourcetype}`}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {value.length > 0 && (
        <div className="mt-4">
          <div className="text-xs font-semibold text-white mb-2">
            Optional bindings
          </div>
          <p className="text-[11px] text-muted mb-2">
            Optionally link each picked resource to a preset territory and
            primary skill. This makes them eligible for Schedule Assistant
            results just like the generated technicians.
          </p>
          <div className="space-y-1.5">
            {value.map((v) => (
              <div
                key={v.id}
                className="flex items-center gap-2 text-xs bg-bg-base/60 rounded px-2 py-1.5"
              >
                <span className="flex-1 text-white truncate">{v.name}</span>
                <select
                  aria-label={`Territory for ${v.name}`}
                  value={v.territoryCode ?? ""}
                  onChange={(e) =>
                    updatePick(v.id, {
                      territoryCode: e.target.value || undefined,
                    })
                  }
                  className="bg-bg-elevated border border-border rounded px-1.5 py-0.5 text-[11px] text-white"
                >
                  <option value="">— territory —</option>
                  {preset.territories.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.code}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Primary skill for ${v.name}`}
                  value={v.primarySkill ?? ""}
                  onChange={(e) =>
                    updatePick(v.id, {
                      primarySkill: e.target.value || undefined,
                    })
                  }
                  className="bg-bg-elevated border border-border rounded px-1.5 py-0.5 text-[11px] text-white"
                >
                  <option value="">— skill —</option>
                  {preset.characteristics.map((c) => (
                    <option key={c.name} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
