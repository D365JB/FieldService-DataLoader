import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { Sparkle, Globe, Warning, ArrowRight } from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { analyzeCompany } from "@/lib/preset";
import type { FsPreset } from "@/lib/preset";

export function Analyze() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const orgUrl = sessionStorage.getItem("orgUrl") ?? undefined;

  const [companyUrl, setCompanyUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preset, setPreset] = useState<FsPreset | null>(null);

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
      sessionStorage.setItem("preset", JSON.stringify(result));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader orgUrl={orgUrl} />
      <main className="flex-1 max-w-3xl mx-auto px-6 py-12 w-full">
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
        </div>

        {preset && <PresetSummary preset={preset} />}
      </main>
    </div>
  );
}

function PresetSummary({ preset }: { preset: FsPreset }) {
  const navigate = useNavigate();
  return (
    <div className="card p-6 mt-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-accent mb-1">
            {preset.vertical.replace(/_/g, " ")}
          </div>
          <h2 className="text-xl font-bold text-white">{preset.companyName}</h2>
          <p className="text-slate-400 text-sm mt-1">
            {preset.companyDescription}
          </p>
        </div>
      </div>

      <div className="text-sm text-slate-300 italic border-l-2 border-accent pl-3 mb-6">
        {preset.rationale}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Territories" value={preset.territories.length} />
        <Stat label="WO Types" value={preset.workOrderTypes.length} />
        <Stat label="Incidents" value={preset.incidentTypes.length} />
        <Stat label="Products" value={preset.products.length} />
      </div>

      <details className="text-sm text-slate-400 mb-6">
        <summary className="cursor-pointer text-slate-300 hover:text-white">
          View raw preset JSON
        </summary>
        <pre className="mt-3 p-3 bg-bg-elevated rounded-lg overflow-auto max-h-96 text-xs">
          {JSON.stringify(preset, null, 2)}
        </pre>
      </details>

      <div className="flex justify-end">
        <button
          onClick={() => navigate("/generate")}
          className="btn-primary flex items-center gap-2"
        >
          Continue to generate
          <ArrowRight size={18} weight="bold" />
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-bg-elevated border border-border rounded-lg p-3">
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs text-muted uppercase tracking-wider mt-1">
        {label}
      </div>
    </div>
  );
}
