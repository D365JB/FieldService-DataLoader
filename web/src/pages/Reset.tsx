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
  MagnifyingGlass,
  Broom,
} from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { DataverseClient, deepLink } from "@/lib/dataverse";
import {
  deleteRun,
  expandSelection,
  pruneDeletedFromResult,
  SECTION_DEPENDENCIES,
  type SeedProgress,
} from "@/lib/fs/seed-config";
import { buildResultSections } from "@/lib/fs/resultSections";
import {
  verifyRun,
  prunePresentResult,
  type VerifyRunResult,
  type VerifyProgress,
} from "@/lib/fs/verifyRun";
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
    { label: "Incident Type Products", count: Object.keys(idMaps.incidentTypeProducts ?? {}).length },
    { label: "Accounts", count: Object.keys(r.accountIds).length },
    { label: "Technician Contacts", count: Object.keys(idMaps.technicianContacts ?? {}).length },
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
  const [customRunId, setCustomRunId] = useState<string | null>(null);
  const [customPicks, setCustomPicks] = useState<Set<string>>(new Set());
  const importInputRef = useRef<HTMLInputElement>(null);
  const [verifyingRunId, setVerifyingRunId] = useState<string | null>(null);
  const [verifyByRun, setVerifyByRun] = useState<Record<string, VerifyRunResult>>({});
  const [verifyProgress, setVerifyProgress] = useState<VerifyProgress | null>(null);

  useEffect(() => {
    if (!accounts[0]) navigate("/");
    else if (!orgUrl) navigate("/connect");
  }, [accounts, orgUrl, navigate]);

  useEffect(() => {
    if (orgUrl) setRuns(runHistory.list(orgUrl));
  }, [orgUrl]);

  // v1.43.0 — when arriving from the workflow-lock banner with ?run=<id>,
  // scroll the matching row into view and auto-expand it so the user lands
  // exactly on the run they need to deal with. Does NOT auto-delete even
  // when action=delete is present — that always requires an explicit click.
  useEffect(() => {
    if (!runs.length) return;
    const params = new URLSearchParams(window.location.search);
    const runId = params.get("run");
    if (!runId) return;
    const target = runs.find((r) => r.id === runId);
    if (!target) return;
    setExpandedRunId(target.id);
    requestAnimationFrame(() => {
      document
        .getElementById(`run-row-${target.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, [runs]);

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

  async function handleDeletePartial(run: RunRecord) {
    if (customPicks.size === 0) return;
    setError(null);
    setResult(null);
    setActiveRunId(run.id);
    setMode("running");
    try {
      const dv = new DataverseClient({ orgUrl });
      const expanded = expandSelection(customPicks);
      const r = await deleteRun(dv, run.result, setProgress, {
        selectedSectionTitles: expanded,
      });
      setResult(r.deletedByEntity);
      // Apply the prune locally and decide whether to remove or update the
      // run record. If the result has no records left, drop the run entirely.
      const pruned = pruneDeletedFromResult({ ...run.result }, r.deletedIdsByKey);
      const remainingSections = buildResultSections(pruned);
      if (remainingSections.length === 0) {
        runHistory.remove(orgUrl, run.id);
      } else {
        runHistory.update(orgUrl, run.id, pruned);
      }
      setRuns(runHistory.list(orgUrl));
      setCustomRunId(null);
      setCustomPicks(new Set());
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

  /**
   * Verify every tracked id in a run against the live environment. v1.41.6.
   * Stores the breakdown keyed by run id so the panel persists when a row
   * is collapsed/expanded.
   */
  async function handleVerify(run: RunRecord) {
    setError(null);
    setVerifyingRunId(run.id);
    setVerifyProgress({ completed: 0, total: 0 });
    setExpandedRunId(run.id);
    try {
      const dv = new DataverseClient({ orgUrl });
      const result = await verifyRun(dv, run.result, (p) => setVerifyProgress(p));
      setVerifyByRun((prev) => ({ ...prev, [run.id]: result }));
    } catch (err) {
      setError(`Verify failed: ${(err as Error).message}`);
    } finally {
      setVerifyingRunId(null);
      setVerifyProgress(null);
    }
  }

  /**
   * Drop ids whose verify result is `missing` from the on-device run record,
   * so its count badges and Custom-delete pickers reflect reality after
   * out-of-band deletions. Errors are kept (we can't be sure they're gone).
   */
  function handlePruneMissing(run: RunRecord) {
    const v = verifyByRun[run.id];
    if (!v || v.totals.missing === 0) return;
    const pruned = prunePresentResult(run.result, v);
    const remaining = buildResultSections(pruned);
    if (remaining.length === 0) {
      runHistory.remove(orgUrl, run.id);
    } else {
      runHistory.update(orgUrl, run.id, pruned);
    }
    setRuns(runHistory.list(orgUrl));
    setVerifyByRun((prev) => {
      const next = { ...prev };
      delete next[run.id];
      return next;
    });
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
                const sections = buildResultSections(r.result);
                return (
                  <li
                    key={r.id}
                    id={`run-row-${r.id}`}
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
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => handleVerify(r)}
                          disabled={running || verifyingRunId !== null}
                          title="Check whether every record this run created still exists in Dynamics"
                          className="text-xs px-3 py-1.5 rounded-md bg-bg-elevated hover:bg-bg-base border border-border hover:border-accent text-slate-300 hover:text-white flex items-center gap-1.5 disabled:opacity-40"
                        >
                          {verifyingRunId === r.id ? (
                            <CircleNotch size={12} className="animate-spin" />
                          ) : (
                            <MagnifyingGlass size={12} weight="bold" />
                          )}
                          {verifyingRunId === r.id ? "Verifying…" : "Verify"}
                        </button>
                        <button
                          onClick={() => {
                            const next = customRunId === r.id ? null : r.id;
                            setCustomRunId(next);
                            setCustomPicks(new Set());
                            if (next) setExpandedRunId(r.id);
                          }}
                          disabled={running}
                          title="Pick specific entity types to delete from this run"
                          className="text-xs px-3 py-1.5 rounded-md bg-bg-elevated hover:bg-bg-base border border-border hover:border-accent text-slate-300 hover:text-white flex items-center gap-1.5 disabled:opacity-40"
                        >
                          {customRunId === r.id ? "Cancel" : "Custom delete…"}
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
                    </div>
                    {isExpanded && (
                      <div className="border-t border-border px-3 py-3 bg-bg-base/60 space-y-3">
                        {verifyByRun[r.id] && (
                          <VerifyPanel
                            verify={verifyByRun[r.id]}
                            onPrune={() => handlePruneMissing(r)}
                            onDismiss={() =>
                              setVerifyByRun((prev) => {
                                const next = { ...prev };
                                delete next[r.id];
                                return next;
                              })
                            }
                          />
                        )}
                        {verifyingRunId === r.id && verifyProgress && (
                          <div className="text-xs text-muted">
                            Verifying {verifyProgress.currentSection ?? ""}…{" "}
                            {verifyProgress.completed}/{verifyProgress.total}
                          </div>
                        )}
                        {breakdown.length === 0 ? (
                          <p className="text-xs text-muted">
                            This run created no records.
                          </p>
                        ) : (
                          <>
                            {customRunId === r.id && (
                              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <p className="text-xs text-amber-200">
                                    Pick the entity types you want to wipe.
                                    Children of selected items are deleted
                                    automatically (e.g. picking{" "}
                                    <em>Work Orders</em> also clears Bookings,
                                    Tasks, Products, Time Entries).
                                  </p>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      if (customPicks.size === sections.length) {
                                        setCustomPicks(new Set());
                                      } else {
                                        setCustomPicks(
                                          new Set(sections.map((s) => s.title)),
                                        );
                                      }
                                    }}
                                    className="text-[11px] underline text-amber-200 hover:text-amber-100 shrink-0"
                                  >
                                    {customPicks.size === sections.length
                                      ? "Clear all"
                                      : "Select all"}
                                  </button>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5">
                                  {sections.map((s) => {
                                    const expanded = expandSelection(customPicks);
                                    const checked = customPicks.has(s.title);
                                    const cascaded = !checked && expanded.has(s.title);
                                    const childOf = Object.entries(
                                      SECTION_DEPENDENCIES,
                                    )
                                      .filter(
                                        ([parent, kids]) =>
                                          customPicks.has(parent) &&
                                          kids.includes(s.title),
                                      )
                                      .map(([p]) => p);
                                    return (
                                      <label
                                        key={s.title}
                                        className={`flex items-center gap-2 text-xs ${
                                          cascaded
                                            ? "text-amber-300/70"
                                            : "text-slate-200"
                                        }`}
                                        title={
                                          cascaded
                                            ? `Will be deleted as a child of: ${childOf.join(", ")}`
                                            : undefined
                                        }
                                      >
                                        <input
                                          type="checkbox"
                                          checked={checked || cascaded}
                                          disabled={cascaded}
                                          onChange={(e) => {
                                            const next = new Set(customPicks);
                                            if (e.target.checked) next.add(s.title);
                                            else next.delete(s.title);
                                            setCustomPicks(next);
                                          }}
                                          className="accent-red-400"
                                        />
                                        <span>{s.title}</span>
                                        <span className="text-[10px] text-muted ml-auto">
                                          {Object.keys(s.ids).length}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                                <div className="flex items-center justify-end gap-2 pt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleDeletePartial(r)}
                                    disabled={running || customPicks.size === 0}
                                    className="text-xs px-3 py-1.5 rounded-md bg-red-600/80 hover:bg-red-600 text-white flex items-center gap-1.5 disabled:opacity-40"
                                  >
                                    {isActive ? (
                                      <CircleNotch size={12} className="animate-spin" />
                                    ) : (
                                      <Trash size={12} weight="bold" />
                                    )}
                                    Delete selected
                                  </button>
                                </div>
                              </div>
                            )}
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
                            <div className="pt-3 border-t border-border space-y-3">
                              <p className="text-[11px] text-muted">
                                Click any record to open it in Dynamics.
                              </p>
                              {sections.map((s) => (
                                <div key={s.title}>
                                  <h4 className="text-[10px] uppercase tracking-wider text-muted mb-1.5">
                                    {s.title} ({Object.keys(s.ids).length})
                                  </h4>
                                  <div className="flex flex-wrap gap-1.5">
                                    {Object.entries(s.ids).map(([key, id]) => (
                                      <a
                                        key={id}
                                        href={deepLink(orgUrl, s.entitySet, id)}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[11px] px-2 py-0.5 rounded bg-bg-elevated border border-border hover:border-accent text-slate-300 hover:text-white transition-colors"
                                      >
                                        {key}
                                      </a>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
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

// ── VerifyPanel ────────────────────────────────────────────────────────────
// Renders the result of a `verifyRun` against the live environment: per-
// section present / missing / error counts, plus a "Prune missing" button
// that drops dead ids from the on-device run history. v1.41.6.

function VerifyPanel({
  verify,
  onPrune,
  onDismiss,
}: {
  verify: VerifyRunResult;
  onPrune: () => void;
  onDismiss: () => void;
}) {
  const { totals } = verify;
  const allClean = totals.missing === 0 && totals.error === 0;
  const tone = allClean
    ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
    : totals.error > 0
      ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
      : "border-sky-500/30 bg-sky-500/10 text-sky-200";

  return (
    <div className={`rounded-md border p-3 space-y-2 ${tone}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <MagnifyingGlass size={14} weight="bold" />
          <span className="font-semibold">Verification</span>
          <span className="text-slate-300">
            {totals.present}/{totals.total} present · {totals.missing} missing
            {totals.error > 0 ? ` · ${totals.error} error` : ""}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {totals.missing > 0 && (
            <button
              type="button"
              onClick={onPrune}
              title="Drop the missing ids from this run's local history. Records flagged 'error' are kept (we couldn't verify them)."
              className="text-[11px] px-2 py-1 rounded bg-bg-elevated border border-border hover:border-accent text-slate-200 hover:text-white flex items-center gap-1"
            >
              <Broom size={12} weight="bold" />
              Prune {totals.missing} missing
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            title="Dismiss this verification result"
            className="text-[11px] px-2 py-1 rounded bg-bg-elevated border border-border hover:border-accent text-slate-300 hover:text-white"
          >
            Dismiss
          </button>
        </div>
      </div>
      {(totals.missing > 0 || totals.error > 0) && (
        <ul className="text-[11px] grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 font-mono">
          {verify.sections
            .filter((s) => s.missingCount > 0 || s.errorCount > 0)
            .map((s) => (
              <li key={s.title} className="flex justify-between gap-2 text-slate-300">
                <span className="text-slate-400">{s.title}</span>
                <span>
                  <span className="text-emerald-300">{s.presentCount}</span>
                  {" / "}
                  <span className="text-rose-300">{s.missingCount}</span>
                  {s.errorCount > 0 && (
                    <>
                      {" / "}
                      <span className="text-amber-300">{s.errorCount}</span>
                    </>
                  )}
                </span>
              </li>
            ))}
        </ul>
      )}
      {allClean && (
        <p className="text-[11px] text-emerald-200/80">
          Every tracked record is still present in Dynamics. Delete this run
          to wipe them all.
        </p>
      )}
    </div>
  );
}
