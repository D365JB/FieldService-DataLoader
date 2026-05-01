import { useEffect, useState, type ReactNode } from "react";
import { Lock, ArrowRight, Warning } from "@phosphor-icons/react";
import { appKeyStore } from "@/lib/appKey";

/**
 * Full-page gate that blocks the SPA until the operator has entered the
 * `APP_ACCESS_KEY` configured on the Function App. Verifies the key by
 * making a single test call to `/api/models` (cheap; auth-gated). On 401
 * the gate stays up with an inline error.
 */
export function AppKeyGate({ children }: { children: ReactNode }) {
  const [unlocked, setUnlocked] = useState(() => Boolean(appKeyStore.get()));

  useEffect(() => {
    return appKeyStore.subscribe(() => setUnlocked(Boolean(appKeyStore.get())));
  }, []);

  if (unlocked) return <>{children}</>;
  return <KeyPrompt />;
}

function KeyPrompt() {
  const [value, setValue] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const trimmed = value.trim();
    if (!trimmed) {
      setError("Enter an access key.");
      return;
    }
    setVerifying(true);
    try {
      const res = await fetch("/api/models", {
        headers: { "x-app-key": trimmed },
      });
      if (res.status === 401) {
        setError("That key isn't valid for this deployment.");
        return;
      }
      if (!res.ok) {
        setError(`Server returned ${res.status}. Check the function logs.`);
        return;
      }
      // Success — persist and let the gate re-render the app.
      appKeyStore.set(trimmed);
    } catch (err) {
      setError(`Couldn't reach the API: ${(err as Error).message}`);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-base px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-md card p-8 space-y-5"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-accent/15 border border-accent/30 flex items-center justify-center">
            <Lock size={20} weight="duotone" className="text-accent" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">Restricted access</h1>
            <p className="text-xs text-muted">
              This deployment is not open to demo users. Enter the access key to continue.
            </p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">
            Access key
          </label>
          <input
            type="password"
            autoFocus
            autoComplete="off"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Paste the key from APP_ACCESS_KEY"
            className="w-full bg-bg-base border border-border rounded-md px-3 py-2 text-sm text-white focus:outline-none focus:border-accent"
          />
        </div>

        {error && (
          <div className="flex items-start gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/30 rounded-md p-2.5">
            <Warning size={14} className="flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={verifying}
          className="btn-primary w-full flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {verifying ? "Verifying…" : "Unlock"}
          {!verifying && <ArrowRight size={16} weight="bold" />}
        </button>

        <p className="text-[11px] text-muted text-center">
          Stored locally in your browser. Clear it via the dashboard footer at any time.
        </p>
      </form>
    </div>
  );
}
