import { useState } from "react";
import {
  MapPin,
  Wrench,
  Warning,
  Toolbox,
  Package,
  Buildings,
  Users,
  Sparkle,
  ArrowCounterClockwise,
  PencilSimple,
  CaretDown,
  CaretUp,
  Clock,
  ListBullets,
  TreeStructure,
  HardDrives,
  ClipboardText,
  FileText,
  Warehouse,
  Trash,
} from "@phosphor-icons/react";
import type { FsPreset } from "@/lib/preset";
import { editPreset } from "@/lib/presetEditor";
import { modelStore } from "@/lib/modelStore";
import { removePresetItem, type RemoveKind } from "@/lib/presetRemove";

interface Props {
  preset: FsPreset;
  onChange: (next: FsPreset) => void;
}

export function PresetReview({ preset, onChange }: Props) {
  const [history, setHistory] = useState<FsPreset[]>([]);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showJson, setShowJson] = useState(false);

  async function handleEdit() {
    if (!instruction.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const next = await editPreset(preset, instruction, modelStore.get() ?? undefined);
      setHistory((h) => [preset, ...h].slice(0, 10));
      onChange(next);
      setInstruction("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleUndo() {
    if (history.length === 0) return;
    const [prev, ...rest] = history;
    onChange(prev);
    setHistory(rest);
  }

  /** Locally remove a single row, with referential cleanup. Pushes onto the
   *  same Undo stack as AI edits so users can revert with one click. */
  function handleRemove(kind: RemoveKind, index: number) {
    const next = removePresetItem(preset, kind, index);
    if (next === preset) return; // no-op (out-of-range)
    setHistory((h) => [preset, ...h].slice(0, 10));
    onChange(next);
  }

  return (
    <div className="space-y-6">
      {/* Header card */}
      <div className="card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-accent mb-1">
              {preset.vertical.replace(/_/g, " ")}
            </div>
            <h2 className="text-2xl font-bold text-white">
              {preset.companyName}
            </h2>
            <p className="text-slate-400 text-sm mt-1">
              {preset.companyDescription}
            </p>
          </div>
        </div>
        {preset.rationale && (
          <div className="text-sm text-slate-300 italic border-l-2 border-accent pl-3 mt-4">
            {preset.rationale}
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
          <Stat label="Territories" value={preset.territories.length} />
          <Stat label="WO Types" value={preset.workOrderTypes.length} />
          <Stat label="Incidents" value={preset.incidentTypes.length} />
          <Stat label="Products" value={preset.products.length} />
          <Stat label="Skills" value={preset.characteristics.length} />
          <Stat label="Accounts" value={preset.sampleAccounts.length} />
          <Stat label="Technicians" value={preset.sampleTechnicians.length} />
          <Stat label="Locations" value={preset.functionalLocations?.length ?? 0} />
          <Stat label="Assets" value={preset.customerAssets?.length ?? 0} />
          <Stat label="Task Types" value={preset.serviceTaskTypes?.length ?? 0} />
          <Stat label="Agreements" value={preset.agreements?.length ?? 0} />
          <Stat label="Warehouses" value={preset.warehouses?.length ?? 0} />
        </div>
      </div>

      {/* AI editor */}
      <div className="card p-6 border border-accent/30 bg-accent/5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkle size={20} weight="duotone" className="text-accent" />
          <h3 className="font-semibold text-white">Edit with AI</h3>
        </div>
        <p className="text-xs text-muted mb-3">
          Tell GPT what to change — entire preset is returned. Try things like
          “Add 3 territories in Texas”, “Rename the company to Northwind HVAC”,
          “Make all incidents 30 minutes longer”, or “Remove products under
          $100 and add a high-end emergency kit”.
          <span className="block mt-1 text-slate-400">
            Tip: to drop a single row, hover any entry below and click the
            trash icon — it's instant and runs the same cascade cleanup
            locally (no AI call).
          </span>
        </p>
        <div className="flex gap-2">
          <input
            type="text"
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) handleEdit();
            }}
            disabled={busy}
            placeholder="Describe the change…"
            className="flex-1 px-3 py-2 rounded-lg bg-bg-base border border-border text-white placeholder-muted focus:outline-none focus:border-accent disabled:opacity-60"
          />
          <button
            onClick={handleEdit}
            disabled={busy || !instruction.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <PencilSimple size={16} weight="bold" />
            {busy ? "Editing…" : "Apply edit"}
          </button>
          <button
            onClick={handleUndo}
            disabled={history.length === 0 || busy}
            title="Undo last edit"
            className="btn-ghost flex items-center gap-2 disabled:opacity-30"
          >
            <ArrowCounterClockwise size={16} />
            Undo
          </button>
        </div>
        {error && (
          <div className="mt-3 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
            <Warning size={16} className="mt-0.5 shrink-0" />
            <div>
              <div className="font-semibold">Edit failed.</div>
              <code className="text-xs">{error}</code>
            </div>
          </div>
        )}
        <SuggestionChips
          disabled={busy}
          onPick={(s) => setInstruction(s)}
        />
      </div>

      {/* Sections */}
      <Section
        icon={<MapPin size={18} weight="duotone" className="text-accent" />}
        title="Territories"
        count={preset.territories.length}
      >
        <Table
          headers={["Name", "Code", "Description"]}
          onRemove={(i) => handleRemove("territory", i)}
          rows={preset.territories.map((t) => [
            <span className="font-semibold text-white">{t.name}</span>,
            <code className="text-accent text-xs">{t.code}</code>,
            <span className="text-slate-300 text-sm">
              {t.description ?? "—"}
            </span>,
          ])}
        />
      </Section>

      <Section
        icon={<Toolbox size={18} weight="duotone" className="text-accent" />}
        title="Work order types"
        count={preset.workOrderTypes.length}
      >
        <Table
          headers={["Name", "Code", "Description"]}
          onRemove={(i) => handleRemove("workOrderType", i)}
          rows={preset.workOrderTypes.map((t) => [
            <span className="font-semibold text-white">{t.name}</span>,
            <code className="text-accent text-xs">{t.code}</code>,
            <span className="text-slate-300 text-sm">
              {t.description ?? "—"}
            </span>,
          ])}
        />
      </Section>

      <Section
        icon={<Warning size={18} weight="duotone" className="text-accent" />}
        title="Incident types"
        count={preset.incidentTypes.length}
      >
        <div className="divide-y divide-border">
          {preset.incidentTypes.map((it, i) => (
            <div key={i} className="py-3 group">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-semibold text-white">{it.name}</div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs text-muted whitespace-nowrap">
                    <Clock size={12} />
                    {it.estimatedDurationMinutes} min
                  </span>
                  <RemoveBtn onClick={() => handleRemove("incidentType", i)} />
                </div>
              </div>
              <div className="text-sm text-slate-400 mt-1">
                {it.description}
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {it.serviceTasks.map((task, j) => (
                  <span
                    key={j}
                    className="inline-flex items-center gap-1 text-[11px] text-slate-300 bg-bg-base border border-border rounded-full px-2 py-0.5"
                  >
                    <ListBullets size={10} />
                    {task}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section
        icon={<Wrench size={18} weight="duotone" className="text-accent" />}
        title="Skills & characteristics"
        count={preset.characteristics.length}
      >
        <div className="flex flex-wrap gap-2">
          {preset.characteristics.map((c, i) => (
            <div
              key={i}
              className="bg-bg-base border border-border rounded-lg px-3 py-2 group flex items-start gap-2"
            >
              <div>
                <div className="text-sm font-semibold text-white">{c.name}</div>
                {c.description && (
                  <div className="text-xs text-muted">{c.description}</div>
                )}
              </div>
              <RemoveBtn onClick={() => handleRemove("characteristic", i)} />
            </div>
          ))}
        </div>
      </Section>

      <Section
        icon={<Package size={18} weight="duotone" className="text-accent" />}
        title="Products & parts"
        count={preset.products.length}
      >
        <Table
          headers={["Name", "SKU", "Description", "List price"]}
          onRemove={(i) => handleRemove("product", i)}
          rows={preset.products.map((p) => [
            <span className="font-semibold text-white">{p.name}</span>,
            <code className="text-accent text-xs">{p.productNumber}</code>,
            <span className="text-slate-300 text-sm">
              {p.description ?? "—"}
            </span>,
            <span className="text-emerald-300 text-sm font-mono">
              {p.listPrice != null
                ? `$${p.listPrice.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                  })}`
                : "—"}
            </span>,
          ])}
        />
      </Section>

      <Section
        icon={<Buildings size={18} weight="duotone" className="text-accent" />}
        title="Sample accounts"
        count={preset.sampleAccounts.length}
      >
        <Table
          headers={["Name", "Location", "Site description"]}
          onRemove={(i) => handleRemove("sampleAccount", i)}
          rows={preset.sampleAccounts.map((a) => [
            <span className="font-semibold text-white">{a.name}</span>,
            <span className="text-slate-300 text-sm">
              {[a.city, a.state].filter(Boolean).join(", ") || "—"}
            </span>,
            <span className="text-slate-400 text-sm">
              {a.siteDescription ?? "—"}
            </span>,
          ])}
        />
      </Section>

      <Section
        icon={<Users size={18} weight="duotone" className="text-accent" />}
        title="Sample technicians"
        count={preset.sampleTechnicians.length}
      >
        <Table
          headers={["Name", "Primary skill", "Territory"]}
          onRemove={(i) => handleRemove("sampleTechnician", i)}
          rows={preset.sampleTechnicians.map((t) => [
            <span className="font-semibold text-white">{t.name}</span>,
            <span className="text-slate-300 text-sm">{t.primarySkill}</span>,
            <code className="text-accent text-xs">
              {t.primaryTerritoryCode}
            </code>,
          ])}
        />
      </Section>

      {preset.functionalLocations && preset.functionalLocations.length > 0 && (
        <Section
          icon={<TreeStructure size={18} weight="duotone" className="text-accent" />}
          title="Functional locations"
          count={preset.functionalLocations.length}
        >
          <Table
            headers={["Name", "Account", "Parent", "Description"]}
            onRemove={(i) => handleRemove("functionalLocation", i)}
            rows={preset.functionalLocations.map((fl) => [
              <span className="font-semibold text-white">{fl.name}</span>,
              <span className="text-slate-300 text-sm">{fl.accountName}</span>,
              <span className="text-slate-400 text-sm">{fl.parentName ?? "—"}</span>,
              <span className="text-slate-400 text-sm">{fl.description ?? "—"}</span>,
            ])}
          />
        </Section>
      )}

      {preset.customerAssets && preset.customerAssets.length > 0 && (
        <Section
          icon={<HardDrives size={18} weight="duotone" className="text-accent" />}
          title="Customer assets"
          count={preset.customerAssets.length}
        >
          <Table
            headers={["Name", "Account", "Location", "Product", "Serial"]}
            onRemove={(i) => handleRemove("customerAsset", i)}
            rows={preset.customerAssets.map((a) => [
              <span className="font-semibold text-white">{a.name}</span>,
              <span className="text-slate-300 text-sm">{a.accountName}</span>,
              <span className="text-slate-400 text-sm">{a.functionalLocationName ?? "—"}</span>,
              <code className="text-accent text-xs">{a.productNumber ?? "—"}</code>,
              <code className="text-slate-400 text-xs">{a.serialNumber ?? "—"}</code>,
            ])}
          />
        </Section>
      )}

      {preset.serviceTaskTypes && preset.serviceTaskTypes.length > 0 && (
        <Section
          icon={<ClipboardText size={18} weight="duotone" className="text-accent" />}
          title="Service task types"
          count={preset.serviceTaskTypes.length}
        >
          <Table
            headers={["Name", "Description", "Est. duration"]}
            onRemove={(i) => handleRemove("serviceTaskType", i)}
            rows={preset.serviceTaskTypes.map((s) => [
              <span className="font-semibold text-white">{s.name}</span>,
              <span className="text-slate-400 text-sm">{s.description ?? "—"}</span>,
              <span className="inline-flex items-center gap-1 text-xs text-muted whitespace-nowrap">
                <Clock size={12} />
                {s.estimatedDurationMinutes ?? "—"} min
              </span>,
            ])}
          />
        </Section>
      )}

      {preset.agreements && preset.agreements.length > 0 && (
        <Section
          icon={<FileText size={18} weight="duotone" className="text-accent" />}
          title="Service agreements"
          count={preset.agreements.length}
        >
          <div className="divide-y divide-border">
            {preset.agreements.map((a, i) => (
              <div key={i} className="py-3 group">
                <div className="flex items-baseline justify-between gap-3">
                  <div className="font-semibold text-white">{a.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-xs text-muted whitespace-nowrap">
                      <Clock size={12} />
                      {a.recurrencePattern} · {a.estimatedDurationMinutes ?? "—"} min
                    </span>
                    <RemoveBtn onClick={() => handleRemove("agreement", i)} />
                  </div>
                </div>
                <div className="text-sm text-slate-400 mt-1">
                  {a.accountName} · {a.startOn} → {a.endOn}
                </div>
                {a.description && (
                  <div className="text-sm text-slate-400 mt-1">{a.description}</div>
                )}
                {(a.coveredIncidentTypeNames?.length ||
                  a.coveredProductNumbers?.length) && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {a.coveredIncidentTypeNames?.map((n, j) => (
                      <span
                        key={`i${j}`}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-300 bg-bg-base border border-border rounded-full px-2 py-0.5"
                      >
                        <Warning size={10} />
                        {n}
                      </span>
                    ))}
                    {a.coveredProductNumbers?.map((p, j) => (
                      <span
                        key={`p${j}`}
                        className="inline-flex items-center gap-1 text-[11px] text-emerald-300 bg-bg-base border border-border rounded-full px-2 py-0.5"
                      >
                        <Package size={10} />
                        {p}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {preset.warehouses && preset.warehouses.length > 0 && (
        <Section
          icon={<Warehouse size={18} weight="duotone" className="text-accent" />}
          title="Warehouses"
          count={preset.warehouses.length}
        >
          <Table
            headers={["Name", "Location", "Description"]}
            onRemove={(i) => handleRemove("warehouse", i)}
            rows={preset.warehouses.map((w) => [
              <span className="font-semibold text-white">{w.name}</span>,
              <span className="text-slate-300 text-sm">
                {[w.city, w.state].filter(Boolean).join(", ") || "—"}
              </span>,
              <span className="text-slate-400 text-sm">{w.description ?? "—"}</span>,
            ])}
          />
        </Section>
      )}

      {/* Raw JSON (collapsed) */}
      <div className="card p-4">
        <button
          onClick={() => setShowJson((v) => !v)}
          className="flex items-center gap-2 text-sm text-slate-300 hover:text-white"
        >
          {showJson ? <CaretUp size={14} /> : <CaretDown size={14} />}
          {showJson ? "Hide raw JSON" : "View raw preset JSON"}
        </button>
        {showJson && (
          <pre className="mt-3 p-3 bg-bg-base rounded-lg overflow-auto max-h-96 text-xs text-slate-300">
            {JSON.stringify(preset, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}

function SuggestionChips({
  disabled,
  onPick,
}: {
  disabled: boolean;
  onPick: (s: string) => void;
}) {
  const samples = [
    "Add 3 territories covering Texas",
    "Rename the company to Northwind HVAC",
    "Make every incident 30 minutes longer",
    "Add 2 emergency-response work order types",
    "Remove products under $100 and add a high-end diagnostic kit",
    "Give every technician a more diverse first name",
  ];
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {samples.map((s) => (
        <button
          key={s}
          type="button"
          onClick={() => onPick(s)}
          disabled={disabled}
          className="text-[11px] px-2 py-1 rounded-full bg-bg-base border border-border text-slate-300 hover:border-accent hover:text-white transition-colors disabled:opacity-50"
        >
          {s}
        </button>
      ))}
    </div>
  );
}

function Section({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div className="card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-5 py-3 hover:bg-bg-base/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          {icon}
          <h3 className="font-semibold text-white">{title}</h3>
          <span className="text-xs text-muted">({count})</span>
        </div>
        {open ? <CaretUp size={14} /> : <CaretDown size={14} />}
      </button>
      {open && <div className="px-5 pb-5">{children}</div>}
    </div>
  );
}

function Table({
  headers,
  rows,
  onRemove,
}: {
  headers: string[];
  rows: React.ReactNode[][];
  /** When provided, renders an extra trailing column with a per-row × button. */
  onRemove?: (rowIndex: number) => void;
}) {
  return (
    <div className="overflow-x-auto -mx-1">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-border">
            {headers.map((h) => (
              <th
                key={h}
                className="text-[11px] uppercase tracking-wider text-muted font-medium pb-2 px-2"
              >
                {h}
              </th>
            ))}
            {onRemove && <th className="w-8" aria-label="Remove" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-border/40 last:border-0 group">
              {row.map((cell, j) => (
                <td key={j} className="py-2 px-2 align-top">
                  {cell}
                </td>
              ))}
              {onRemove && (
                <td className="py-2 px-1 align-top w-8">
                  <RemoveBtn onClick={() => onRemove(i)} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RemoveBtn({
  onClick,
  title = "Remove this entry (cleans up references locally — instant, no AI call)",
}: {
  onClick: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="opacity-30 group-hover:opacity-100 hover:text-red-300 hover:bg-red-500/10 text-muted rounded p-1 transition-colors"
    >
      <Trash size={14} />
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg-elevated border border-border rounded-lg p-3">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-muted uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}
