import { useEffect, useMemo, useState } from "react";
import {
  CircleNotch,
  MagnifyingGlass,
  Warning,
  CheckSquare,
  Square,
} from "@phosphor-icons/react";
import { DataverseClient } from "@/lib/dataverse";

export interface PickedEntity {
  id: string;
  name: string;
}

interface Props {
  /** Friendly label shown in the empty/loading states e.g. "territories". */
  label: string;
  orgUrl: string;
  entitySet: string;
  idField: string;
  nameField: string;
  /** Optional OData filter expression applied to the listing query. */
  filter?: string;
  value: PickedEntity[];
  onChange: (next: PickedEntity[]) => void;
  /** Max records to fetch (default 250). */
  top?: number;
}

/**
 * Generic multi-select picker that lists records of a single entity from
 * Dataverse and lets the user check the ones they want to reuse. Used for
 * "use existing" mode across territories, work-order types, characteristics,
 * incident types, products, and accounts.
 */
export function EntityPicker({
  label,
  orgUrl,
  entitySet,
  idField,
  nameField,
  filter,
  value,
  onChange,
  top = 250,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const dv = new DataverseClient({ orgUrl });
    dv
      .query<Record<string, string>>(entitySet, {
        filter,
        select: [idField, nameField],
        orderby: `${nameField} asc`,
        top,
      })
      .then((data) => {
        if (!cancelled) setRows(data);
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
  }, [orgUrl, entitySet, idField, nameField, filter, top]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => (r[nameField] ?? "").toLowerCase().includes(q));
  }, [rows, search, nameField]);

  const valueById = useMemo(() => {
    const m = new Map<string, PickedEntity>();
    for (const v of value) m.set(v.id, v);
    return m;
  }, [value]);

  function toggle(r: Record<string, string>) {
    const id = r[idField];
    const name = r[nameField] ?? "(unnamed)";
    if (valueById.has(id)) {
      onChange(value.filter((v) => v.id !== id));
    } else {
      onChange([...value, { id, name }]);
    }
  }

  return (
    <div className="mt-3 border border-border rounded-lg p-3 bg-bg-base/40">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="text-xs text-muted">
          {value.length} selected · {rows.length} available
        </div>
        <div className="relative">
          <MagnifyingGlass
            size={12}
            className="absolute left-2 top-2 text-muted"
          />
          <input
            type="text"
            placeholder="Filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-bg-base border border-border rounded-md pl-7 pr-2 py-1 text-xs text-white w-40 focus:outline-none focus:border-accent"
          />
        </div>
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-xs text-muted py-3">
          <CircleNotch size={14} className="animate-spin" />
          Loading {label}…
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md p-2">
          <Warning size={14} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!loading && !error && rows.length === 0 && (
        <div className="text-xs text-muted py-3">
          No {label} found in this org.
        </div>
      )}

      {!loading && !error && rows.length > 0 && (
        <div className="max-h-60 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {filtered.map((r) => {
            const id = r[idField];
            const name = r[nameField] ?? "(unnamed)";
            const checked = valueById.has(id);
            return (
              <button
                key={id}
                type="button"
                onClick={() => toggle(r)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs hover:bg-bg-elevated/60 ${
                  checked ? "bg-accent/5" : ""
                }`}
              >
                {checked ? (
                  <CheckSquare
                    size={14}
                    weight="fill"
                    className="text-accent flex-shrink-0"
                  />
                ) : (
                  <Square size={14} className="text-muted flex-shrink-0" />
                )}
                <span className="flex-1 text-white truncate">{name}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
