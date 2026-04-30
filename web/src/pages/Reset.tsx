import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import {
  Trash,
  CheckCircle,
  CircleNotch,
  ClockCounterClockwise,
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  DownloadSimple,
  UploadSimple,
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

/** Pretty per-entity breakdown of what a run created. */
function summarizeRun(run: RunRecord): Array<{ label: string; count: number }> {
  const r = run.result;
  const idMaps = r.idMaps ?? {};
  const createdIds = r.createdIds ?? {};
  const out: Array<{ label: string; count: number }> = [
    { label: "Territories", count: Object.keys(r.territoryIds).length },
    { label: "Work Order Types", count: Object.keys(r.workOrderTypeIds).length },
    { label: "Incident Types", count: Object.keys(r.incidentTypeIds).length },
    { label: "Characteristics (Skills)", count: Object.keys(r.characteristicIds).length },
    { label: "Products", count: Object.keys(r.productIds).length },
    { label: "Accounts", count: Object.keys(r.accountIds).length },
    { label: "Bookable Resources (created)", count: r.createdResourceIds.length },
    { label: "Functional Locations", count: Object.keys(idMaps.functionalLocations ?? {}).length },
    { label: "Customer Assets", count: Object.keys(idMaps.customerAssets ?? {}).length },
    { label: "Service Task Types", count: Object.keys(idMaps.serviceTaskTypes ?? {}).length },
    { label: "Price Lists (auto-created)", count: (createdIds.priceLists ?? []).length },
    { label: "Agreements", count: Object.keys(idMaps.agreements ?? {}).length },
    { label: "Agreement Booking Setups", count: Object.keys(idMaps.agreementBookingSetups ?? {}).length },
    { label: "Agreement Booking Incidents", count: Object.keys(idMaps.agreementBookingIncidents ?? {}).length },
    { label: "Agreement Booking Products", count: Object.keys(idMaps.agreementBookingProducts ?? {}).length },
    { label: "Warehouses", count: Object.keys(idMaps.warehouses ?? {}).length },
    { label: "Product Inventory rows", count: Object.keys(idMaps.productInventory ?? {}).length },
    { label: "Work Orders", count: r.workOrderIds.length },
    { label: "WO Service Tasks", count: Object.keys(idMaps.workOrderServiceTasks ?? {}).length },
    { label: "WO Products", count: Object.keys(idMaps.workOrderProducts ?? {}).length },
    { label: "Bookings", count: r.bookingIds.length },
    { label: "Time Entries", count: Object.keys(idMaps.timeEntries ?? {}).length },
    { label: "IoT Alerts", count: Object.keys(idMaps.iotAlerts ?? {}).length },
  ];
  return out.filter((x) => x.count > 0);
}

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
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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

  function handleExport() {
    const payload = {
      schema: "fsdl-runs/v1",
      exportedAt: new Date().toISOString(),
      orgUrl,
      runs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    a.download = `fsdl-runs-${orgHost}-${stamp}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleImportFile(file: File) {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { runs?: RunRecord[] };
      const incoming = Array.isArray(data.runs) ? data.runs : [];
      if (!incoming.length) {
        setError("Import file contained no runs.");
        return;
      }
      const existing = runHistory.list(orgUrl);
      const existingIds = new Set(existing.map((r) => r.id));
      const merged = [
        ...incoming.filter((r) => r && r.id && !existingIds.has(r.id)),
        ...existing,
      ];
      // Persist via the public API to honour size cap.
      // runHistory exposes add() per record; replicate by writing all at once
      // through localStorage so import is one-shot.
      try {
        localStorage.setItem(
          `fsdl:runs:${orgUrl.replace(/\/+$/, "").toLowerCase()}`,
          JSON.stringify(merged.slice(0, 25)),
        );
      } catch {
        setError("Browser storage quota exceeded — couldn't save imported runs.");
        return;
      }
      setRuns(runHistory.list(orgUrl));
      setError(null);
    } catch (err) {
      setError(`Import failed: ${(err as Error).message}`);
    }
  }

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
            <div className="ml-auto flex items-center gap-2">
              <button
                type="button"
                onClick={handleExport}
                disabled={running || runs.length === 0}
                title="Download this device's run history as JSON"
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-md border border-border hover:border-accent transition-colors disabled:opacity-50"
              >
                <DownloadSimple size={14} weight="bold" />
                Export
              </button>
              <button
                type="button"
                onClick={() => importInputRef.current?.click()}
                disabled={running}
                title="Restore a previously exported runs file"
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-md border border-border hover:border-accent transition-colors disabled:opacity-50"
              >
                <UploadSimple size={14} weight="bold" />
                Import
              </button>
              <input
                ref={importInputRef}
                type="file"
                accept="application/json,.json"
                aria-label="Import runs file"
                title="Import runs file"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => orgUrl && setRuns(runHistory.list(orgUrl))}
                disabled={running}
                title="Refresh from this device's local history"
                className="inline-flex items-center gap-1.5 text-xs text-slate-300 hover:text-white px-2.5 py-1 rounded-md border border-border hover:border-accent transition-colors disabled:opacity-50"
              >
                <ArrowsClockwise size={14} weight="bold" />
                Refresh
              </button>
            </div>
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
                const isExpanded = expandedRunId === r.id;
                const breakdown = summarizeRun(r);
                return (
                  <li
                    key={r.id}
                    className="rounded-lg border border-border bg-bg-base/40"
                  >
                    <div className="flex items-center justify-between gap-3 p-3">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedRunId(isExpanded ? null : r.id)
                        }
                        className="flex-1 min-w-0 text-left flex items-start gap-2 hover:opacity-80"
                        title={isExpanded ? "Hide details" : "Show details"}
                      >
                        {isExpanded ? (
                          <CaretDown size={14} className="mt-1 text-muted shrink-0" />
                        ) : (
                          <CaretRight size={14} className="mt-1 text-muted shrink-0" />
                        )}
                        <div className="min-w-0">
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
                      </button>
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
                    </div>
                    {isExpanded && (
                      <div className="border-t border-border px-3 py-3 bg-bg-base/60">
                        {breakdown.length === 0 ? (
                          <p className="text-xs text-muted">
                            This run created no records.
                          </p>
                        ) : (
                          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                            {breakdown.map((b) => (
                              <li
                                key={b.label}
                                className="flex justify-between gap-2 font-mono text-slate-300"
                              >
                                <span className="text-slate-400">{b.label}</span>
                                <span className="text-white">{b.count}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            <strong className="text-slate-300">How history is stored:</strong>{" "}
            run records live in this browser's <code>localStorage</code> under
            the key <code>fsdl:runs:&lt;org&gt;</code> — they are{" "}
            <em>per-device, per-browser</em>. They do not roam between machines
            or sync to Dataverse. Use{" "}
            <strong className="text-slate-300">Export</strong> to download a
            JSON file you can keep, share, or restore later via{" "}
            <strong className="text-slate-300">Import</strong>. The newest 25
            runs are kept; older entries roll off automatically. Bookable
            resources you brought from your own org (the “use existing” mode)
            are tracked but skipped during deletion.
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
