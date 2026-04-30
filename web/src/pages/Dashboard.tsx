import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { Sparkle, Trash, Wrench, Palette } from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { orgStore } from "@/lib/orgStore";

const ACTIONS = [
  {
    icon: Palette,
    title: "Brand your environment",
    body: "Paste a customer URL — we’ll fetch their logo and brand colors, let you tweak, then publish a D365 theme as the default for the org.",
    cta: "Brand environment",
    href: "/brand",
    primary: true,
  },
  {
    icon: Sparkle,
    title: "Generate FS demo data",
    body: "Analyze a customer URL with AI, then populate your demo org with a full Field Service demo: accounts, work orders + bookings, agreements, customer assets, IoT alerts, and inventory.",
    cta: "Start AI generator",
    href: "/analyze",
    primary: false,
  },
  {
    icon: Trash,
    title: "Reset demo data",
    body: "Tear down records created by previous runs of this tool. Tracked per run — your real data is untouched.",
    cta: "Open reset",
    href: "/reset",
    primary: false,
  },
];

export function Dashboard() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const orgUrl = orgStore.getOrgUrl() ?? undefined;

  if (!accounts[0]) {
    navigate("/");
    return null;
  }
  if (!orgUrl) {
    navigate("/connect");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader orgUrl={orgUrl} />
      <main className="flex-1 max-w-5xl mx-auto px-6 py-12 w-full">
        <div className="flex items-center gap-3 mb-2">
          <Wrench size={28} className="text-accent" weight="duotone" />
          <h1 className="text-3xl font-bold text-white">What do you want to do?</h1>
        </div>
        <p className="text-slate-400 mb-10">
          Connected to <code className="text-accent">{new URL(orgUrl).host}</code>
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {ACTIONS.map((a) => (
            <button
              key={a.title}
              onClick={() => navigate(a.href)}
              className="card p-6 text-left hover:border-accent transition-colors group"
            >
              <a.icon
                size={36}
                weight="duotone"
                className={
                  a.primary
                    ? "text-accent mb-4"
                    : "text-slate-400 mb-4 group-hover:text-accent transition-colors"
                }
              />
              <h3 className="text-lg font-semibold text-white mb-2">{a.title}</h3>
              <p className="text-slate-400 text-sm leading-relaxed mb-4">{a.body}</p>
              <span className="text-accent text-sm font-medium group-hover:underline">
                {a.cta} →
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
}
