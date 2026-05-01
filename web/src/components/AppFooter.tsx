import { useState } from "react";
import { APP_VERSION } from "@/data/changelog";
import { ChangelogModal } from "@/components/ChangelogModal";
import { appKeyStore } from "@/lib/appKey";

export function AppFooter() {
  const [open, setOpen] = useState(false);
  return (
    <footer className="border-t border-border bg-bg-elevated/80 backdrop-blur mt-auto">
      <div className="max-w-7xl mx-auto px-6 py-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-muted">
        <span>Field Service Data Studio</span>
        <span className="text-border">•</span>
        <button
          onClick={() => setOpen(true)}
          className="px-2 py-0.5 rounded-md bg-accent/15 border border-accent/30 text-accent text-[10px] font-bold tracking-wider hover:bg-accent/25 transition-colors"
          title="View changelog"
        >
          {APP_VERSION}
        </button>
        <span className="text-border">•</span>
        <button
          onClick={() => {
            if (
              window.confirm(
                "Clear the saved access key? You'll need to re-enter it to use the app.",
              )
            ) {
              appKeyStore.clear();
            }
          }}
          className="text-[10px] text-muted hover:text-white transition-colors"
          title="Clear the saved app access key"
        >
          Lock
        </button>
      </div>
      <ChangelogModal open={open} onClose={() => setOpen(false)} />
    </footer>
  );
}
