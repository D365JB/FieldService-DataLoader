import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Trash,
  Warning,
  CheckCircle,
  CircleNotch,
  ClockCounterClockwise,
} from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { DataverseClient } from "@/lib/dataverse";
import {
  resetDemoData,
  deleteRun,
  DEMO_TAG,
  type SeedProgress,
} from "@/lib/fs/seed-config";
import { orgStore } from "@/lib/orgStore";
import { runHistory, type RunRecord } from "@/lib/runHistory";

type Mode = "idle" | "running" | "done" | "error";

export function Reset() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const orgUrl = orgStore.getOrgUrl() ?? "";

  const [confirmText, setConfirmText] = useState("");
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

  const expectedConfirm = useMemo(
    () => (orgUrl ? new URL(orgUrl).host : ""),
    [orgUrl],
  );
  const confirmed = confirmText.trim() === expectedConfirm;
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

  async function handleFullReset() {
    if (!confirmed) return;
    setError(null);
    setResult(null);
    setActiveRunId(null);
    setMode("running");
    try {
      const dv = new DataverseClient({ orgUrl });
      const r = await resetDemoData(dv, setProgress);
      setResult(r.deletedByEntity);
      runHistory.clear(orgUrl);
      setRuns([]);
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
          <strong className="text-white">{expectedConfirm}</strong>. Pick a
          specific run to clear just that load, or wipe everything tagged{" "}
          <code className="text-accent">{DEMO_TAG}:</code>.
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
        </div>

        {/* Full reset */}
        <div className="card p-6">
          <h2 className="font-semibold text-white mb-1">Wipe everything</h2>
          <p className="text-xs text-muted mb-3">
            Catch-all: deletes every record whose description still starts
            with <code>{DEMO_TAG}:</code>, even runs created on other devices
            or before history tracking. Real data is untouched.
          </p>

          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2 mb-4">
            <Warning size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              This deletes service tasks, incident types, work order types,
              characteristics, products, accounts, work orders, bookings, and
              demo-tagged bookable resources from{" "}
              <strong>{expectedConfirm}</strong>. Cannot be undone.
            </div>
          </div>

          <label className="block text-sm font-medium text-slate-300 mb-2">
            Type <code className="text-accent">{expectedConfirm}</code> to
            confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expectedConfirm}
            disabled={running}
            className="w-full bg-bg-elevated border border-border rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
          />

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleFullReset}
              disabled={!confirmed || running}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {running && activeRunId === null ? (
                <CircleNotch size={18} className="animate-spin" />
              ) : (
                <Trash size={18} weight="bold" />
              )}
              {running && activeRunId === null
                ? "Deleting…"
                : "Delete all demo data"}
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="btn-ghost"
              disabled={running}
            >
              Cancel
            </button>
          </div>
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
