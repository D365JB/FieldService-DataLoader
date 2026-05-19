/**
 * v1.43.0 — Run preflight checklist.
 *
 * Shown above the "Start generation" button. Probes the things that historically
 * cause runs to skip records or fail mid-flight:
 *
 *  1. API health         — `/api/health` returns 200
 *  2. Dataverse access   — WhoAmI against the connected org succeeds
 *  3. AOAI reachable     — `/api/listModels` returns ≥1 deployment
 *  4. Pick consistency   — every entity marked "use existing" has ≥1 pick
 *
 * Until all four are green, the parent should gate the Start button. The
 * component exposes the rolled-up state via `onChange(allOk)` so the parent
 * doesn't need to duplicate the logic.
 *
 * Re-running is one click — no full page reload required.
 */
import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle,
  CircleNotch,
  Warning,
  ArrowsClockwise,
} from "@phosphor-icons/react";
import { getDataverseToken } from "@/auth/msal";

type CheckState = "pending" | "running" | "ok" | "fail";

interface CheckRow {
  key: string;
  label: string;
  state: CheckState;
  detail?: string;
}

interface PickSummary {
  /** Entities the user set to "existing" — must each have ≥1 pick. */
  existing: Array<{ label: string; count: number }>;
}

interface Props {
  orgUrl: string;
  picks: PickSummary;
  onChange?: (allOk: boolean) => void;
}

const FETCH_TIMEOUT_MS = 12_000;

async function timedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

export function RunPreflight({ orgUrl, picks, onChange }: Props) {
  const [api, setApi] = useState<CheckRow>({
    key: "api",
    label: "API service is healthy",
    state: "pending",
  });
  const [dv, setDv] = useState<CheckRow>({
    key: "dv",
    label: "Dataverse access (WhoAmI)",
    state: "pending",
  });
  const [aoai, setAoai] = useState<CheckRow>({
    key: "aoai",
    label: "Azure OpenAI deployment reachable",
    state: "pending",
  });

  // Pick-consistency check is synchronous — derived from props each render.
  const missingPicks = picks.existing.filter((p) => p.count === 0);
  const picksRow: CheckRow = {
    key: "picks",
    label:
      picks.existing.length === 0
        ? "No 'use existing' picks required"
        : `Existing picks selected (${picks.existing.length} ${picks.existing.length === 1 ? "entity" : "entities"})`,
    state: missingPicks.length === 0 ? "ok" : "fail",
    detail:
      missingPicks.length === 0
        ? undefined
        : `Pick at least one record for: ${missingPicks.map((p) => p.label).join(", ")}`,
  };

  const runChecks = useCallback(async () => {
    // (1) API health
    setApi({ key: "api", label: "API service is healthy", state: "running" });
    try {
      const res = await timedFetch("/api/health");
      if (res.ok) {
        setApi({
          key: "api",
          label: "API service is healthy",
          state: "ok",
        });
      } else {
        setApi({
          key: "api",
          label: "API service is healthy",
          state: "fail",
          detail: `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      setApi({
        key: "api",
        label: "API service is healthy",
        state: "fail",
        detail: (err as Error).message,
      });
    }

    // (2) Dataverse WhoAmI
    setDv({
      key: "dv",
      label: "Dataverse access (WhoAmI)",
      state: "running",
    });
    try {
      const trimmed = orgUrl.replace(/\/+$/, "");
      const token = await getDataverseToken(trimmed);
      const res = await timedFetch(`${trimmed}/api/data/v9.2/WhoAmI`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      });
      if (res.ok) {
        setDv({
          key: "dv",
          label: "Dataverse access (WhoAmI)",
          state: "ok",
          detail: new URL(orgUrl).host,
        });
      } else {
        setDv({
          key: "dv",
          label: "Dataverse access (WhoAmI)",
          state: "fail",
          detail: `HTTP ${res.status}`,
        });
      }
    } catch (err) {
      setDv({
        key: "dv",
        label: "Dataverse access (WhoAmI)",
        state: "fail",
        detail: (err as Error).message,
      });
    }

    // (3) AOAI deployment list
    setAoai({
      key: "aoai",
      label: "Azure OpenAI deployment reachable",
      state: "running",
    });
    try {
      const res = await timedFetch("/api/listModels");
      if (!res.ok) {
        setAoai({
          key: "aoai",
          label: "Azure OpenAI deployment reachable",
          state: "fail",
          detail: `HTTP ${res.status}`,
        });
      } else {
        const json = (await res.json()) as { models?: Array<unknown> };
        const count = Array.isArray(json.models) ? json.models.length : 0;
        if (count === 0) {
          setAoai({
            key: "aoai",
            label: "Azure OpenAI deployment reachable",
            state: "fail",
            detail: "No deployments returned",
          });
        } else {
          setAoai({
            key: "aoai",
            label: "Azure OpenAI deployment reachable",
            state: "ok",
            detail: `${count} deployment${count === 1 ? "" : "s"}`,
          });
        }
      }
    } catch (err) {
      setAoai({
        key: "aoai",
        label: "Azure OpenAI deployment reachable",
        state: "fail",
        detail: (err as Error).message,
      });
    }
  }, [orgUrl]);

  useEffect(() => {
    runChecks();
  }, [runChecks]);

  const rows = [api, dv, aoai, picksRow];
  const allOk = rows.every((r) => r.state === "ok");
  const anyRunning = rows.some((r) => r.state === "running" || r.state === "pending");

  useEffect(() => {
    onChange?.(allOk);
  }, [allOk, onChange]);

  return (
    <div className="card p-5 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h3 className="font-semibold text-white">Run preflight</h3>
          <p className="text-xs text-muted">
            Quick checks so you don't start a run that's destined to skip records.
          </p>
        </div>
        <button
          type="button"
          onClick={runChecks}
          disabled={anyRunning}
          className="inline-flex items-center gap-1.5 rounded border border-border px-2.5 py-1 text-xs text-slate-300 hover:text-white hover:border-accent/40 disabled:opacity-50"
          title="Re-run preflight checks"
        >
          <ArrowsClockwise size={14} />
          {anyRunning ? "Checking…" : "Re-check"}
        </button>
      </div>
      <ul className="space-y-1.5">
        {rows.map((r) => (
          <li key={r.key} className="flex items-start gap-2 text-sm">
            <span className="flex-shrink-0 mt-0.5">
              {r.state === "ok" ? (
                <CheckCircle size={16} weight="fill" className="text-emerald-400" />
              ) : r.state === "fail" ? (
                <Warning size={16} weight="fill" className="text-red-400" />
              ) : (
                <CircleNotch size={16} className="text-amber-400 animate-spin" />
              )}
            </span>
            <div className="flex-1">
              <div
                className={
                  r.state === "fail"
                    ? "text-red-200"
                    : r.state === "ok"
                      ? "text-slate-200"
                      : "text-slate-300"
                }
              >
                {r.label}
              </div>
              {r.detail && (
                <div
                  className={`text-xs ${r.state === "fail" ? "text-red-300/80" : "text-muted"} font-mono`}
                >
                  {r.detail}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
      {!allOk && !anyRunning && (
        <p className="mt-3 text-xs text-amber-200">
          Fix the items above before starting the run. The Start button stays
          disabled until preflight passes.
        </p>
      )}
    </div>
  );
}
