/**
 * Singleton, in-memory store for the currently running data-load generation.
 *
 * Why a module-scoped singleton (not React context)?
 *   The Generate page kicks off `seedFromPreset` which runs as a long-lived
 *   Promise. If the user navigates away, the page component unmounts and any
 *   useState lives in it would be torn down, but the underlying network
 *   work keeps going. Persisting state outside React lets:
 *
 *     1. The Generate page rehydrate the live view if the user comes back.
 *     2. A small header badge subscribe to progress and link the user back.
 *
 * Not persisted to localStorage — a generation is tied to the live in-flight
 * Promise. If the user reloads the tab, the run is gone (the SDK calls
 * abort with the page) and we don't want a stale "running" indicator.
 */
import type { SeedProgress, SeedResult } from "./fs/seed-config";

export interface ActiveStep {
  name: string;
  done: number;
  total: number;
  detail?: string;
  status: "pending" | "running" | "complete";
}

export interface ActiveRunSnapshot {
  running: boolean;
  companyName: string;
  orgUrl: string;
  steps: ActiveStep[];
  stepOrder: string[];
  retryNotice: string | null;
  error: string | null;
  /** Final or partial seed result; populated when the run finishes (success or error). */
  result: SeedResult | null;
  /** Epoch ms when the current run started. 0 when idle. */
  startedAt: number;
}

const EMPTY: ActiveRunSnapshot = {
  running: false,
  companyName: "",
  orgUrl: "",
  steps: [],
  stepOrder: [],
  retryNotice: null,
  error: null,
  result: null,
  startedAt: 0,
};

let state: ActiveRunSnapshot = EMPTY;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

function update(next: Partial<ActiveRunSnapshot>) {
  state = { ...state, ...next };
  emit();
}

export const activeRunStore = {
  snapshot(): ActiveRunSnapshot {
    return state;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  /** Begin tracking a new run. Resets steps to pending. */
  start(opts: {
    companyName: string;
    orgUrl: string;
    stepOrder: string[];
  }): void {
    state = {
      running: true,
      companyName: opts.companyName,
      orgUrl: opts.orgUrl,
      stepOrder: opts.stepOrder,
      steps: opts.stepOrder.map((name) => ({
        name,
        done: 0,
        total: 0,
        status: "pending",
      })),
      retryNotice: null,
      error: null,
      result: null,
      startedAt: Date.now(),
    };
    emit();
  },

  /** Forward a SeedProgress event from `seedFromPreset`. */
  applyProgress(p: SeedProgress): void {
    const { stepOrder } = state;
    const idxCurrent = stepOrder.indexOf(p.step);
    const nextSteps = state.steps.map((s) => {
      if (s.name !== p.step) {
        const idxThis = stepOrder.indexOf(s.name);
        if (
          idxThis >= 0 &&
          idxCurrent >= 0 &&
          idxThis < idxCurrent &&
          s.status !== "complete"
        ) {
          return { ...s, status: "complete" as const, done: s.total };
        }
        return s;
      }
      const status: ActiveStep["status"] =
        p.done >= p.total && p.total > 0 ? "complete" : "running";
      return { ...s, ...p, status };
    });
    update({ steps: nextSteps });
  },

  setRetryNotice(notice: string | null): void {
    update({ retryNotice: notice });
  },

  /** Mark all steps complete and stop the running flag. */
  complete(result: SeedResult): void {
    update({
      running: false,
      result,
      retryNotice: null,
      steps: state.steps.map((s) => ({ ...s, status: "complete" })),
    });
  },

  /** Mark the run as errored. `partial` is whatever was created up to the failure. */
  fail(error: string, partial?: SeedResult | null): void {
    update({
      running: false,
      error,
      result: partial ?? null,
      retryNotice: null,
    });
  },

  /** User has acknowledged the result/error and starts a new flow. */
  reset(): void {
    state = EMPTY;
    emit();
  },
};
