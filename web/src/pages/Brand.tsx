import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  Palette,
  Sparkle,
  CheckCircle,
  Warning,
  Globe,
  Check,
} from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { DataverseClient } from "@/lib/dataverse";
import { orgStore } from "@/lib/orgStore";
import {
  applyTheme,
  deriveColors,
  extractBranding,
  fetchImageBytes,
  type BrandColors,
  type BrandingResult,
} from "@/lib/branding";

type Step = "input" | "preview" | "applying" | "done" | "error";

const STEPS = [
  { id: "input", label: "Detect" },
  { id: "preview", label: "Customize" },
  { id: "done", label: "Apply" },
];

export function Brand() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const orgUrl = orgStore.getOrgUrl() ?? undefined;

  const [step, setStep] = useState<Step>("input");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  const [branding, setBranding] = useState<BrandingResult | null>(null);
  const [themeName, setThemeName] = useState("");
  const [colors, setColors] = useState<BrandColors | null>(null);
  const [selectedLogoUrl, setSelectedLogoUrl] = useState<string | null>(null);
  const [includeLogo, setIncludeLogo] = useState(true);

  if (!accounts[0]) {
    navigate("/");
    return null;
  }
  if (!orgUrl) {
    navigate("/connect");
    return null;
  }

  async function handleDetect() {
    if (!url.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const b = await extractBranding(url);
      setBranding(b);
      setSelectedLogoUrl(b.logoUrl);
      setThemeName(`${b.companyName} Theme`);
      const primary = b.themeColor || b.candidateColors[0] || "#0078D4";
      const accent = b.candidateColors[1] || b.candidateColors[0] || primary;
      setColors(deriveColors(primary, accent));
      setStep("preview");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleApply() {
    if (!colors || !branding || !orgUrl) return;
    setStep("applying");
    setBusy(true);
    setError(null);
    setStatus("Connecting to Dataverse…");
    try {
      const client = new DataverseClient({ orgUrl });

      let logo: { contentType: string; base64: string; fileName: string } | null =
        null;
      if (includeLogo && selectedLogoUrl) {
        try {
          setStatus("Downloading logo…");
          const img = await fetchImageBytes(selectedLogoUrl);
          const ext =
            img.contentType.split("/")[1]?.replace("svg+xml", "svg") ?? "png";
          logo = {
            contentType: img.contentType,
            base64: img.base64,
            fileName: `logo.${ext}`,
          };
        } catch (logoErr) {
          // Don't fail the whole apply if logo can't be fetched.
          setStatus(
            `Logo download failed (${(logoErr as Error).message}). Continuing with colors only…`,
          );
        }
      }

      const result = await applyTheme({
        client,
        themeName,
        colors,
        logo,
        onStatus: setStatus,
      });
      // v1.44.6 — if the colors apply succeeds but the logo→theme link
      // couldn't be set on this org, surface that explicitly as the final
      // status (not buried mid-flow where the next setStatus call clobbers
      // it). Includes the diagnostic so we can see what was actually tried
      // without opening the browser console.
      if (logo && !result.logoLinked) {
        setStatus(
          `Theme published as default — but the logo could not be linked automatically. Diagnostic: ${result.logoLinkDiag ?? "(none)"}. The logo web resource is uploaded in the org and can be linked manually: Settings → Themes → ${themeName} → Logo lookup.`,
        );
      } else {
        setStatus("Theme published as default.");
      }
      setStep("done");
    } catch (err) {
      // Surface BOTH the last status ("what we were doing") and the error
      // ("why it failed") to the user. The previous UI showed only the
      // last status as a tiny secondary line and the error message above
      // it, which made network errors look mysterious.
      const raw = (err as Error).message ?? String(err);
      const friendlier =
        /failed to fetch/i.test(raw) && !/Logo upload failed/i.test(raw)
          ? `${raw}\n\nThis is a browser-level network error. Common causes: Dataverse session expired (refresh the page and sign in again), the org URL is wrong, or a corporate proxy/VPN is blocking the call.`
          : raw;
      setError(friendlier);
      setStep("error");
    } finally {
      setBusy(false);
    }
  }

  const currentIdx =
    step === "input" ? 0 : step === "preview" || step === "applying" ? 1 : 2;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader orgUrl={orgUrl} />
      <main className="flex-1 max-w-4xl mx-auto px-6 py-10 w-full">
        {/* Stepper */}
        <Stepper currentIdx={currentIdx} />

        {step === "input" && (
          <DetectStep
            url={url}
            setUrl={setUrl}
            busy={busy}
            error={error}
            onDetect={handleDetect}
            onSkip={() => {
              const fallback = deriveColors("#0078D4");
              setColors(fallback);
              setBranding({
                url: "",
                companyName: "Custom",
                description: "",
                logoUrl: null,
                themeColor: null,
                candidateImages: [],
                candidateColors: [],
              });
              setThemeName("Custom Brand Theme");
              setSelectedLogoUrl(null);
              setStep("preview");
            }}
          />
        )}

        {step === "preview" && colors && branding && (
          <PreviewStep
            branding={branding}
            colors={colors}
            setColors={setColors}
            themeName={themeName}
            setThemeName={setThemeName}
            selectedLogoUrl={selectedLogoUrl}
            setSelectedLogoUrl={setSelectedLogoUrl}
            includeLogo={includeLogo}
            setIncludeLogo={setIncludeLogo}
            error={error}
            onBack={() => setStep("input")}
            onApply={handleApply}
            busy={busy}
          />
        )}

        {step === "applying" && (
          <div className="card p-10 text-center">
            <div className="animate-spin inline-block w-8 h-8 border-2 border-accent border-t-transparent rounded-full mb-4"></div>
            <h2 className="text-xl font-semibold text-white mb-2">
              Applying theme…
            </h2>
            <p className="text-slate-400 text-sm">{status}</p>
          </div>
        )}

        {step === "done" && (
          <div className="card p-10 text-center">
            <CheckCircle
              size={56}
              weight="duotone"
              className="text-emerald-400 mx-auto mb-4"
            />
            <h2 className="text-2xl font-bold text-white mb-2">
              Theme published
            </h2>
            <p className="text-slate-400 mb-6">
              <span className="text-white font-semibold">{themeName}</span> is
              now the default theme on{" "}
              <code className="text-accent">{new URL(orgUrl).host}</code>.
              Reload the model-driven app to see the new colors.
            </p>
            <div className="flex justify-center gap-3">
              <button
                onClick={() => {
                  setStep("input");
                  setUrl("");
                  setBranding(null);
                  setColors(null);
                  setError(null);
                }}
                className="btn-ghost"
              >
                Brand another
              </button>
              <button
                onClick={() => navigate("/dashboard")}
                className="btn-primary"
              >
                Back to dashboard
              </button>
            </div>
          </div>
        )}

        {step === "error" && (
          <div className="card p-8">
            <div className="flex items-start gap-3 mb-4">
              <Warning
                size={28}
                weight="duotone"
                className="text-rose-400 shrink-0 mt-0.5"
              />
              <div>
                <h2 className="text-lg font-semibold text-white">
                  Apply failed
                </h2>
                <p className="text-rose-300 text-sm mt-1 break-all">
                  {error}
                </p>
                {status && (
                  <p className="text-slate-400 text-xs mt-2">
                    Last status: {status}
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setStep("preview")}
                className="btn-ghost flex items-center gap-2"
              >
                <ArrowLeft size={16} />
                Back to preview
              </button>
              <button onClick={handleApply} className="btn-primary">
                Retry
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Stepper({ currentIdx }: { currentIdx: number }) {
  return (
    <div className="flex items-center justify-center mb-10">
      {STEPS.map((s, i) => {
        const isActive = i === currentIdx;
        const isDone = i < currentIdx;
        return (
          <div key={s.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm border-2 ${
                  isActive
                    ? "bg-accent border-accent text-white"
                    : isDone
                      ? "bg-accent/20 border-accent text-accent"
                      : "bg-bg-elevated border-border text-muted"
                }`}
              >
                {isDone ? <Check size={16} weight="bold" /> : i + 1}
              </div>
              <span
                className={`text-xs mt-1 ${isActive ? "text-white font-semibold" : "text-muted"}`}
              >
                {s.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div
                className={`w-20 h-0.5 mx-2 mb-5 ${
                  i < currentIdx ? "bg-accent" : "bg-border"
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

interface DetectProps {
  url: string;
  setUrl: (v: string) => void;
  busy: boolean;
  error: string | null;
  onDetect: () => void;
  onSkip: () => void;
}

function DetectStep({ url, setUrl, busy, error, onDetect, onSkip }: DetectProps) {
  return (
    <>
      <div className="text-center mb-8">
        <Palette
          size={48}
          weight="duotone"
          className="text-accent mx-auto mb-4"
        />
        <h1 className="text-3xl font-bold text-white mb-3">
          Brand your Dynamics 365
        </h1>
        <p className="text-slate-400 max-w-2xl mx-auto">
          Paste a website URL — we'll fetch the company's logo and brand
          colors, let you preview and tweak everything, then create and publish
          a new D365 theme as the default.
        </p>
      </div>

      <div className="card p-6 max-w-2xl mx-auto">
        <label className="block text-sm font-semibold text-white mb-2 flex items-center gap-2">
          <Globe size={18} className="text-accent" />
          Website URL
        </label>
        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="contoso.com"
          className="w-full px-3 py-2 rounded-lg bg-bg-base border border-border text-white placeholder-muted focus:outline-none focus:border-accent"
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy) onDetect();
          }}
        />
        <p className="text-xs text-muted mt-2">
          Tip: paste the company homepage. We'll add{" "}
          <code className="text-accent">https://</code> for you and look for
          the logo, favicon, and brand colors.
        </p>
        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex gap-2">
            <Warning size={18} className="shrink-0 mt-0.5" />
            <div>
              <div className="font-semibold">Detection failed.</div>
              <code className="text-xs">{error}</code>
            </div>
          </div>
        )}
        <div className="flex gap-3 mt-6">
          <button
            onClick={onDetect}
            disabled={busy || !url.trim()}
            className="btn-primary flex items-center gap-2 disabled:opacity-50"
          >
            <Sparkle size={18} weight="fill" />
            {busy ? "Detecting…" : "Detect branding"}
          </button>
          <button onClick={onSkip} className="btn-ghost">
            Skip &amp; customize manually
          </button>
        </div>
      </div>
    </>
  );
}

interface PreviewProps {
  branding: BrandingResult;
  colors: BrandColors;
  setColors: (c: BrandColors) => void;
  themeName: string;
  setThemeName: (s: string) => void;
  selectedLogoUrl: string | null;
  setSelectedLogoUrl: (s: string | null) => void;
  includeLogo: boolean;
  setIncludeLogo: (b: boolean) => void;
  error: string | null;
  onBack: () => void;
  onApply: () => void;
  busy: boolean;
}

function PreviewStep({
  branding,
  colors,
  setColors,
  themeName,
  setThemeName,
  selectedLogoUrl,
  setSelectedLogoUrl,
  includeLogo,
  setIncludeLogo,
  error,
  onBack,
  onApply,
  busy,
}: PreviewProps) {
  function setColor<K extends keyof BrandColors>(key: K, value: string) {
    setColors({ ...colors, [key]: value });
  }
  return (
    <>
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column: settings */}
        <div className="space-y-6">
          <div className="card p-6">
            <h3 className="text-lg font-semibold text-white mb-4">
              Theme settings
            </h3>
            <label className="block text-sm font-semibold text-white mb-1">
              Theme name
            </label>
            <input
              type="text"
              value={themeName}
              onChange={(e) => setThemeName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-bg-base border border-border text-white focus:outline-none focus:border-accent mb-4"
            />

            <div className="space-y-3 pt-2 border-t border-border">
              <ColorRow
                label="Primary / nav bar"
                value={colors.navbarBackground}
                onChange={(v) => setColor("navbarBackground", v)}
              />
              <ColorRow
                label="Nav shelf"
                value={colors.navbarShelf}
                onChange={(v) => setColor("navbarShelf", v)}
              />
              <ColorRow
                label="Main / accent"
                value={colors.main}
                onChange={(v) => setColor("main", v)}
              />
              <ColorRow
                label="Secondary accent"
                value={colors.accent}
                onChange={(v) => setColor("accent", v)}
              />
              <ColorRow
                label="Header"
                value={colors.headerColor}
                onChange={(v) => setColor("headerColor", v)}
              />
              <ColorRow
                label="Global link"
                value={colors.globalLink}
                onChange={(v) => setColor("globalLink", v)}
              />
              <ColorRow
                label="Page background"
                value={colors.pageBackground}
                onChange={(v) => setColor("pageBackground", v)}
              />
            </div>
          </div>

          {(branding.candidateImages.length > 0 || selectedLogoUrl) && (
            <div className="card p-6">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold text-white">Logo</h3>
                <label className="flex items-center gap-2 text-sm text-muted">
                  <input
                    type="checkbox"
                    checked={includeLogo}
                    onChange={(e) => setIncludeLogo(e.target.checked)}
                    className="accent-accent"
                  />
                  Upload &amp; apply
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {branding.candidateImages.slice(0, 9).map((img) => (
                  <button
                    key={img}
                    type="button"
                    onClick={() => setSelectedLogoUrl(img)}
                    className={`aspect-square rounded-lg p-2 bg-white flex items-center justify-center border-2 transition-colors ${
                      selectedLogoUrl === img
                        ? "border-accent"
                        : "border-transparent hover:border-border"
                    }`}
                  >
                    <img
                      src={img}
                      alt="logo candidate"
                      className="max-w-full max-h-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.opacity = "0.2";
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right column: live preview */}
        <div className="space-y-6">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 bg-bg-base/60 border-b border-border text-xs uppercase tracking-wider text-muted">
              Live preview
            </div>
            <div className="bg-white">
              {/* Mock D365 nav */}
              <div
                className="px-4 py-3 flex items-center gap-3"
                style={{ backgroundColor: colors.navbarBackground }}
              >
                {includeLogo && selectedLogoUrl ? (
                  <img
                    src={selectedLogoUrl}
                    alt="logo"
                    className="h-7 max-w-[140px] object-contain bg-white rounded px-1"
                  />
                ) : (
                  <span className="text-white font-semibold">
                    {branding.companyName}
                  </span>
                )}
                <span className="text-white/80 text-sm ml-2">
                  Dynamics 365
                </span>
              </div>
              <div
                className="px-4 py-2 text-white text-xs flex gap-4"
                style={{ backgroundColor: colors.navbarShelf }}
              >
                <span>Sales</span>
                <span>Service</span>
                <span>Field Service</span>
                <span>Marketing</span>
              </div>
              <div
                className="p-6"
                style={{ backgroundColor: colors.pageBackground }}
              >
                <div
                  className="text-lg font-semibold mb-1"
                  style={{ color: colors.headerColor }}
                >
                  Active Work Orders
                </div>
                <a
                  href="#"
                  className="text-sm underline"
                  style={{ color: colors.globalLink }}
                  onClick={(e) => e.preventDefault()}
                >
                  WO-00123 — Acme Inc. inspection
                </a>
                <div className="mt-4 flex gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm rounded text-white"
                    style={{ backgroundColor: colors.main }}
                  >
                    New
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 text-sm rounded text-white"
                    style={{ backgroundColor: colors.accent }}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>

          {branding.url && (
            <div className="card p-4 text-xs text-muted">
              <div>
                <span className="text-white font-semibold">Detected from:</span>{" "}
                <code className="text-accent break-all">{branding.url}</code>
              </div>
              {branding.themeColor && (
                <div className="mt-1">
                  <span className="text-white font-semibold">
                    theme-color meta:
                  </span>{" "}
                  <code>{branding.themeColor}</code>
                </div>
              )}
              {branding.candidateColors.length > 0 && (
                <div className="mt-2 flex items-center gap-1 flex-wrap">
                  <span className="text-white font-semibold mr-1">
                    Page palette:
                  </span>
                  {branding.candidateColors.map((c) => (
                    <button
                      key={c}
                      type="button"
                      title={`Use ${c} as primary`}
                      onClick={() =>
                        setColors({
                          ...deriveColors(c, colors.accent),
                          pageBackground: colors.pageBackground,
                        })
                      }
                      className="w-5 h-5 rounded border border-border"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-6 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm">
          {error}
        </div>
      )}

      <div className="flex justify-between mt-8">
        <button onClick={onBack} className="btn-ghost flex items-center gap-2">
          <ArrowLeft size={16} />
          Back
        </button>
        <button
          onClick={onApply}
          disabled={busy}
          className="btn-primary flex items-center gap-2 disabled:opacity-50"
        >
          Apply &amp; publish
          <ArrowRight size={16} weight="bold" />
        </button>
      </div>
    </>
  );
}

interface ColorRowProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
}
function ColorRow({ label, value, onChange }: ColorRowProps) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="w-10 h-10 rounded border border-border bg-transparent cursor-pointer"
      />
      <div className="flex-1">
        <div className="text-xs text-muted">{label}</div>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2 py-1 rounded bg-bg-base border border-border text-white text-sm font-mono focus:outline-none focus:border-accent"
        />
      </div>
    </div>
  );
}
