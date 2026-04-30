import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { Sparkle, Globe, Warning, ArrowRight, FastForward } from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { PresetReview } from "@/components/PresetReview";
import { analyzeCompany } from "@/lib/preset";
import type { FsPreset } from "@/lib/preset";
import { GENERIC_PRESET } from "@/lib/genericPreset";
import { orgStore } from "@/lib/orgStore";

export function Analyze() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const orgUrl = orgStore.getOrgUrl() ?? undefined;

  const [companyUrl, setCompanyUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<FsPreset | null>(() => {
    // Restore the previously generated preset so navigating back shows it.
    const raw = orgStore.getPreset();
    return raw ? (JSON.parse(raw) as FsPreset) : null;
  });

  if (!accounts[0]) {
    navigate("/");
    return null;
  }

  async function handleAnalyze() {
    setError(null);
    setPreset(null);
    setBusy(true);
    try {
      const result = await analyzeCompany(companyUrl);
      setPreset(result);
      orgStore.setPreset(JSON.stringify(result));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handlePresetChange(next: FsPreset) {
    setPreset(next);
    orgStore.setPreset(JSON.stringify(next));
  }

  function handleSkip() {
    const next = preset ?? GENERIC_PRESET;
    orgStore.setPreset(JSON.stringify(next));
    navigate("/generate");
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader orgUrl={orgUrl} />
      <main className="flex-1 max-w-5xl mx-auto px-6 py-12 w-full">
        <div className="flex items-center gap-3 mb-2">
          <Sparkle size={28} className="text-accent" weight="duotone" />
          <h1 className="text-3xl font-bold text-white">Analyze a customer</h1>
        </div>
        <p className="text-slate-400 mb-8">
          Paste a customer's website. We'll let GPT read it, infer their Field
          Service vertical, and propose a tailored data preset you can review
          before generating.
        </p>

        <div className="card p-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Company website
          </label>
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Globe
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              />
              <input
                type="url"
                value={companyUrl}
                onChange={(e) => setCompanyUrl(e.target.value)}
                placeholder="https://contoso-hvac.com"
                className="w-full bg-bg-elevated border border-border rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-accent"
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={!companyUrl || busy}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
            >
              <Sparkle size={18} weight="bold" />
              {busy ? "Analyzing…" : "Analyze"}
            </button>
          </div>

          {busy && (
            <div className="mt-4 text-sm text-slate-400">
              Fetching site → extracting text → asking GPT for a vertical-specific preset.
              This usually takes 10–20 seconds.
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
              <Warning size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>Analysis failed.</strong>
                <div className="mt-1 font-mono text-xs">{error}</div>
              </div>
            </div>
          )}

          <div className="mt-6 pt-5 border-t border-border flex items-center justify-between gap-3">
            <div className="text-xs text-muted">
              Don't want to analyze a website? Skip ahead with a generic
              Field Service preset and tweak in the next step.
            </div>
            <button
              onClick={handleSkip}
              className="btn-ghost flex items-center gap-2 whitespace-nowrap"
            >
              <FastForward size={16} weight="bold" />
              Skip &amp; use generic preset
            </button>
          </div>
        </div>

        {preset && (
          <>
            <div className="mt-8 mb-4 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wider text-muted">
                Review &amp; tweak — then continue to generate
              </div>
              <button
                onClick={() => navigate("/generate")}
                className="btn-primary flex items-center gap-2"
              >
                Continue to generate
                <ArrowRight size={18} weight="bold" />
              </button>
            </div>
            <PresetReview preset={preset} onChange={handlePresetChange} />
            <div className="mt-8 flex justify-end">
              <button
                onClick={() => navigate("/generate")}
                className="btn-primary flex items-center gap-2"
              >
                Continue to generate
                <ArrowRight size={18} weight="bold" />
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
