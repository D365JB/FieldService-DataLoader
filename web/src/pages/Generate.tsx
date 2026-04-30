import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Sparkle,
  Warning,
  CheckCircle,
  CircleNotch,
  ArrowRight,
} from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { DataverseClient, deepLink } from "@/lib/dataverse";
import { seedFromPreset, type SeedProgress, type SeedResult, type SeedOptions, type EntityChoice } from "@/lib/fs/seed-config";
import type { FsPreset } from "@/lib/preset";
import { orgStore } from "@/lib/orgStore";
import { runHistory } from "@/lib/runHistory";
import { EntityPicker, type PickedEntity } from "@/components/EntityPicker";

interface StepState {
  name: string;
  done: number;
  total: number;
  detail?: string;
  status: "pending" | "running" | "complete";
}

const STEP_ORDER = [
  "Territories",
  "Work Order Types",
  "Characteristics",
  "Incident Types",
  "Products",
  "Accounts",
  "Bookable Resources",
  "Functional Locations",
  "Customer Assets",
  "Service Task Types",
  "Agreements",
  "Warehouses",
  "Product Inventory",
  "Work Orders",
  "WO Service Tasks",
  "Bookings",
  "WO Products",
  "Time Entries",
  "IoT Alerts",
];

export function Generate() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const orgUrl = orgStore.getOrgUrl() ?? "";

  const preset = useMemo<FsPreset | null>(() => {
    const raw = orgStore.getPreset();
    return raw ? (JSON.parse(raw) as FsPreset) : null;
  }, []);

  const [steps, setSteps] = useState<StepState[]>(() =>
    STEP_ORDER.map((name) => ({ name, done: 0, total: 0, status: "pending" })),
  );
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryNotice, setRetryNotice] = useState<string | null>(null);
  const [result, setResult] = useState<SeedResult | null>(null);

  // Per-entity sourcing. Same three-mode choice for every step:
  // "create" (default) / "existing" / "skip".
  type EntityKey =
    | "territories"
    | "workOrderTypes"
    | "characteristics"
    | "incidentTypes"
    | "products"
    | "accounts"
    | "resources"
    | "workOrders"
    | "bookings";
  type Mode = "create" | "existing" | "skip";
  const [entityModes, setEntityModes] = useState<Record<EntityKey, Mode>>({
    territories: "create",
    workOrderTypes: "create",
    characteristics: "create",
    incidentTypes: "create",
    products: "create",
    accounts: "create",
    resources: "create",
    workOrders: "create",
    bookings: "create",
  });
  const [entityPicks, setEntityPicks] = useState<
    Record<EntityKey, PickedEntity[]>
  >({
    territories: [],
    workOrderTypes: [],
    characteristics: [],
    incidentTypes: [],
    products: [],
    accounts: [],
    resources: [],
    workOrders: [],
    bookings: [],
  });
  function setMode(k: EntityKey, m: Mode) {
    setEntityModes((s) => ({ ...s, [k]: m }));
  }
  function setPicks(k: EntityKey, v: PickedEntity[]) {
    setEntityPicks((s) => ({ ...s, [k]: v }));
  }

  useEffect(() => {
    if (!accounts[0]) navigate("/");
    else if (!orgUrl) navigate("/connect");
    else if (!preset) navigate("/analyze");
  }, [accounts, orgUrl, preset, navigate]);

  if (!preset || !orgUrl) return null;

  function applyProgress(p: SeedProgress) {
    setSteps((prev) =>
      prev.map((s) => {
        if (s.name !== p.step) {
          // Anything before the current step in STEP_ORDER is implicitly done.
          const idxThis = STEP_ORDER.indexOf(s.name);
          const idxCurrent = STEP_ORDER.indexOf(p.step);
          if (idxThis < idxCurrent && s.status !== "complete") {
            return { ...s, status: "complete", done: s.total };
          }
          return s;
        }
        const status: StepState["status"] =
          p.done >= p.total && p.total > 0 ? "complete" : "running";
        return { ...s, ...p, status };
      }),
    );
  }

  async function handleStart() {
    if (!preset) return;
    setError(null);
    setRetryNotice(null);
    setResult(null);
    setRunning(true);
    setSteps(STEP_ORDER.map((name) => ({ name, done: 0, total: 0, status: "pending" })));
    try {
      const dv = new DataverseClient({
        orgUrl,
        onRetry: (attempt, status, waitMs) => {
          setRetryNotice(
            `Dataverse ${status || "network error"} — retry ${attempt} in ${Math.round(waitMs / 1000)}s`,
          );
        },
      });
      const seedOptions: SeedOptions = {};
      const keys: EntityKey[] = [
        "territories",
        "workOrderTypes",
        "characteristics",
        "incidentTypes",
        "products",
        "accounts",
        "resources",
        "workOrders",
        "bookings",
      ];
      for (const k of keys) {
        const mode = entityModes[k];
        if (mode === "create") continue;
        const choice: EntityChoice = { mode, existing: entityPicks[k] };
        (seedOptions as Record<string, unknown>)[k] = choice;
      }
      const seedResult = await seedFromPreset(
        dv,
        preset,
        applyProgress,
        seedOptions,
      );
      setResult(seedResult);
      runHistory.add(orgUrl, preset.companyName, seedResult);
      // Mark all steps complete (in case last step had total 0).
      setSteps((prev) => prev.map((s) => ({ ...s, status: "complete" })));
      setRetryNotice(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader orgUrl={orgUrl} />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <div className="flex items-center gap-3 mb-2">
          <Sparkle size={28} className="text-accent" weight="duotone" />
          <h1 className="text-3xl font-bold text-white">Generate</h1>
        </div>
        <p className="text-slate-400 mb-8">
          Writing the AI-generated preset for{" "}
          <strong className="text-white">{preset.companyName}</strong> into{" "}
          <code className="text-accent">{new URL(orgUrl).host}</code>.
        </p>

        {!result && !running && (
          <div className="card p-6 mb-6">
            <h3 className="font-semibold text-white mb-1">
              What to load
            </h3>
            <p className="text-xs text-muted mb-4">
              For each entity, choose to create from the preset, reuse records
              already in your org, or skip entirely.
            </p>
            <div className="space-y-3">
              <EntityRow
                label="Territories"
                hint={`Preset has ${preset.territories.length}.`}
                mode={entityModes.territories}
                onModeChange={(m) => setMode("territories", m)}
                picker={
                  <EntityPicker
                    label="territories"
                    orgUrl={orgUrl}
                    entitySet="territories"
                    idField="territoryid"
                    nameField="name"
                    value={entityPicks.territories}
                    onChange={(v) => setPicks("territories", v)}
                  />
                }
              />
              <EntityRow
                label="Work Order Types"
                hint={`Preset has ${preset.workOrderTypes.length}.`}
                mode={entityModes.workOrderTypes}
                onModeChange={(m) => setMode("workOrderTypes", m)}
                picker={
                  <EntityPicker
                    label="work order types"
                    orgUrl={orgUrl}
                    entitySet="msdyn_workordertypes"
                    idField="msdyn_workordertypeid"
                    nameField="msdyn_name"
                    value={entityPicks.workOrderTypes}
                    onChange={(v) => setPicks("workOrderTypes", v)}
                  />
                }
              />
              <EntityRow
                label="Characteristics"
                hint={`Preset has ${preset.characteristics.length}.`}
                mode={entityModes.characteristics}
                onModeChange={(m) => setMode("characteristics", m)}
                picker={
                  <EntityPicker
                    label="characteristics"
                    orgUrl={orgUrl}
                    entitySet="characteristics"
                    idField="characteristicid"
                    nameField="name"
                    value={entityPicks.characteristics}
                    onChange={(v) => setPicks("characteristics", v)}
                  />
                }
              />
              <EntityRow
                label="Incident Types"
                hint={`Preset has ${preset.incidentTypes.length}.`}
                mode={entityModes.incidentTypes}
                onModeChange={(m) => setMode("incidentTypes", m)}
                picker={
                  <EntityPicker
                    label="incident types"
                    orgUrl={orgUrl}
                    entitySet="msdyn_incidenttypes"
                    idField="msdyn_incidenttypeid"
                    nameField="msdyn_name"
                    value={entityPicks.incidentTypes}
                    onChange={(v) => setPicks("incidentTypes", v)}
                  />
                }
              />
              <EntityRow
                label="Products"
                hint={`Preset has ${preset.products.length}.`}
                mode={entityModes.products}
                onModeChange={(m) => setMode("products", m)}
                picker={
                  <EntityPicker
                    label="products"
                    orgUrl={orgUrl}
                    entitySet="products"
                    idField="productid"
                    nameField="name"
                    filter="statecode eq 0"
                    value={entityPicks.products}
                    onChange={(v) => setPicks("products", v)}
                  />
                }
              />
              <EntityRow
                label="Accounts"
                hint={`Preset has ${preset.sampleAccounts?.length ?? 0}.`}
                mode={entityModes.accounts}
                onModeChange={(m) => setMode("accounts", m)}
                picker={
                  <EntityPicker
                    label="accounts"
                    orgUrl={orgUrl}
                    entitySet="accounts"
                    idField="accountid"
                    nameField="name"
                    filter="statecode eq 0"
                    value={entityPicks.accounts}
                    onChange={(v) => setPicks("accounts", v)}
                  />
                }
              />
              <EntityRow
                label="Bookable Resources"
                hint={`Preset has ${preset.sampleTechnicians.length}.`}
                mode={entityModes.resources}
                onModeChange={(m) => setMode("resources", m)}
                picker={
                  <EntityPicker
                    label="bookable resources"
                    orgUrl={orgUrl}
                    entitySet="bookableresources"
                    idField="bookableresourceid"
                    nameField="name"
                    filter="statecode eq 0 and (resourcetype eq 1 or resourcetype eq 3 or resourcetype eq 4)"
                    value={entityPicks.resources}
                    onChange={(v) => setPicks("resources", v)}
                  />
                }
              />
              <EntityRow
                label="Work Orders"
                hint="Sample WOs across Open / Scheduled / Closed."
                mode={entityModes.workOrders}
                onModeChange={(m) => setMode("workOrders", m)}
                hideExisting
              />
              <EntityRow
                label="Bookings"
                hint="One booking per Scheduled WO across the next 5 business days."
                mode={entityModes.bookings}
                onModeChange={(m) => setMode("bookings", m)}
                hideExisting
              />
            </div>
          </div>
        )}

        <div className="card p-6 mb-6">
          <div className="space-y-3">
            {steps.map((s) => (
              <StepRow key={s.name} step={s} />
            ))}
          </div>

          {retryNotice && (
            <div className="mt-4 text-xs text-amber-300 flex items-center gap-2">
              <Warning size={14} />
              {retryNotice}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
              <Warning size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>Generation failed.</strong>
                <div className="mt-1 font-mono text-xs">{error}</div>
              </div>
            </div>
          )}

          <div className="flex gap-3 mt-6">
            {!result ? (
              <button
                onClick={handleStart}
                disabled={
                  running ||
                  (
                    Object.keys(entityModes) as Array<keyof typeof entityModes>
                  ).some(
                    (k) =>
                      entityModes[k] === "existing" &&
                      entityPicks[k].length === 0,
                  )
                }
                className="btn-primary flex items-center gap-2 disabled:opacity-50"
              >
                <Sparkle size={18} weight="bold" />
                {running ? "Generating…" : "Start generation"}
              </button>
            ) : (
              <button
                onClick={() => navigate("/dashboard")}
                className="btn-primary flex items-center gap-2"
              >
                Back to dashboard
                <ArrowRight size={18} weight="bold" />
              </button>
            )}
          </div>
        </div>

        {result && <ResultSummary result={result} preset={preset} orgUrl={orgUrl} />}
      </main>
    </div>
  );
}

function StepRow({ step }: { step: StepState }) {
  const pct = step.total > 0 ? Math.round((step.done / step.total) * 100) : 0;
  const Icon =
    step.status === "complete"
      ? CheckCircle
      : step.status === "running"
        ? CircleNotch
        : null;
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 mt-0.5 flex-shrink-0">
        {Icon &&
          (step.status === "running" ? (
            <Icon size={20} className="text-accent animate-spin" />
          ) : (
            <Icon size={20} className="text-emerald-400" weight="fill" />
          ))}
        {!Icon && (
          <div className="w-5 h-5 rounded-full border border-border bg-bg-elevated" />
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <span
            className={
              step.status === "pending"
                ? "text-slate-500"
                : "text-white font-medium"
            }
          >
            {step.name}
          </span>
          <span className="text-xs text-muted">
            {step.total > 0 ? `${step.done}/${step.total}` : ""}
          </span>
        </div>
        {step.detail && step.status === "running" && (
          <div className="text-xs text-slate-400 mt-0.5 truncate">
            → {step.detail}
          </div>
        )}
        {step.total > 0 && (
          <div className="mt-2 h-1 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function EntityRow({
  label,
  hint,
  mode,
  onModeChange,
  picker,
  hideExisting,
}: {
  label: string;
  hint: string;
  mode: "create" | "existing" | "skip";
  onModeChange: (m: "create" | "existing" | "skip") => void;
  picker?: React.ReactNode;
  /** When true, hide the "Use existing" option (e.g. for Work Orders / Bookings). */
  hideExisting?: boolean;
}) {
  return (
    <div className="border border-border rounded-lg p-3 bg-bg-base/40">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-white truncate">{label}</div>
          <div className="text-xs text-muted">{hint}</div>
        </div>
        <select
          aria-label={`Sourcing mode for ${label}`}
          value={mode}
          onChange={(e) =>
            onModeChange(e.target.value as "create" | "existing" | "skip")
          }
          className="bg-bg-elevated border border-border rounded px-2 py-1 text-xs text-white flex-shrink-0"
        >
          <option value="create">Create from preset</option>
          {!hideExisting && <option value="existing">Use existing</option>}
          <option value="skip">Skip</option>
        </select>
      </div>
      {mode === "existing" && picker}
    </div>
  );
}

function ResultSummary({
  result,
  preset,
  orgUrl,
}: {
  result: SeedResult;
  preset: FsPreset;
  orgUrl: string;
}) {
  const idMaps = result.idMaps ?? {};
  const createdIds = result.createdIds ?? {};
  // Phase 2+ entities go through the generic idMaps registry. Some only have
  // createdIds (no human-readable mapKey) — synthesize numbered labels for those.
  const fromIdMap = (key: string) => idMaps[key] ?? {};
  const fromCreatedIds = (key: string, label: string) =>
    Object.fromEntries((createdIds[key] ?? []).map((id, i) => [`${label} #${i + 1}`, id]));
  const sections: Array<{ title: string; entitySet: string; ids: Record<string, string> }> = [
    { title: "Territories", entitySet: "territories", ids: result.territoryIds },
    { title: "Work Order Types", entitySet: "msdyn_workordertypes", ids: result.workOrderTypeIds },
    { title: "Incident Types", entitySet: "msdyn_incidenttypes", ids: result.incidentTypeIds },
    { title: "Characteristics", entitySet: "characteristics", ids: result.characteristicIds },
    { title: "Products", entitySet: "products", ids: result.productIds },
    { title: "Accounts", entitySet: "accounts", ids: result.accountIds },
    { title: "Bookable Resources", entitySet: "bookableresources", ids: result.resourceIds },
    { title: "Functional Locations", entitySet: "msdyn_functionallocations", ids: fromIdMap("functionalLocations") },
    { title: "Customer Assets", entitySet: "msdyn_customerassets", ids: fromIdMap("customerAssets") },
    { title: "Service Task Types", entitySet: "msdyn_servicetasktypes", ids: fromIdMap("serviceTaskTypes") },
    { title: "Agreements", entitySet: "msdyn_agreements", ids: fromIdMap("agreements") },
    { title: "Warehouses", entitySet: "msdyn_warehouses", ids: fromIdMap("warehouses") },
    { title: "Product Inventory", entitySet: "msdyn_productinventories", ids: fromCreatedIds("productInventory", "Inventory") },
    {
      title: "Work Orders",
      entitySet: "msdyn_workorders",
      ids: Object.fromEntries(result.workOrderIds.map((id, i) => [`WO #${i + 1}`, id])),
    },
    { title: "WO Service Tasks", entitySet: "msdyn_workorderservicetasks", ids: fromCreatedIds("workOrderServiceTasks", "Task") },
    {
      title: "Bookings",
      entitySet: "bookableresourcebookings",
      ids: Object.fromEntries(result.bookingIds.map((id, i) => [`Booking #${i + 1}`, id])),
    },
    { title: "WO Products", entitySet: "msdyn_workorderproducts", ids: fromCreatedIds("workOrderProducts", "Line") },
    { title: "Time Entries", entitySet: "msdyn_timeentries", ids: fromCreatedIds("timeEntries", "Entry") },
    { title: "IoT Alerts", entitySet: "msdyn_iotalerts", ids: fromCreatedIds("iotAlerts", "Alert") },
  ].filter((s) => Object.keys(s.ids).length > 0);
  const total = sections.reduce((n, s) => n + Object.keys(s.ids).length, 0);

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-2">
        <CheckCircle size={22} weight="fill" className="text-emerald-400" />
        <h2 className="text-lg font-bold text-white">
          Created {total} records for {preset.companyName}
        </h2>
      </div>
      <p className="text-sm text-slate-400 mb-4">
        Click any record to open it in Dynamics.
      </p>
      <div className="space-y-4">
        {sections.map((s) => (
          <div key={s.title}>
            <h3 className="text-xs uppercase tracking-wider text-muted mb-2">
              {s.title} ({Object.keys(s.ids).length})
            </h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(s.ids).map(([key, id]) => (
                <a
                  key={id}
                  href={deepLink(orgUrl, s.entitySet, id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs px-2 py-1 rounded bg-bg-elevated border border-border hover:border-accent text-slate-300 hover:text-white transition-colors"
                >
                  {key}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
