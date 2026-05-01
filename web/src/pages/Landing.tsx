import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import {
  ArrowRight,
  Wrench,
  Sparkle,
  Database,
  ShieldCheck,
} from "@phosphor-icons/react";
import { APP_VERSION } from "@/data/changelog";
import { ChangelogModal } from "@/components/ChangelogModal";

const FEATURES = [
  {
    icon: Sparkle,
    title: "AI-driven presets",
    body: "Paste a customer URL — GPT analyzes their site and proposes a tailored Field Service vertical (HVAC, electrical, fire & safety, etc.) with realistic territories, work order types, and incident catalogs.",
  },
  {
    icon: Database,
    title: "End-to-end FS data",
    body: "Generates the full dependency graph: territories → work order types → incident types → service tasks → characteristics → products → bookable resources → work orders with bookings.",
  },
  {
    icon: ShieldCheck,
    title: "Your tenant, your rules",
    body: "Sign in with your D365 credentials. Your existing security roles gate every write. Nothing leaves the browser except calls to your tenant and one shared AI proxy.",
  },
];

export function Landing() {
  const { instance } = useMsal();
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [changelogOpen, setChangelogOpen] = useState(false);

  async function handleSignIn() {
    setBusy(true);
    try {
      const result = await instance.loginPopup({
        scopes: ["User.Read"],
        prompt: "select_account",
      });
      instance.setActiveAccount(result.account);
      navigate("/connect");
    } catch (err) {
      console.error(err);
      alert(`Sign-in failed: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1 max-w-6xl mx-auto px-6 py-16">
        <section className="text-center mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/30 text-accent text-sm mb-3">
            <Wrench size={16} weight="bold" />
            Built for Dynamics 365 Field Service
          </div>
          <div className="mb-3">
            <button
              onClick={() => setChangelogOpen(true)}
              className="px-2.5 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent text-xs font-bold tracking-wider hover:bg-accent/25 transition-colors"
              title="View changelog"
            >
              {APP_VERSION}
            </button>
          </div>
          <div className="mb-6 flex justify-center">
            <div className="inline-flex flex-wrap items-center justify-center gap-x-3 gap-y-1 px-4 py-1.5 rounded-full bg-slate-800/60 border border-slate-700 text-xs text-slate-400">
              <span>
                Built by <strong className="font-semibold text-slate-200">James Bowen</strong>
              </span>
              <span aria-hidden="true" className="text-slate-600">•</span>
              <a
                href="mailto:jamesbowen@microsoft.com"
                className="text-accent hover:underline"
              >
                jamesbowen@microsoft.com
              </a>
              <span aria-hidden="true" className="text-slate-600">•</span>
              <span>Principal Solution Specialist | Manufacturing &amp; Mobility</span>
            </div>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-white mb-6 tracking-tight">
            Realistic Field Service demo data
            <br />
            <span className="text-accent">in minutes, not days.</span>
          </h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto mb-10">
            Generate work orders, agreements, assets, and the full dispatch
            graph for a believable customer-flavored Field Service demo —
            powered by AI, written straight to your demo org.
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleSignIn}
              disabled={busy}
              className="btn-primary text-lg px-6 py-3 flex items-center gap-2 disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Sign in to your tenant"}
              <ArrowRight size={20} weight="bold" />
            </button>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <div key={f.title} className="card p-6">
              <f.icon
                size={32}
                weight="duotone"
                className="text-accent mb-4"
              />
              <h3 className="text-lg font-semibold text-white mb-2">
                {f.title}
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-sm text-muted">
        Built on Azure Static Web Apps · MSAL · Azure OpenAI · Dataverse Web API
      </footer>
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </div>
  );
}
