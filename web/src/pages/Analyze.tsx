import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { Sparkle, Globe, Warning, ArrowRight, FastForward, Package, CircleNotch } from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { ModelPicker } from "@/components/ModelPicker";
import { PresetReview } from "@/components/PresetReview";
import { analyzeCompany } from "@/lib/preset";
import type { FsPreset } from "@/lib/preset";
import { GENERIC_PRESET } from "@/lib/genericPreset";
import { DEMO_PACKS } from "@/lib/demoPacks";
import { modelStore } from "@/lib/modelStore";
import { orgStore } from "@/lib/orgStore";

export function Analyze() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const orgUrl = orgStore.getOrgUrl() ?? undefined;

  const [companyUrl, setCompanyUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [elapsed, setElapsed] = useState(0);
  const [selectedModel, setSelectedModel] = useState<string | undefined>(
    modelStore.get() ?? undefined,
  );
  const startedAtRef = useRef<number | null>(null);
  const [preset, setPreset] = useState<FsPreset | null>(() => {
    // Restore the previously generated preset so navigating back shows it.
    const raw = orgStore.getPreset();
    return raw ? (JSON.parse(raw) as FsPreset) : null;
  });

  // Tick the elapsed-time counter while busy so the user can see progress
  // is being made (or, if it stalls way past the typical 10–20s, knows
  // something's wrong).
  useEffect(() => {
    if (!busy) {
      setElapsed(0);
      startedAtRef.current = null;
      return;
    }
    startedAtRef.current = Date.now();
    const id = window.setInterval(() => {
      if (startedAtRef.current) {
        setElapsed(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [busy]);

  if (!accounts[0]) {
    navigate("/");
    return null;
  }

  async function handleAnalyze() {
    if (!companyUrl || busy) return;
    setError(null);
    setPreset(null);
    setStatus("Starting…");
    setBusy(true);
    try {
      const result = await analyzeCompany(companyUrl, (msg) => setStatus(msg), selectedModel);
      setStatus("Done.");
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

  /**
   * Phase 7 — load a curated demo pack into review state. The user can still
   * edit anything before clicking Generate.
   */
  function handlePickPack(packId: string) {
    const pack = DEMO_PACKS.find((p) => p.id === packId);
    if (!pack) return;
    setPreset(pack.preset);
    setError(null);
    orgStore.setPreset(JSON.stringify(pack.preset));
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
          <div className="flex items-center justify-between gap-3 mb-2">
            <label className="block text-sm font-medium text-slate-300">
              Company website
            </label>
            <ModelPicker
              disabled={busy}
              onChange={(m) => setSelectedModel(m)}
            />
          </div>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void handleAnalyze();
                  }
                }}
                placeholder="https://contoso-hvac.com"
                disabled={busy}
                className="w-full bg-bg-elevated border border-border rounded-lg pl-10 pr-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-accent disabled:opacity-60"
              />
            </div>
            <button
              onClick={handleAnalyze}
              disabled={!companyUrl || busy}
              className="btn-primary flex items-center gap-2 disabled:opacity-50 whitespace-nowrap"
            >
              {busy ? (
                <CircleNotch size={18} weight="bold" className="animate-spin" />
              ) : (
                <Sparkle size={18} weight="bold" />
              )}
              {busy ? "Analyzing…" : "Analyze"}
            </button>
          </div>

          {busy && (
            <div className="mt-4 p-3 rounded-lg bg-accent/5 border border-accent/30 text-sm">
              <div className="flex items-center gap-2 text-accent font-medium">
                <CircleNotch size={16} weight="bold" className="animate-spin" />
                <span>{status || "Working…"}</span>
                <span className="ml-auto font-mono text-xs text-slate-400">
                  {elapsed}s
                </span>
              </div>
              <div className="mt-1.5 text-xs text-slate-400">
                Typical run is 10–20 seconds. We fetch the site, extract its
                text, then ask GPT to infer the Field Service vertical and
                propose a tailored preset.
                {elapsed > 30 && (
                  <span className="block mt-1 text-amber-300">
                    Taking longer than usual — the AI service may be under
                    load. We'll keep trying.
                  </span>
                )}
              </div>
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

          <div className="mt-6 pt-5 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <Package size={18} className="text-accent" weight="duotone" />
              <div className="text-xs uppercase tracking-wider text-muted">
                Or pick a curated demo pack
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {DEMO_PACKS.map((pack) => (
                <button
                  key={pack.id}
                  onClick={() => handlePickPack(pack.id)}
                  className="text-left p-4 rounded-lg border border-border bg-bg-elevated hover:border-accent hover:bg-bg-elevated/80 transition-colors"
                >
                  <div className="text-sm font-semibold text-white mb-1">
                    {pack.label}
                  </div>
                  <div className="text-xs text-slate-400 leading-relaxed">
                    {pack.blurb}
                  </div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-end">
              <button
                onClick={handleSkip}
                className="btn-ghost flex items-center gap-2 whitespace-nowrap text-xs"
              >
                <FastForward size={14} weight="bold" />
                Skip review &amp; generate with current preset
              </button>
            </div>
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
