import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CircleNotch, ArrowRight } from "@phosphor-icons/react";
import { useActiveRun } from "@/lib/useActiveRun";

/**
 * Floating pill in the AppHeader that surfaces an in-flight data-load run.
 * Click → returns to /generate, where the same store rehydrates the live view.
 *
 * Only renders when a generation is currently `running`. We deliberately do
 * NOT show completed/errored runs here — those are reachable via the
 * dashboard run history.
 */
export function ActiveRunBadge() {
  const run = useActiveRun();
  const navigate = useNavigate();
  const location = useLocation();
  const [, force] = useState(0);

  // Tick once a second so the elapsed counter moves.
  useEffect(() => {
    if (!run.running) return;
    const id = window.setInterval(() => force((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [run.running]);

  if (!run.running) return null;
  // Don't render on the Generate page itself — the full UI is already there.
  if (location.pathname === "/generate") return null;

  const total = run.steps.length;
  const complete = run.steps.filter((s) => s.status === "complete").length;
  const currentStep =
    run.steps.find((s) => s.status === "running")?.name ?? "Starting…";
  const elapsedSec = Math.max(
    0,
    Math.floor((Date.now() - run.startedAt) / 1000),
  );
  const mm = Math.floor(elapsedSec / 60);
  const ss = String(elapsedSec % 60).padStart(2, "0");

  return (
    <button
      onClick={() => navigate("/generate")}
      className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-accent/15 border border-accent/40 hover:bg-accent/25 transition-colors text-xs"
      title={`Currently loading data for ${run.companyName}. Click to view.`}
    >
      <CircleNotch
        size={14}
        weight="bold"
        className="text-accent animate-spin"
      />
      <span className="font-medium text-white">
        Loading {run.companyName || "data"}
      </span>
      <span className="text-slate-300">
        · {complete}/{total} · {currentStep}
      </span>
      <span className="font-mono text-slate-400">
        {mm}:{ss}
      </span>
      <ArrowRight size={12} weight="bold" className="text-accent" />
    </button>
  );
}
