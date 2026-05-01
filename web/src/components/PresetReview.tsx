import { Fragment, useState } from "react";
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
        <TechnicianEditor
          preset={preset}
          onChange={(next) => {
            setHistory((h) => [preset, ...h].slice(0, 10));
            onChange(next);
          }}
          onRemove={(i) => handleRemove("sampleTechnician", i)}
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

// ── Technician editor ───────────────────────────────────────────────────────
// Editable, per-row UI for the Sample technicians section. Lets the user
// pick territory + skill from dropdowns and configure work hours per
// resource (days, start/end hour, time-zone). The seeder Work Hours phase
// reads these fields back at run time and emits one `msdyn_SaveCalendar`
// call per resource. v1.41.4.

const WEEKDAYS: ReadonlyArray<{ token: string; label: string; full: string }> =
  [
    { token: "MO", label: "M", full: "Monday" },
    { token: "TU", label: "T", full: "Tuesday" },
    { token: "WE", label: "W", full: "Wednesday" },
    { token: "TH", label: "T", full: "Thursday" },
    { token: "FR", label: "F", full: "Friday" },
    { token: "SA", label: "S", full: "Saturday" },
    { token: "SU", label: "S", full: "Sunday" },
  ];

const TIME_ZONES: ReadonlyArray<{ code: number; label: string }> = [
  { code: 4, label: "(GMT-08:00) Pacific Time" },
  { code: 10, label: "(GMT-07:00) Mountain Time" },
  { code: 15, label: "(GMT-07:00) Arizona" },
  { code: 20, label: "(GMT-06:00) Central Time" },
  { code: 35, label: "(GMT-05:00) Eastern Time" },
  { code: 50, label: "(GMT-04:00) Atlantic (Canada)" },
  { code: 92, label: "(GMT) UTC" },
  { code: 85, label: "(GMT) London" },
  { code: 110, label: "(GMT+01:00) Berlin / Rome" },
  { code: 145, label: "(GMT+03:00) Moscow" },
  { code: 190, label: "(GMT+05:30) India" },
  { code: 235, label: "(GMT+09:00) Tokyo" },
  { code: 255, label: "(GMT+10:00) Sydney" },
];

function TechnicianEditor({
  preset,
  onChange,
  onRemove,
}: {
  preset: FsPreset;
  onChange: (next: FsPreset) => void;
  onRemove: (rowIndex: number) => void;
}) {
  const techs = preset.sampleTechnicians;
  const skills = preset.characteristics.map((c) => c.name);
  const territories = preset.territories.map((t) => t.code);

  function patch(
    index: number,
    p: Partial<FsPreset["sampleTechnicians"][number]>,
  ) {
    const next: FsPreset = {
      ...preset,
      sampleTechnicians: techs.map((t, i) => (i === index ? { ...t, ...p } : t)),
    };
    onChange(next);
  }

  function applyToAll(p: Partial<FsPreset["sampleTechnicians"][number]>) {
    onChange({
      ...preset,
      sampleTechnicians: techs.map((t) => ({ ...t, ...p })),
    });
  }

  function toggleDay(index: number, token: string) {
    const cur =
      techs[index].workDays ?? ["MO", "TU", "WE", "TH", "FR"];
    const has = cur.includes(token);
    // Preserve canonical Mon→Sun order.
    const order = WEEKDAYS.map((w) => w.token);
    const next = order.filter((t) =>
      t === token ? !has : cur.includes(t),
    );
    patch(index, { workDays: next });
  }

  // v1.42.0 — Multi-skill helpers. `skills[]` lives alongside the headline
  // `primarySkill`; the seeder dedupes so listing primarySkill again here is
  // harmless. Ratings 1–5 map to FS `ratingvalue.value` at seed time.
  function addSkill(index: number, name: string, rating: number) {
    const cur = techs[index].skills ?? [];
    if (cur.some((s) => s.name === name)) return;
    patch(index, { skills: [...cur, { name, rating }] });
  }
  function updateSkillRating(index: number, name: string, rating: number) {
    const cur = techs[index].skills ?? [];
    patch(index, {
      skills: cur.map((s) => (s.name === name ? { ...s, rating } : s)),
    });
  }
  function removeSkill(index: number, name: string) {
    const cur = techs[index].skills ?? [];
    patch(index, { skills: cur.filter((s) => s.name !== name) });
  }

  // v1.42.1 — Time-off helpers. Each entry becomes one WorkHourType:3 rule
  // on the resource's calendar via msdyn_SaveCalendar. Date strings are
  // stored as plain YYYY-MM-DD; the seeder validates and skips bad rows.
  function addTimeOff(index: number) {
    const cur = techs[index].timeOff ?? [];
    // Default new entry: today + 7 days, one-day off.
    const today = new Date();
    const start = today.toISOString().slice(0, 10);
    const endDate = new Date(today.getTime() + 86400_000);
    const end = endDate.toISOString().slice(0, 10);
    patch(index, { timeOff: [...cur, { start, end, reason: "" }] });
  }
  function updateTimeOff(
    index: number,
    offIndex: number,
    p: Partial<{ start: string; end: string; reason: string }>,
  ) {
    const cur = techs[index].timeOff ?? [];
    patch(index, {
      timeOff: cur.map((o, j) => (j === offIndex ? { ...o, ...p } : o)),
    });
  }
  function removeTimeOff(index: number, offIndex: number) {
    const cur = techs[index].timeOff ?? [];
    patch(index, { timeOff: cur.filter((_, j) => j !== offIndex) });
  }

  return (
    <div className="space-y-4">
      <ApplyToAllPanel onApply={applyToAll} />
      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border">
              <Th>Name</Th>
              <Th>Primary skill</Th>
              <Th>Territory</Th>
              <Th className="w-[170px]">Work days</Th>
              <Th className="w-[140px]">Hours (24h)</Th>
              <Th className="w-[210px]">Time zone</Th>
              <th className="w-8" aria-label="Remove" />
            </tr>
          </thead>
          <tbody>
            {techs.map((t, i) => {
              const days = t.workDays ?? ["MO", "TU", "WE", "TH", "FR"];
              const startH = t.workStartHour ?? 8;
              const endH = t.workEndHour ?? 17;
              const tz = t.timeZoneCode ?? 4;
              const extraSkills = t.skills ?? [];
              const usedSkillNames = new Set([
                t.primarySkill,
                ...extraSkills.map((s) => s.name),
              ]);
              const availSkills = skills.filter((s) => !usedSkillNames.has(s));
              return (
                <Fragment key={i}>
                <tr
                  className="border-b border-border/40 group align-top"
                >
                  <td className="py-2 px-2">
                    <input
                      title="Technician name"
                      placeholder="Technician name"
                      value={t.name}
                      onChange={(e) => patch(i, { name: e.target.value })}
                      className="bg-bg-base border border-border rounded px-2 py-1 text-white text-sm w-full font-semibold"
                    />
                  </td>
                  <td className="py-2 px-2">
                    <select
                      title="Primary skill"
                      value={t.primarySkill}
                      onChange={(e) =>
                        patch(i, { primarySkill: e.target.value })
                      }
                      className="bg-bg-base border border-border rounded px-2 py-1 text-slate-200 text-sm w-full"
                    >
                      {!skills.includes(t.primarySkill) && (
                        <option value={t.primarySkill}>
                          {t.primarySkill} (missing)
                        </option>
                      )}
                      {skills.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <select
                      title="Primary territory"
                      value={t.primaryTerritoryCode}
                      onChange={(e) =>
                        patch(i, {
                          primaryTerritoryCode: e.target.value,
                        })
                      }
                      className="bg-bg-base border border-border rounded px-2 py-1 text-accent text-sm w-full font-mono"
                    >
                      {!territories.includes(t.primaryTerritoryCode) && (
                        <option value={t.primaryTerritoryCode}>
                          {t.primaryTerritoryCode} (missing)
                        </option>
                      )}
                      {territories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex flex-wrap gap-1">
                      {WEEKDAYS.map((d) => {
                        const on = days.includes(d.token);
                        return (
                          <button
                            key={d.token}
                            type="button"
                            onClick={() => toggleDay(i, d.token)}
                            title={d.full}
                            className={
                              "w-6 h-6 rounded text-[11px] font-semibold border transition-colors " +
                              (on
                                ? "bg-accent text-bg-base border-accent"
                                : "bg-bg-base text-muted border-border hover:text-white")
                            }
                          >
                            {d.label}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-1">
                      <input
                        title="Work start hour (0–24)"
                        aria-label="Work start hour"
                        type="number"
                        min={0}
                        max={24}
                        value={startH}
                        onChange={(e) =>
                          patch(i, {
                            workStartHour: clamp24(Number(e.target.value)),
                          })
                        }
                        className="bg-bg-base border border-border rounded px-2 py-1 text-white text-sm w-14"
                      />
                      <span className="text-muted">–</span>
                      <input
                        title="Work end hour (0–24)"
                        aria-label="Work end hour"
                        type="number"
                        min={0}
                        max={24}
                        value={endH}
                        onChange={(e) =>
                          patch(i, {
                            workEndHour: clamp24(Number(e.target.value)),
                          })
                        }
                        className="bg-bg-base border border-border rounded px-2 py-1 text-white text-sm w-14"
                      />
                    </div>
                  </td>
                  <td className="py-2 px-2">
                    <select
                      title="Time zone"
                      value={tz}
                      onChange={(e) =>
                        patch(i, { timeZoneCode: Number(e.target.value) })
                      }
                      className="bg-bg-base border border-border rounded px-2 py-1 text-slate-200 text-xs w-full"
                    >
                      {!TIME_ZONES.find((z) => z.code === tz) && (
                        <option value={tz}>Code {tz}</option>
                      )}
                      {TIME_ZONES.map((z) => (
                        <option key={z.code} value={z.code}>
                          {z.label}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-2 px-1 w-8">
                    <RemoveBtn onClick={() => onRemove(i)} />
                  </td>
                </tr>
                <tr className="border-b border-border/40 last:border-0">
                  <td className="py-1 px-2" />
                  <td colSpan={6} className="py-1 px-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted mr-1">
                        Skills
                      </span>
                      {extraSkills.length === 0 && (
                        <span className="text-[11px] text-muted/70 italic">
                          (only primary)
                        </span>
                      )}
                      {extraSkills.map((s) => (
                        <span
                          key={s.name}
                          className="inline-flex items-center gap-1 rounded-md bg-bg-base border border-border px-1.5 py-0.5 text-[11px] text-slate-200"
                          title={`${s.name} — proficiency ${s.rating ?? "untyped"}`}
                        >
                          <span>{s.name}</span>
                          <select
                            value={s.rating ?? 3}
                            onChange={(e) =>
                              updateSkillRating(
                                i,
                                s.name,
                                Number(e.target.value),
                              )
                            }
                            title="Proficiency rating (1=Familiar … 5=Expert)"
                            aria-label={`Rating for ${s.name}`}
                            className="bg-transparent border-0 text-accent text-[11px] focus:outline-none cursor-pointer"
                          >
                            {[1, 2, 3, 4, 5].map((n) => (
                              <option key={n} value={n}>
                                ★{n}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => removeSkill(i, s.name)}
                            title={`Remove ${s.name}`}
                            aria-label={`Remove ${s.name}`}
                            className="text-muted hover:text-red-300 leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      {availSkills.length > 0 && (
                        <AddSkillButton
                          options={availSkills}
                          onAdd={(name, rating) =>
                            addSkill(i, name, rating)
                          }
                        />
                      )}
                    </div>
                  </td>
                </tr>
                <tr className="border-b border-border/40 last:border-0">
                  <td className="py-1 px-2" />
                  <td colSpan={6} className="py-1 px-2 pb-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[10px] uppercase tracking-wider text-muted mr-1">
                        Time off
                      </span>
                      {(t.timeOff ?? []).length === 0 && (
                        <span className="text-[11px] text-muted/70 italic">
                          (none)
                        </span>
                      )}
                      {(t.timeOff ?? []).map((off, j) => (
                        <span
                          key={j}
                          className="inline-flex items-center gap-1 rounded-md bg-bg-base border border-border px-1.5 py-0.5 text-[11px] text-slate-200"
                          title={
                            off.reason
                              ? `${off.start} → ${off.end} (${off.reason})`
                              : `${off.start} → ${off.end}`
                          }
                        >
                          <input
                            type="date"
                            value={off.start}
                            onChange={(e) =>
                              updateTimeOff(i, j, { start: e.target.value })
                            }
                            title="Start date"
                            aria-label={`Time off start ${j}`}
                            className="bg-bg-elevated border border-border rounded px-1 py-0.5 text-slate-200 text-[11px]"
                          />
                          <span className="text-muted">→</span>
                          <input
                            type="date"
                            value={off.end}
                            onChange={(e) =>
                              updateTimeOff(i, j, { end: e.target.value })
                            }
                            title="End date"
                            aria-label={`Time off end ${j}`}
                            className="bg-bg-elevated border border-border rounded px-1 py-0.5 text-slate-200 text-[11px]"
                          />
                          <input
                            type="text"
                            placeholder="reason"
                            value={off.reason ?? ""}
                            onChange={(e) =>
                              updateTimeOff(i, j, { reason: e.target.value })
                            }
                            title="Reason (UI only — not persisted to FS)"
                            aria-label={`Time off reason ${j}`}
                            className="bg-bg-elevated border border-border rounded px-1 py-0.5 text-slate-300 text-[11px] w-24"
                          />
                          <button
                            type="button"
                            onClick={() => removeTimeOff(i, j)}
                            title="Remove this time-off entry"
                            aria-label={`Remove time off ${j}`}
                            className="text-muted hover:text-red-300 leading-none"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                      <button
                        type="button"
                        onClick={() => addTimeOff(i)}
                        title="Add a time-off range"
                        className="text-[11px] text-accent hover:text-white border border-dashed border-border hover:border-accent rounded-md px-1.5 py-0.5"
                      >
                        + time off
                      </button>
                    </div>
                  </td>
                </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-muted">
        Each row's working-hour schedule is applied to its bookable resource via
        the FS <code className="text-accent">msdyn_SaveCalendar</code> action so
        the Schedule Assistant can match the resource. Empty work-day selection
        leaves the resource unscheduled.
      </p>
    </div>
  );
}

/**
 * v1.42.0 — pop-out picker for adding additional skills to a tech row.
 * Opens an inline panel with a skill dropdown + 1–5 proficiency rating, then
 * commits via `onAdd` and collapses. Disabled when no available skills remain.
 */
function AddSkillButton({
  options,
  onAdd,
}: {
  options: string[];
  onAdd: (name: string, rating: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(options[0] ?? "");
  const [rating, setRating] = useState(3);

  // Keep `name` valid when options shift (e.g. a skill is removed elsewhere).
  if (open && options.length > 0 && !options.includes(name)) {
    setName(options[0]);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => {
          setName(options[0] ?? "");
          setOpen(true);
        }}
        title="Add another skill"
        className="text-[11px] text-accent hover:text-white border border-dashed border-border hover:border-accent rounded-md px-1.5 py-0.5"
      >
        + skill
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-bg-elevated border border-accent/40 px-1.5 py-0.5 text-[11px]">
      <select
        value={name}
        onChange={(e) => setName(e.target.value)}
        title="Skill"
        aria-label="Skill to add"
        className="bg-bg-base border border-border rounded px-1 py-0.5 text-slate-200 text-[11px]"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
      <select
        value={rating}
        onChange={(e) => setRating(Number(e.target.value))}
        title="Proficiency rating (1=Familiar … 5=Expert)"
        aria-label="Proficiency rating"
        className="bg-bg-base border border-border rounded px-1 py-0.5 text-accent text-[11px]"
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <option key={n} value={n}>
            ★{n}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => {
          if (name) onAdd(name, rating);
          setOpen(false);
        }}
        className="text-emerald-300 hover:text-emerald-200 font-semibold"
      >
        Add
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="text-muted hover:text-white"
      >
        ×
      </button>
    </span>
  );
}

function ApplyToAllPanel({
  onApply,
}: {
  onApply: (
    p: Partial<FsPreset["sampleTechnicians"][number]>,
  ) => void;
}) {
  const [days, setDays] = useState<string[]>(["MO", "TU", "WE", "TH", "FR"]);
  const [startH, setStartH] = useState(8);
  const [endH, setEndH] = useState(17);
  const [tz, setTz] = useState(4);

  function toggle(token: string) {
    const order = WEEKDAYS.map((w) => w.token);
    setDays((cur) =>
      order.filter((t) => (t === token ? !cur.includes(t) : cur.includes(t))),
    );
  }

  return (
    <div className="rounded-lg border border-border/60 bg-bg-base/60 p-3 flex flex-wrap items-center gap-3 text-xs">
      <span className="text-muted uppercase tracking-wider font-medium">
        Apply to all
      </span>
      <div className="flex flex-wrap gap-1">
        {WEEKDAYS.map((d) => {
          const on = days.includes(d.token);
          return (
            <button
              key={d.token}
              type="button"
              onClick={() => toggle(d.token)}
              title={d.full}
              className={
                "w-6 h-6 rounded text-[11px] font-semibold border transition-colors " +
                (on
                  ? "bg-accent text-bg-base border-accent"
                  : "bg-bg-base text-muted border-border hover:text-white")
              }
            >
              {d.label}
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-1">
        <input
          title="Apply-to-all start hour"
          aria-label="Apply-to-all start hour"
          type="number"
          min={0}
          max={24}
          value={startH}
          onChange={(e) => setStartH(clamp24(Number(e.target.value)))}
          className="bg-bg-base border border-border rounded px-2 py-1 text-white text-sm w-14"
        />
        <span className="text-muted">–</span>
        <input
          title="Apply-to-all end hour"
          aria-label="Apply-to-all end hour"
          type="number"
          min={0}
          max={24}
          value={endH}
          onChange={(e) => setEndH(clamp24(Number(e.target.value)))}
          className="bg-bg-base border border-border rounded px-2 py-1 text-white text-sm w-14"
        />
      </div>
      <select
        title="Apply-to-all time zone"
        value={tz}
        onChange={(e) => setTz(Number(e.target.value))}
        className="bg-bg-base border border-border rounded px-2 py-1 text-slate-200 text-xs"
      >
        {TIME_ZONES.map((z) => (
          <option key={z.code} value={z.code}>
            {z.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() =>
          onApply({
            workDays: days,
            workStartHour: startH,
            workEndHour: endH,
            timeZoneCode: tz,
          })
        }
        className="ml-auto bg-accent text-bg-base text-xs font-semibold rounded px-3 py-1 hover:opacity-90 transition-opacity"
      >
        Apply
      </button>
    </div>
  );
}

function Th({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      className={
        "text-[11px] uppercase tracking-wider text-muted font-medium pb-2 px-2 " +
        className
      }
    >
      {children}
    </th>
  );
}

function clamp24(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 24) return 24;
  return Math.floor(n);
}
