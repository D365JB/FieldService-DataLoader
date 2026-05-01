import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Sparkle,
  Warning,
  CheckCircle,
  CircleNotch,
  XCircle,
  ArrowRight,
  Info,
} from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { DataverseClient, deepLink } from "@/lib/dataverse";
import { seedFromPreset, type SeedProgress, type SeedResult, type SeedOptions, type EntityChoice } from "@/lib/fs/seed-config";
import { SKIP_REASON_LABEL, type SkipReason } from "@/lib/fs/safeWrite";
import { buildResultSections } from "@/lib/fs/resultSections";
import type { FsPreset } from "@/lib/preset";
import { orgStore } from "@/lib/orgStore";
import { track } from "@/lib/telemetry";
import { runHistory } from "@/lib/runHistory";
import { activeRunStore } from "@/lib/activeRunStore";
import { useActiveRun } from "@/lib/useActiveRun";
import { EntityPicker, type PickedEntity } from "@/components/EntityPicker";
import { GenerationKnobsPanel } from "@/components/GenerationKnobsPanel";
import { generationKnobs, type GenerationKnobs } from "@/lib/generationKnobs";

interface StepState {
  name: string;
  done: number;
  total: number;
  detail?: string;
  status: "pending" | "running" | "complete" | "failed";
}

const STEP_ORDER = [
  "Territories",
  "Work Order Types",
  "Characteristics",
  "Incident Types",
  "Products",
  "Incident Type Products",
  "Accounts",
  "Technician Contacts",
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
  "Close Work Orders",
  "IoT Alerts",
];

// Map each entity to the entities it needs upstream. If any of those is
// skipped, this entity will either be empty or fail outright — we surface
// that as an inline warning on the entity row.
const DEPENDENCIES: Record<string, string[]> = {
  accounts: ["territories"],
  resources: ["territories", "characteristics"],
  functionalLocations: ["accounts"],
  customerAssets: ["accounts"],
  agreements: ["accounts", "incidentTypes", "products"],
  workOrders: ["accounts", "workOrderTypes", "incidentTypes", "territories"],
  workOrderServiceTasks: ["workOrders", "serviceTaskTypes"],
  bookings: ["workOrders", "resources"],
  workOrderProducts: ["workOrders", "products"],
  timeEntries: ["bookings"],
  iotAlerts: ["customerAssets"],
  productInventory: ["warehouses", "products"],
  incidentTypeProducts: ["incidentTypes", "products"],
};

const ENTITY_LABELS: Record<string, string> = {
  territories: "Territories",
  workOrderTypes: "Work Order Types",
  characteristics: "Characteristics",
  incidentTypes: "Incident Types",
  products: "Products",
  accounts: "Accounts",
  resources: "Bookable Resources",
  workOrders: "Work Orders",
  bookings: "Bookings",
  functionalLocations: "Functional Locations",
  customerAssets: "Customer Assets",
  serviceTaskTypes: "Service Task Types",
  agreements: "Agreements",
  warehouses: "Warehouses",
  productInventory: "Product Inventory",
  workOrderServiceTasks: "WO Service Tasks",
  workOrderProducts: "WO Products",
  timeEntries: "Time Entries",
  iotAlerts: "IoT Alerts",
  incidentTypeProducts: "Incident Type Products",
};

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

  // Mirror the global store so an in-flight run survives navigation away
  // from this page. When the user comes back, we hydrate from the store.
  const activeRun = useActiveRun();
  useEffect(() => {
    // Only adopt store state if it matches THIS preset/org. Otherwise the
    // user is starting a fresh page after a previous run completed.
    if (
      activeRun.startedAt &&
      preset &&
      activeRun.companyName === preset.companyName &&
      activeRun.orgUrl === orgUrl
    ) {
      // Map the store's ActiveStep[] back into local StepState shape — they
      // share the same fields, so this is essentially identity.
      setSteps(
        activeRun.steps.length > 0
          ? activeRun.steps.map((s) => ({
              name: s.name,
              done: s.done,
              total: s.total,
              detail: s.detail,
              status: s.status,
            }))
          : STEP_ORDER.map((name) => ({
              name,
              done: 0,
              total: 0,
              status: "pending",
            })),
      );
      setRunning(activeRun.running);
      setError(activeRun.error);
      setRetryNotice(activeRun.retryNotice);
      setResult(activeRun.result);
    }
  }, [activeRun, preset, orgUrl]);

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
    | "bookings"
    | "functionalLocations"
    | "customerAssets"
    | "serviceTaskTypes"
    | "agreements"
    | "warehouses"
    | "productInventory"
    | "workOrderServiceTasks"
    | "workOrderProducts"
    | "timeEntries"
    | "iotAlerts";
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
    functionalLocations: "create",
    customerAssets: "create",
    serviceTaskTypes: "create",
    agreements: "create",
    warehouses: "create",
    productInventory: "create",
    workOrderServiceTasks: "create",
    workOrderProducts: "create",
    timeEntries: "create",
    iotAlerts: "create",
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
    functionalLocations: [],
    customerAssets: [],
    serviceTaskTypes: [],
    agreements: [],
    warehouses: [],
    productInventory: [],
    workOrderServiceTasks: [],
    workOrderProducts: [],
    timeEntries: [],
    iotAlerts: [],
  });
  const [knobs, setKnobs] = useState<GenerationKnobs>(() =>
    orgUrl ? generationKnobs.load(orgUrl) : generationKnobs.load(""),
  );
  function setMode(k: EntityKey, m: Mode) {
    setEntityModes((s) => ({ ...s, [k]: m }));
  }
  function setPicks(k: EntityKey, v: PickedEntity[]) {
    setEntityPicks((s) => ({ ...s, [k]: v }));
  }
  // If this entity is enabled (create or existing) but any of its upstream
  // dependencies is set to "skip", show an inline warning so the user knows
  // this row will be empty or may fail.
  function warningFor(k: EntityKey): string | null {
    if (entityModes[k] === "skip") return null;
    const deps = DEPENDENCIES[k] ?? [];
    const skipped = deps.filter((d) => entityModes[d as EntityKey] === "skip");
    if (skipped.length === 0) return null;
    const names = skipped.map((d) => ENTITY_LABELS[d] ?? d).join(", ");
    return `Depends on ${names}, which ${skipped.length === 1 ? "is" : "are"} set to Skip. This step will be empty or fail \u2014 set ${skipped.length === 1 ? "it" : "them"} back to Create or pick existing records.`;
  }

  useEffect(() => {
    if (!accounts[0]) navigate("/");
    else if (!orgUrl) navigate("/connect");
    else if (!preset) navigate("/analyze");
  }, [accounts, orgUrl, preset, navigate]);

  if (!preset || !orgUrl) return null;

  function applyProgress(p: SeedProgress) {
    activeRunStore.applyProgress(p);
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
    activeRunStore.start({
      companyName: preset.companyName,
      orgUrl,
      stepOrder: STEP_ORDER,
    });
    const startedAt = Date.now();
    track("action", {
      detail: { name: "generate.start", companyName: preset.companyName, orgUrl },
    });
    try {
      const dv = new DataverseClient({
        orgUrl,
        onRetry: (attempt, status, waitMs) => {
          const notice = `Dataverse ${status || "network error"} — retry ${attempt} in ${Math.round(waitMs / 1000)}s`;
          activeRunStore.setRetryNotice(notice);
          setRetryNotice(notice);
        },
      });
      const seedOptions: SeedOptions = {};
      seedOptions.knobs = knobs;
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
        "functionalLocations",
        "customerAssets",
        "serviceTaskTypes",
        "agreements",
        "warehouses",
        "productInventory",
        "workOrderServiceTasks",
        "workOrderProducts",
        "timeEntries",
        "iotAlerts",
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
      activeRunStore.complete(seedResult);
      // Mark all steps complete (in case last step had total 0).
      setSteps((prev) => prev.map((s) => ({ ...s, status: "complete" })));
      setRetryNotice(null);
      track("action", {
        detail: {
          name: "generate.success",
          companyName: preset.companyName,
          durationMs: Date.now() - startedAt,
        },
      });
    } catch (err) {
      // If seedFromPreset failed mid-run, it attaches whatever was
      // created up to that point so we can still record it for cleanup.
      const partial = (err as { partialResult?: typeof result }).partialResult;
      if (partial) {
        setResult(partial);
        try {
          runHistory.add(orgUrl, `${preset.companyName} (partial)`, partial);
        } catch {
          /* localStorage write failures shouldn't mask the original error */
        }
      }
      const message = (err as Error).message;
      setError(message);
      // Stop the in-flight spinner: mark whichever step was running as
      // failed so the row stops animating and shows a red X.
      setSteps((prev) =>
        prev.map((s) =>
          s.status === "running" ? { ...s, status: "failed" } : s,
        ),
      );
      activeRunStore.fail(message, partial ?? null);
      track("error", {
        detail: {
          name: "generate.fail",
          companyName: preset.companyName,
          message,
          durationMs: Date.now() - startedAt,
        },
      });
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
          <GenerationKnobsPanel orgUrl={orgUrl} value={knobs} onChange={setKnobs} />
        )}

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
                warning={warningFor("territories")}
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
                warning={warningFor("workOrderTypes")}
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
                warning={warningFor("characteristics")}
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
                warning={warningFor("incidentTypes")}
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
                warning={warningFor("products")}
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
                warning={warningFor("accounts")}
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
                warning={warningFor("resources")}
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
                label="Functional Locations"
                hint={`Preset has ${preset.functionalLocations?.length ?? 0}.`}
                mode={entityModes.functionalLocations}
                onModeChange={(m) => setMode("functionalLocations", m)}
                warning={warningFor("functionalLocations")}
                picker={
                  <EntityPicker
                    label="functional locations"
                    orgUrl={orgUrl}
                    entitySet="msdyn_functionallocations"
                    idField="msdyn_functionallocationid"
                    nameField="msdyn_name"
                    filter="statecode eq 0"
                    value={entityPicks.functionalLocations}
                    onChange={(v) => setPicks("functionalLocations", v)}
                  />
                }
              />
              <AutoLoadRow
                label="Customer Assets"
                hint={`Preset has ${preset.customerAssets?.length ?? 0}.`}
                mode={entityModes.customerAssets}
                onModeChange={(m) => setMode("customerAssets", m)}
                warning={warningFor("customerAssets")}
              />
              <AutoLoadRow
                label="Service Task Types"
                hint={`Preset has ${preset.serviceTaskTypes?.length ?? 0}. WO Service Tasks pull from this catalog.`}
                mode={entityModes.serviceTaskTypes}
                onModeChange={(m) => setMode("serviceTaskTypes", m)}
                warning={warningFor("serviceTaskTypes")}
              />
              <AutoLoadRow
                label="Agreements"
                hint={`Preset has ${preset.agreements?.length ?? 0}. Booking setups + line items included.`}
                mode={entityModes.agreements}
                onModeChange={(m) => setMode("agreements", m)}
                warning={warningFor("agreements")}
              />
              <AutoLoadRow
                label="Warehouses"
                hint={`Preset has ${preset.warehouses?.length ?? 0}.`}
                mode={entityModes.warehouses}
                onModeChange={(m) => setMode("warehouses", m)}
                warning={warningFor("warehouses")}
              />
              <AutoLoadRow
                label="Product Inventory"
                hint="On-hand stock per warehouse × product."
                mode={entityModes.productInventory}
                onModeChange={(m) => setMode("productInventory", m)}
                warning={warningFor("productInventory")}
              />
              <EntityRow
                label="Work Orders"
                hint="Sample WOs across Open / Scheduled / Closed."
                mode={entityModes.workOrders}
                onModeChange={(m) => setMode("workOrders", m)}
                warning={warningFor("workOrders")}
                hideExisting
              />
              <AutoLoadRow
                label="WO Service Tasks"
                hint="2–4 tasks per WO from the Service Task Type catalog."
                mode={entityModes.workOrderServiceTasks}
                onModeChange={(m) => setMode("workOrderServiceTasks", m)}
                warning={warningFor("workOrderServiceTasks")}
              />
              <EntityRow
                label="Bookings"
                hint="One booking per Scheduled WO across the next 5 business days."
                mode={entityModes.bookings}
                onModeChange={(m) => setMode("bookings", m)}
                warning={warningFor("bookings")}
                hideExisting
              />
              <AutoLoadRow
                label="WO Products"
                hint="1–3 product lines per WO (Estimated for open, Used for closed)."
                mode={entityModes.workOrderProducts}
                onModeChange={(m) => setMode("workOrderProducts", m)}
                warning={warningFor("workOrderProducts")}
              />
              <AutoLoadRow
                label="Time Entries"
                hint="One submitted Work entry per booking."
                mode={entityModes.timeEntries}
                onModeChange={(m) => setMode("timeEntries", m)}
                warning={warningFor("timeEntries")}
              />
              <AutoLoadRow
                label="IoT Alerts"
                hint="One Connected Field Service alert per Customer Asset."
                mode={entityModes.iotAlerts}
                onModeChange={(m) => setMode("iotAlerts", m)}
                warning={warningFor("iotAlerts")}
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
              <div className="flex-1">
                <strong>
                  Generation stopped on{" "}
                  {steps.find((s) => s.status === "failed")?.name ??
                    "an unknown step"}
                  .
                </strong>
                {(() => {
                  const h = humanizeGenerateError(error);
                  return (
                    <>
                      <div className="mt-1 text-red-200">{h.summary}</div>
                      {h.advice && (
                        <div className="mt-1 text-red-200/80">
                          <strong>What to try:</strong> {h.advice}
                        </div>
                      )}
                      <details className="mt-2">
                        <summary className="cursor-pointer text-xs text-red-200/70 hover:text-red-200">
                          Show technical details
                        </summary>
                        <div className="mt-1 font-mono text-xs whitespace-pre-wrap break-all text-red-200/70">
                          {error}
                        </div>
                      </details>
                    </>
                  );
                })()}
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
  return (
    <div className="flex items-start gap-3">
      <div className="w-6 mt-0.5 flex-shrink-0">
        {step.status === "running" && (
          <CircleNotch size={20} className="text-accent animate-spin" />
        )}
        {step.status === "complete" && (
          <CheckCircle size={20} className="text-emerald-400" weight="fill" />
        )}
        {step.status === "failed" && (
          <XCircle size={20} className="text-red-400" weight="fill" />
        )}
        {step.status === "pending" && (
          <div className="w-5 h-5 rounded-full border border-border bg-bg-elevated" />
        )}
      </div>
      <div className="flex-1">
        <div className="flex items-baseline justify-between">
          <span
            className={
              step.status === "pending"
                ? "text-slate-500"
                : step.status === "failed"
                  ? "text-red-300 font-medium"
                  : "text-white font-medium"
            }
          >
            {step.name}
          </span>
          <span className="text-xs text-muted">
            {step.total > 0 ? `${step.done}/${step.total}` : ""}
          </span>
        </div>
        {step.detail &&
          (step.status === "running" || step.status === "failed") && (
            <div
              className={`text-xs mt-0.5 truncate ${
                step.status === "failed" ? "text-red-300" : "text-slate-400"
              }`}
            >
              → {step.detail}
            </div>
          )}
        {step.total > 0 && (
          <div className="mt-2 h-1 bg-bg-elevated rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                step.status === "failed" ? "bg-red-500/60" : "bg-accent"
              }`}
              style={{ width: `${pct}%` }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Translate a low-level Dataverse / seeder error message into a one-line
 * human summary plus actionable advice. We pattern-match the common ones
 * we know about; everything else falls through to a generic message and
 * the raw error stays available under "Show technical details".
 */
function humanizeGenerateError(message: string): {
  summary: string;
  advice?: string;
} {
  const m = message.toLowerCase();

  if (
    m.includes("can't change the status to 'unscheduled'") ||
    m.includes("can't change the status to \"unscheduled\"") ||
    (m.includes("msdyn_workorders") && m.includes("bookings that have"))
  ) {
    return {
      summary:
        "A Work Order from a previous run already has Scheduled / In Progress / Completed bookings, so Field Service refused to re-open it for editing.",
      advice:
        "Either delete that previous run's Work Orders + Bookings via the Cleanup page, or pick a fresh org. The seeder cannot heal Posted-with-bookings WOs in place because the FS plugin blocks the status flip.",
    };
  }
  if (m.includes("0x80040217") || m.includes("does not exist")) {
    return {
      summary:
        "Dataverse rejected a record reference \u2014 something the seeder expected to find isn't there.",
      advice:
        "Open Show technical details below; the entity name in the message tells you which table is missing. Common cause: an existing-record pick was deleted between selection and Apply.",
    };
  }
  if (m.includes("0x8004f01c") || m.includes("dependent component")) {
    return {
      summary:
        "Field Service plugin blocked the write because of a missing or inactive dependent record (skill, territory, status mapping, etc).",
      advice:
        "Check the row that failed in the technical details, then verify the dependency in the org (e.g. the Bookable Resource has a primary territory and at least one characteristic).",
    };
  }
  if (m.includes("401") || m.includes("unauthorized") || m.includes("token")) {
    return {
      summary:
        "Your Dataverse access token expired or was rejected mid-run.",
      advice:
        "Refresh this page, sign in again, then re-run. Picked existing records will need to be selected again.",
    };
  }
  if (m.includes("429") || m.includes("rate") || m.includes("throttl")) {
    return {
      summary: "Dataverse throttled the run after too many requests.",
      advice:
        "Wait a minute and re-run. If it keeps happening, lower the Work Order count on the Generate page or split the run into smaller batches.",
    };
  }
  if (
    m.includes("failed to fetch") ||
    m.includes("network error") ||
    m.includes("timed out")
  ) {
    return {
      summary: "The browser couldn't reach Dataverse to finish the call.",
      advice:
        "Check your VPN / proxy / network, then retry. If you're on a corporate proxy, the request body may have been too large \u2014 lower the Work Order count and try again.",
    };
  }
  if (
    m.includes("400") &&
    (m.includes("incident") || m.includes("workorder")) &&
    m.includes("territory")
  ) {
    return {
      summary:
        "A Work Order or Incident Type can't be saved because its territory link is missing or invalid.",
      advice:
        "Re-pick existing Territories on the Generate page and re-run, or set Territories back to Create.",
    };
  }

  return {
    summary:
      "The seeder hit an error it doesn't have a friendly explanation for yet.",
    advice:
      "See Show technical details below for the raw Dataverse response. Partial records up to this point have been kept and can be cleaned up from the Dashboard.",
  };
}

function EntityRow({
  label,
  hint,
  mode,
  onModeChange,
  picker,
  hideExisting,
  warning,
}: {
  label: string;
  hint: string;
  mode: "create" | "existing" | "skip";
  onModeChange: (m: "create" | "existing" | "skip") => void;
  picker?: React.ReactNode;
  /** When true, hide the "Use existing" option (e.g. for Work Orders / Bookings). */
  hideExisting?: boolean;
  /** Optional warning text shown inline when upstream deps are skipped. */
  warning?: string | null;
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
      {warning && (
        <div className="mt-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 flex items-start gap-1.5">
          <Warning size={12} className="flex-shrink-0 mt-0.5" />
          <span>{warning}</span>
        </div>
      )}
      {mode === "existing" && picker}
    </div>
  );
}

function AutoLoadRow({
  label,
  hint,
  mode,
  onModeChange,
  warning,
}: {
  label: string;
  hint: string;
  mode: "create" | "existing" | "skip";
  onModeChange: (m: "create" | "existing" | "skip") => void;
  warning?: string | null;
}) {
  return (
    <div className="border border-border rounded-lg p-3 bg-bg-base/40">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <div className="text-sm font-semibold text-white truncate">{label}</div>
            <span
              title="AI-generated for this preset and tied to this run's accounts/products. 'Use existing' isn't offered — pick Skip if you don't want this loaded."
              className="text-muted hover:text-slate-300 cursor-help"
            >
              <Info size={12} />
            </span>
          </div>
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
          <option value="skip">Skip</option>
        </select>
      </div>
      {warning && (
        <div className="mt-2 text-[11px] text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5 flex items-start gap-1.5">
          <Warning size={12} className="flex-shrink-0 mt-0.5" />
          <span>{warning}</span>
        </div>
      )}
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
  const sections = buildResultSections(result);
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
      <SkippedRecords result={result} />
    </div>
  );
}

/**
 * Records the seeder gracefully skipped (Posted WOs, asset/account
 * mismatches, lat/long validation, etc.). Hidden when nothing was skipped.
 * Each entity is collapsed to a count-by-reason summary plus a
 * disclosure with the first few raw record labels for context.
 */
function SkippedRecords({ result }: { result: SeedResult }) {
  const skipped = result.skipped ?? {};
  const entities = Object.entries(skipped).filter(([, rows]) => rows.length > 0);
  if (entities.length === 0) return null;
  const totalSkipped = entities.reduce((n, [, rows]) => n + rows.length, 0);

  return (
    <div className="mt-6 pt-4 border-t border-border">
      <div className="flex items-center gap-2 mb-2">
        <Warning size={18} weight="fill" className="text-amber-400" />
        <h3 className="text-sm font-semibold text-white">
          {totalSkipped} record{totalSkipped === 1 ? "" : "s"} skipped
        </h3>
      </div>
      <p className="text-xs text-slate-400 mb-3">
        Field Service business rules rejected these records. The rest of the
        run completed successfully.
      </p>
      <div className="space-y-3">
        {entities.map(([entity, rows]) => {
          const byReason = rows.reduce<Record<SkipReason, typeof rows>>(
            (acc, r) => {
              (acc[r.reason] ??= []).push(r);
              return acc;
            },
            {} as Record<SkipReason, typeof rows>,
          );
          return (
            <details
              key={entity}
              className="rounded border border-border bg-bg-elevated/50 px-3 py-2"
            >
              <summary className="cursor-pointer text-xs text-slate-300 hover:text-white">
                <span className="font-medium">{entity}</span>{" "}
                <span className="text-slate-500">
                  ({rows.length} skipped:{" "}
                  {Object.entries(byReason)
                    .map(
                      ([reason, list]) =>
                        `${list.length} ${SKIP_REASON_LABEL[reason as SkipReason]}`,
                    )
                    .join("; ")}
                  )
                </span>
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-slate-400">
                {rows.slice(0, 8).map((r, i) => (
                  <li key={i} className="font-mono">
                    {r.recordLabel ?? "(no label)"} —{" "}
                    <span className="text-slate-500">
                      {SKIP_REASON_LABEL[r.reason]}
                    </span>
                  </li>
                ))}
                {rows.length > 8 && (
                  <li className="text-slate-500 italic">
                    …and {rows.length - 8} more
                  </li>
                )}
              </ul>
            </details>
          );
        })}
      </div>
    </div>
  );
}
