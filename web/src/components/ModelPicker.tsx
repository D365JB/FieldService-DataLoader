import { useEffect, useState } from "react";
import { Cpu, CaretDown, Info, Lightning, Brain } from "@phosphor-icons/react";
import { listModels } from "@/lib/aoai";
import { modelStore } from "@/lib/modelStore";

interface Props {
  /** Called whenever the effective selection changes (including initial load). */
  onChange?: (model: string) => void;
  /** Disable while a request is in flight. */
  disabled?: boolean;
  className?: string;
}

/**
 * Quick "best for" guidance shown inline + in a popover. Keyed by deployment
 * name. Falls back to a generic line if a future deployment isn't listed here.
 */
const MODEL_INFO: Record<
  string,
  { tagline: string; bestFor: string; tradeoff: string; icon: "fast" | "smart" }
> = {
  "gpt-4o-mini": {
    tagline: "Fast & cheap",
    bestFor:
      "Quick analyses, demo runs, generic websites, and bulk preset edits where speed matters.",
    tradeoff: "Lighter reasoning — output is shorter and more surface-level.",
    icon: "fast",
  },
  "gpt-5-mini": {
    tagline: "Deeper reasoning",
    bestFor:
      "Complex or ambiguous sites, nuanced industry research, and richer/more detailed presets.",
    tradeoff: "Slower (a few extra seconds) and uses more tokens per call.",
    icon: "smart",
  },
};

function infoFor(model: string) {
  return (
    MODEL_INFO[model] ?? {
      tagline: "",
      bestFor: "Custom deployment configured by your admin.",
      tradeoff: "",
      icon: "fast" as const,
    }
  );
}

/**
 * Lets the user pick which AOAI deployment to use for analyze + AI edit.
 * Fetches the allowlist from `/api/models`. Persists choice in localStorage
 * via `modelStore`.
 */
export function ModelPicker({ onChange, disabled, className }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(modelStore.get() ?? "");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listModels()
      .then((res) => {
        if (cancelled) return;
        setModels(res.models);
        // If the stored choice is no longer in the allowlist (e.g. a deployment
        // was retired), fall back to the server default silently.
        const current = modelStore.get();
        const effective =
          current && res.models.includes(current) ? current : res.default;
        setSelected(effective);
        modelStore.set(effective);
        onChange?.(effective);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError((err as Error).message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePick(value: string) {
    setSelected(value);
    modelStore.set(value);
    onChange?.(value);
  }

  if (loadError) {
    // Non-fatal: if /api/models is unreachable the request will still work —
    // generateContent just falls back to the server's default deployment.
    return null;
  }
  if (models.length <= 1) {
    // No choice to make — don't add UI noise.
    return null;
  }

  const current = infoFor(selected);

  return (
    <div className={`relative flex items-center gap-2 text-sm ${className ?? ""}`}>
      <label className="flex items-center gap-2">
        <Cpu size={16} className="text-slate-400" weight="duotone" />
        <span className="text-slate-400">Model</span>
        <div className="relative">
          <select
            value={selected}
            onChange={(e) => handlePick(e.target.value)}
            disabled={disabled}
            className="appearance-none bg-bg-elevated border border-border rounded-md pl-3 pr-8 py-1.5 text-white text-sm focus:outline-none focus:border-accent disabled:opacity-60"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
          <CaretDown
            size={14}
            weight="bold"
            className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400"
          />
        </div>
      </label>

      {current.tagline && (
        <span className="hidden sm:inline-flex items-center gap-1 text-xs text-slate-400">
          {current.icon === "smart" ? (
            <Brain size={14} weight="duotone" className="text-accent" />
          ) : (
            <Lightning size={14} weight="duotone" className="text-amber-400" />
          )}
          {current.tagline}
        </span>
      )}

      <button
        type="button"
        onClick={() => setShowInfo((v) => !v)}
        onBlur={() => setTimeout(() => setShowInfo(false), 150)}
        className="text-slate-400 hover:text-white transition-colors"
        aria-label="Model guidance"
        title="Which model should I pick?"
      >
        <Info size={16} weight="duotone" />
      </button>

      {showInfo && (
        <div className="absolute right-0 top-full mt-2 z-30 w-80 rounded-lg border border-border bg-bg-elevated p-3 shadow-xl text-xs text-slate-200 space-y-3">
          <div className="font-semibold text-white text-sm">
            Which model should I pick?
          </div>
          {models.map((m) => {
            const info = infoFor(m);
            return (
              <div key={m} className="space-y-1">
                <div className="flex items-center gap-1.5 font-mono text-[11px] text-white">
                  {info.icon === "smart" ? (
                    <Brain size={12} weight="duotone" className="text-accent" />
                  ) : (
                    <Lightning
                      size={12}
                      weight="duotone"
                      className="text-amber-400"
                    />
                  )}
                  {m}
                  {m === selected && (
                    <span className="ml-1 rounded bg-accent/20 px-1.5 py-0.5 text-[10px] text-accent">
                      selected
                    </span>
                  )}
                </div>
                <div className="text-slate-300">
                  <span className="text-slate-400">Best for:</span> {info.bestFor}
                </div>
                {info.tradeoff && (
                  <div className="text-slate-400">
                    <span className="text-slate-500">Tradeoff:</span>{" "}
                    {info.tradeoff}
                  </div>
                )}
              </div>
            );
          })}
          <div className="pt-1 border-t border-border text-slate-400">
            Tip: start with the fast model for demos; switch to the deeper one
            when you need richer, more detailed output.
          </div>
        </div>
      )}
    </div>
  );
}
