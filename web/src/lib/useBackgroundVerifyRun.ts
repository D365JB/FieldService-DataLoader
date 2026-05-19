/**
 * v1.44.0 — Background verify-and-prune of the most-recent run.
 *
 * Run history is stored in `localStorage` so it survives across tabs and
 * sessions. That's great for the demo loop, but if the user (or a teammate)
 * deletes records out-of-band in Dataverse, the on-device list silently
 * drifts from reality and stale ids fail noisily when Reset tries to delete
 * them.
 *
 * This hook fires once on mount, against just the most recent run, and:
 *   1. Calls `verifyRun()` quietly (no progress UI).
 *   2. If anything is `missing`, prunes those ids from the SeedResult via
 *      `prunePresentResult()` and writes the cleaned result back through
 *      `runHistory.update()`.
 *   3. Returns a small `{ pruned, dismiss }` payload so the host page can
 *      surface a one-line dismissible toast ("3 records from your last run
 *      were deleted in Dataverse and removed from history.").
 *
 * Designed to be cheap and silent on the happy path: a single 8-way parallel
 * GET burst against Dataverse, < 1 KB of localStorage written when anything
 * changes, no toast unless something actually drifted.
 *
 * Failures are swallowed — verification is best-effort, not a feature path.
 * If the user is offline, signed out, or pointed at a dead org, the hook
 * just no-ops.
 */
import { useEffect, useRef, useState } from "react";
import type { DataverseClient } from "@/lib/dataverse";
import { runHistory } from "@/lib/runHistory";
import { prunePresentResult, verifyRun } from "@/lib/fs/verifyRun";

export interface BackgroundVerifyState {
  /** Number of records pruned from the most recent run. 0 when no drift. */
  pruned: number;
  /** The run's company name, for the toast copy. */
  companyName: string | null;
  /** Toast dismissed. Hide the banner once true. */
  dismissed: boolean;
}

export interface BackgroundVerifyApi extends BackgroundVerifyState {
  dismiss(): void;
}

export function useBackgroundVerifyRun(
  dv: DataverseClient | null,
  orgUrl: string | null,
): BackgroundVerifyApi {
  const [state, setState] = useState<BackgroundVerifyState>({
    pruned: 0,
    companyName: null,
    dismissed: false,
  });
  // Guard against double-run under React StrictMode (dev) — verifyRun does
  // a Dataverse round-trip and shouldn't fire twice for the same mount.
  const ranRef = useRef(false);

  useEffect(() => {
    if (!dv || !orgUrl) return;
    if (ranRef.current) return;
    ranRef.current = true;

    let cancelled = false;
    void (async () => {
      try {
        const runs = runHistory.list(orgUrl);
        const latest = runs[0];
        if (!latest) return;
        const verify = await verifyRun(dv, latest.result);
        if (cancelled) return;
        if (verify.totals.missing === 0) return;
        const pruned = prunePresentResult(latest.result, verify);
        runHistory.update(orgUrl, latest.id, pruned);
        setState({
          pruned: verify.totals.missing,
          companyName: latest.companyName,
          dismissed: false,
        });
      } catch {
        // Best-effort. Silent on failure.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dv, orgUrl]);

  return {
    ...state,
    dismiss() {
      setState((s) => ({ ...s, dismissed: true }));
    },
  };
}
