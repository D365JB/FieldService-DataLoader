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
import { seedFromPreset, type SeedProgress, type SeedResult } from "@/lib/fs/seed-config";
import type { FsPreset } from "@/lib/preset";
import { orgStore } from "@/lib/orgStore";

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
  "Work Orders",
  "Bookings",
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
      const seedResult = await seedFromPreset(dv, preset, applyProgress);
      setResult(seedResult);
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
                disabled={running}
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

function ResultSummary({
  result,
  preset,
  orgUrl,
}: {
  result: SeedResult;
  preset: FsPreset;
  orgUrl: string;
}) {
  const sections: Array<{ title: string; entitySet: string; ids: Record<string, string> }> = [
    { title: "Territories", entitySet: "territories", ids: result.territoryIds },
    { title: "Work Order Types", entitySet: "msdyn_workordertypes", ids: result.workOrderTypeIds },
    { title: "Incident Types", entitySet: "msdyn_incidenttypes", ids: result.incidentTypeIds },
    { title: "Characteristics", entitySet: "characteristics", ids: result.characteristicIds },
    { title: "Products", entitySet: "products", ids: result.productIds },
    { title: "Accounts", entitySet: "accounts", ids: result.accountIds },
    { title: "Bookable Resources", entitySet: "bookableresources", ids: result.resourceIds },
    {
      title: "Work Orders",
      entitySet: "msdyn_workorders",
      ids: Object.fromEntries(result.workOrderIds.map((id, i) => [`WO #${i + 1}`, id])),
    },
    {
      title: "Bookings",
      entitySet: "bookableresourcebookings",
      ids: Object.fromEntries(result.bookingIds.map((id, i) => [`Booking #${i + 1}`, id])),
    },
  ];
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
