import { useState } from "react";
import { useMsal } from "@azure/msal-react";
import { useNavigate } from "react-router-dom";
import { Wrench, SignOut, UserCircle } from "@phosphor-icons/react";
import { APP_VERSION } from "@/data/changelog";
import { ChangelogModal } from "@/components/ChangelogModal";
import { Attribution } from "@/components/Attribution";

interface Props {
  orgUrl?: string;
}

export function AppHeader({ orgUrl }: Props) {
  const { instance, accounts } = useMsal();
  const navigate = useNavigate();
  const account = accounts[0];
  const [changelogOpen, setChangelogOpen] = useState(false);

  return (
    <header className="border-b border-border bg-bg-elevated/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-white hover:text-accent transition-colors"
        >
          <Wrench size={24} weight="bold" className="text-accent" />
          <span className="font-semibold">Field Service Data Studio</span>
        </button>
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
