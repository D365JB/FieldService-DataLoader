import { useEffect, useState } from "react";
import { Cpu, CaretDown } from "@phosphor-icons/react";
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
 * Lets the user pick which AOAI deployment to use for analyze + AI edit.
 * Fetches the allowlist from `/api/models`. Persists choice in localStorage
 * via `modelStore`.
 */
export function ModelPicker({ onChange, disabled, className }: Props) {
  const [models, setModels] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>(modelStore.get() ?? "");
  const [loadError, setLoadError] = useState<string | null>(null);

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

  return (
    <label className={`flex items-center gap-2 text-sm ${className ?? ""}`}>
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
  );
}
