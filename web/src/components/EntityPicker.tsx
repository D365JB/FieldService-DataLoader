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
  /** Hard cap on records pulled. Default 10 000 (paged with maxpagesize=5000). */
  maxRecords?: number;
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
  maxRecords = 10_000,
}: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Array<Record<string, string>>>([]);
  const [search, setSearch] = useState("");
  type SortBy = "name-asc" | "created-desc" | "modified-desc";
  const [sortBy, setSortBy] = useState<SortBy>("name-asc");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setRows([]);
    const dv = new DataverseClient({ orgUrl });
    dv
      .queryAll<Record<string, string>>(entitySet, {
        filter,
        select: [idField, nameField, "createdon", "modifiedon"],
        orderby: `${nameField} asc`,
        maxRecords,
        onPage: (cumulative) => {
          // Stream pages into the UI so users see results building up
          // instead of staring at a spinner for several seconds on big orgs.
          if (!cancelled) setRows([...cumulative]);
        },
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
  }, [orgUrl, entitySet, idField, nameField, filter, maxRecords]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? rows.filter((r) => (r[nameField] ?? "").toLowerCase().includes(q))
      : rows.slice();
    if (sortBy === "name-asc") {
      base.sort((a, b) =>
        (a[nameField] ?? "").localeCompare(b[nameField] ?? "", undefined, {
          sensitivity: "base",
        })
      );
    } else if (sortBy === "created-desc") {
      base.sort((a, b) => (b["createdon"] ?? "").localeCompare(a["createdon"] ?? ""));
    } else if (sortBy === "modified-desc") {
      base.sort((a, b) =>
        (b["modifiedon"] ?? "").localeCompare(a["modifiedon"] ?? "")
      );
    }
    return base;
  }, [rows, search, nameField, sortBy]);

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
          {loading && rows.length > 0 && (
            <span className="ml-1 text-accent">· loading more…</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            title="Sort records"
            className="bg-bg-base border border-border rounded-md px-2 py-1 text-xs text-white focus:outline-none focus:border-accent"
          >
            <option value="name-asc">Name A–Z</option>
            <option value="created-desc">Created (newest)</option>
            <option value="modified-desc">Modified (newest)</option>
          </select>
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
      </div>

      {loading && rows.length === 0 && (
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

      {!error && rows.length > 0 && (
        <div className="max-h-60 overflow-y-auto border border-border rounded-md divide-y divide-border">
          {filtered.map((r) => {
            const id = r[idField];
            const name = r[nameField] ?? "(unnamed)";
            const checked = valueById.has(id);
            const dateField =
              sortBy === "created-desc"
                ? "createdon"
                : sortBy === "modified-desc"
                ? "modifiedon"
                : null;
            const dateLabel = dateField
              ? formatShortDate(r[dateField])
              : null;
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
                {dateLabel && (
                  <span className="text-[10px] text-muted flex-shrink-0 tabular-nums">
                    {dateLabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatShortDate(iso: string | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, {
    year: "2-digit",
    month: "short",
    day: "numeric",
  });
}
