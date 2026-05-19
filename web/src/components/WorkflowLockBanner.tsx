/**
 * v1.43.0 — Workflow lock banner.
 *
 * Detects the user's most recent run on the currently-connected org and, if
 * that run skipped any records, shows an amber banner before they start a
 * brand-new run on top of it. This is the "remind me to clean up first" UX
 * that prevents the compounding-mess problem where each run leaves a longer
 * tail of skipped rows than the last.
 *
 * Renders nothing if the last run had zero skips (the happy path).
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Warning, Eye, Trash } from "@phosphor-icons/react";
import { runHistory } from "@/lib/runHistory";

interface Props {
  orgUrl: string;
}

export function WorkflowLockBanner({ orgUrl }: Props) {
  const navigate = useNavigate();
  const lastRun = useMemo(() => {
    const runs = runHistory.list(orgUrl);
    return runs[0] ?? null;
  }, [orgUrl]);

  if (!lastRun) return null;

  const skipped = lastRun.result.skipped ?? {};
  const totalSkipped = Object.values(skipped).reduce(
    (sum, arr) => sum + (arr?.length ?? 0),
    0,
  );
  if (totalSkipped === 0) return null;

  const topReasons = (() => {
    const byReason: Record<string, number> = {};
    for (const arr of Object.values(skipped)) {
      for (const r of arr ?? []) {
        const key = r.reason || "unknown";
        byReason[key] = (byReason[key] ?? 0) + 1;
      }
    }
    return Object.entries(byReason)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
  })();

  const when = new Date(lastRun.timestamp);
  const ago = (() => {
    const ms = Date.now() - when.getTime();
    const min = Math.round(ms / 60000);
    if (min < 60) return `${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const d = Math.round(hr / 24);
    return `${d}d ago`;
  })();

  return (
    <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-amber-200">
      <div className="flex items-start gap-3">
        <Warning size={20} className="flex-shrink-0 mt-0.5" weight="bold" />
        <div className="flex-1">
          <div className="font-semibold text-amber-100">
            Last run on this org skipped {totalSkipped}{" "}
            {totalSkipped === 1 ? "record" : "records"}
          </div>
          <div className="text-xs text-amber-200/80 mt-1">
            <strong>{lastRun.companyName}</strong> · {ago} · run id{" "}
            <code className="font-mono">{lastRun.id.slice(0, 8)}</code>
          </div>
          {topReasons.length > 0 && (
            <ul className="text-xs text-amber-200/70 mt-2 list-disc list-inside space-y-0.5">
              {topReasons.map(([reason, count]) => (
                <li key={reason}>
                  <span className="font-mono">{reason}</span> — {count}
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-amber-200/80 mt-2">
            Starting a fresh run on top will compound the gap. Open the run
            details or reset the previous run first.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              onClick={() => navigate(`/reset?run=${encodeURIComponent(lastRun.id)}`)}
              className="inline-flex items-center gap-1.5 rounded border border-amber-400/40 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-400/10"
            >
              <Eye size={14} /> Review last run
            </button>
            <button
              onClick={() =>
                navigate(`/reset?run=${encodeURIComponent(lastRun.id)}&action=delete`)
              }
              className="inline-flex items-center gap-1.5 rounded border border-amber-400/40 px-2.5 py-1 text-xs text-amber-100 hover:bg-amber-400/10"
            >
              <Trash size={14} /> Reset last run
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
