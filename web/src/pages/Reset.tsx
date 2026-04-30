import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Trash,
  CheckCircle,
  CircleNotch,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { DataverseClient } from "@/lib/dataverse";
import {
  deleteRun,
  type SeedProgress,
} from "@/lib/fs/seed-config";
import { orgStore } from "@/lib/orgStore";
import { runHistory, type RunRecord } from "@/lib/runHistory";

type Mode = "idle" | "running" | "done" | "error";

export function Reset() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const orgUrl = orgStore.getOrgUrl() ?? "";

  const [mode, setMode] = useState<Mode>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);

  useEffect(() => {
    if (!accounts[0]) navigate("/");
    else if (!orgUrl) navigate("/connect");
  }, [accounts, orgUrl, navigate]);

  useEffect(() => {
    if (orgUrl) setRuns(runHistory.list(orgUrl));
  }, [orgUrl]);

  const orgHost = orgUrl ? new URL(orgUrl).host : "";
  const running = mode === "running";

  async function handleDeleteRun(run: RunRecord) {
    setError(null);
    setResult(null);
    setActiveRunId(run.id);
    setMode("running");
    try {
      const dv = new DataverseClient({ orgUrl });
      const r = await deleteRun(dv, run.result, setProgress);
      setResult(r.deletedByEntity);
      runHistory.remove(orgUrl, run.id);
      setRuns(runHistory.list(orgUrl));
      setMode("done");
    } catch (err) {
      setError((err as Error).message);
      setMode("error");
    } finally {
      setProgress(null);
    }
  }

  async function handleDeleteAllRuns() {
    if (runs.length === 0) return;
    setError(null);
    setResult(null);
    setActiveRunId(null);
    setMode("running");
    const totals: Record<string, number> = {};
    try {
      const dv = new DataverseClient({ orgUrl });
      // Snapshot before mutation, since we remove from history as we go.
      const snapshot = [...runs];
      for (const run of snapshot) {
        setActiveRunId(run.id);
        const r = await deleteRun(dv, run.result, setProgress);
        for (const [k, v] of Object.entries(r.deletedByEntity)) {
          totals[k] = (totals[k] ?? 0) + v;
        }
        runHistory.remove(orgUrl, run.id);
        setRuns(runHistory.list(orgUrl));
      }
      setActiveRunId(null);
      setResult(totals);
      setMode("done");
    } catch (err) {
      setError((err as Error).message);
      setMode("error");
    } finally {
      setProgress(null);
    }
  }

  if (!orgUrl) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader orgUrl={orgUrl} />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
        <div className="flex items-center gap-3 mb-2">
          <Trash size={28} className="text-red-400" weight="duotone" />
          <h1 className="text-3xl font-bold text-white">Reset demo data</h1>
        </div>
        <p className="text-slate-400 mb-8">
          Delete records this tool created in{" "}
          <strong className="text-white">{orgHost}</strong>. Pick a specific
          run to clear just that load, or delete every load at once. Each run
          tracks the exact records it created, so cleanup is precise — no tag
          scans, no false positives.
        </p>

        {/* Per-run history */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-3">
            <ClockCounterClockwise
              size={20}
              weight="duotone"
              className="text-accent"
            />
            <h2 className="font-semibold text-white">Recent loads</h2>
            <span className="text-xs text-muted">
              ({runs.length} on this device)
            </span>
          </div>

          {runs.length === 0 ? (
            <p className="text-sm text-muted">
              No runs recorded yet. After you click <em>Start generation</em>{" "}
              on the Generate page, the run will appear here so you can wipe
              it individually.
            </p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => {
                const isActive = activeRunId === r.id && running;
                return (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-bg-base/40"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {r.companyName}
                      </div>
                      <div className="text-xs text-muted">
                        {new Date(r.timestamp).toLocaleString()} ·{" "}
                        {r.totals.accounts} accts · {r.totals.workOrders} WOs ·{" "}
                        {r.totals.bookings} bookings · {r.totals.resources}{" "}
                        resources
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteRun(r)}
                      disabled={running}
                      className="text-xs px-3 py-1.5 rounded-md bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 flex items-center gap-1.5 disabled:opacity-40"
                    >
                      {isActive ? (
                        <CircleNotch size={12} className="animate-spin" />
                      ) : (
                        <Trash size={12} weight="bold" />
                      )}
                      {isActive ? "Deleting…" : "Delete this run"}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[11px] text-muted mt-3">
            History is stored in your browser's localStorage — it lives
            per-device. Deleting a run also removes it from this list.
            Bookable resources you brought from your own org (the “use
            existing” mode) are skipped automatically.
          </p>

          {runs.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border flex items-center justify-between gap-3">
              <div className="text-xs text-muted">
                Delete every load shown above in one go.
              </div>
              <button
                onClick={handleDeleteAllRuns}
                disabled={running}
                className="text-xs px-3 py-1.5 rounded-md bg-red-600/80 hover:bg-red-600 text-white flex items-center gap-1.5 disabled:opacity-40"
              >
                <Trash size={12} weight="bold" />
                Delete all {runs.length} runs
              </button>
            </div>
          )}
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => navigate("/dashboard")}
            className="btn-ghost"
            disabled={running}
          >
            Back to dashboard
          </button>
        </div>

        {progress && (
          <div className="mt-4 text-sm text-slate-400">
            {progress.step}: {progress.done}/{progress.total}
          </div>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
            <strong>Reset failed.</strong>
            <div className="mt-1 font-mono text-xs">{error}</div>
          </div>
        )}

        {result && mode === "done" && (
          <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle size={18} weight="fill" />
              <strong>Done</strong>
            </div>
            <ul className="text-xs space-y-1 font-mono">
              {Object.entries(result).map(([entity, count]) => (
                <li key={entity}>
                  {entity}: {count} deleted
                </li>
              ))}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
