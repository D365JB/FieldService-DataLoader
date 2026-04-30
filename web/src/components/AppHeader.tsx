import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useNavigate, useLocation } from "react-router-dom";
import { Wrench, SignOut, UserCircle, ArrowLeft, House } from "@phosphor-icons/react";
import { APP_VERSION } from "@/data/changelog";
import { ChangelogModal } from "@/components/ChangelogModal";
import { Attribution } from "@/components/Attribution";

interface Props {
  orgUrl?: string;
  /** Path to navigate to when the back button is clicked. Defaults to "/dashboard". Pass `false` to hide. */
  back?: string | false;
}

export function AppHeader({ orgUrl, back }: Props) {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const location = useLocation();
  const account = accounts[0];
  const [changelogOpen, setChangelogOpen] = useState(false);

  // Decide whether to show a back button. Skip on landing and dashboard.
  const isLanding = location.pathname === "/";
  const isDashboard = location.pathname === "/dashboard";
  const showBack =
    !!account && back !== false && !isLanding && !isDashboard;
  const backTarget = typeof back === "string" ? back : "/dashboard";

  return (
    <header className="border-b border-border bg-bg-elevated/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate(account ? "/dashboard" : "/")}
            className="flex items-center gap-2 text-white hover:text-accent transition-colors"
          >
            <Wrench size={24} weight="bold" className="text-accent" />
            <span className="font-semibold">Field Service Data Studio</span>
          </button>
          {showBack && (
            <div className="flex items-center gap-1">
              <button
                onClick={() => navigate(backTarget)}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-slate-300 hover:text-white hover:bg-bg-base transition-colors"
                title="Back"
              >
                <ArrowLeft size={16} />
                <span className="hidden sm:inline">Back</span>
              </button>
              <button
                onClick={() => navigate("/dashboard")}
                className="flex items-center gap-1.5 px-2 py-1 rounded-md text-sm text-slate-300 hover:text-white hover:bg-bg-base transition-colors"
                title="Dashboard"
              >
                <House size={16} />
                <span className="hidden sm:inline">Dashboard</span>
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setChangelogOpen(true)}
            className="px-2 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent text-[11px] font-bold tracking-wider hover:bg-accent/25 transition-colors"
            title="View changelog"
          >
            {APP_VERSION}
          </button>
          {orgUrl && (
            <span className="text-xs text-muted hidden md:block">
              {new URL(orgUrl).host}
            </span>
          )}
          {account && (
            <>
              <div className="flex items-center gap-2 text-sm text-slate-300">
                <UserCircle size={20} />
                <span className="hidden md:inline">{account.username}</span>
              </div>
              <button
                onClick={() =>
                  instance.logoutPopup({ postLogoutRedirectUri: "/" })
                }
                className="btn-ghost flex items-center gap-1"
                title="Sign out"
              >
                <SignOut size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      <div className="border-t border-border/60 bg-bg-elevated/60">
        <div className="max-w-7xl mx-auto px-6 py-2">
          <Attribution />
        </div>
      </div>
      <ChangelogModal open={changelogOpen} onClose={() => setChangelogOpen(false)} />
    </header>
  );
}
