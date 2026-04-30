import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { Trash, Warning, CheckCircle, CircleNotch } from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { DataverseClient } from "@/lib/dataverse";
import { resetDemoData, DEMO_TAG, type SeedProgress } from "@/lib/fs/seed-config";

export function Reset() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const orgUrl = sessionStorage.getItem("orgUrl") ?? "";

  const [confirmText, setConfirmText] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<SeedProgress | null>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  useEffect(() => {
    if (!accounts[0]) navigate("/");
    else if (!orgUrl) navigate("/connect");
  }, [accounts, orgUrl, navigate]);

  const expectedConfirm = orgUrl ? new URL(orgUrl).host : "";
  const confirmed = confirmText.trim() === expectedConfirm;

  async function handleReset() {
    if (!confirmed) return;
    setError(null);
    setResult(null);
    setRunning(true);
    try {
      const dv = new DataverseClient({ orgUrl });
      const r = await resetDemoData(dv, setProgress);
      setResult(r.deletedByEntity);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRunning(false);
      setProgress(null);
    }
  }

  if (!orgUrl) return null;

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader orgUrl={orgUrl} />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-12 w-full">
        <div className="flex items-center gap-3 mb-2">
          <Trash size={28} className="text-red-400" weight="duotone" />
          <h1 className="text-3xl font-bold text-white">Reset demo data</h1>
        </div>
        <p className="text-slate-400 mb-8">
          Deletes every record this tool created — anything whose description
          starts with <code className="text-accent">{DEMO_TAG}:</code>. Your
          real data is untouched.
        </p>

        <div className="card p-6">
          <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2 mb-4">
            <Warning size={18} className="flex-shrink-0 mt-0.5" />
            <div>
              This will delete all <code>{DEMO_TAG}</code>-tagged service
              tasks, incident types, work order types, characteristics,
              products, and territories from{" "}
              <strong>{expectedConfirm}</strong>. This cannot be undone.
            </div>
          </div>

          <label className="block text-sm font-medium text-slate-300 mb-2">
            Type <code className="text-accent">{expectedConfirm}</code> to confirm
          </label>
          <input
            type="text"
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={expectedConfirm}
            disabled={running}
            className="w-full bg-bg-elevated border border-border rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-red-500 font-mono"
          />

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleReset}
              disabled={!confirmed || running}
              className="bg-red-600 hover:bg-red-700 text-white font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {running ? (
                <CircleNotch size={18} className="animate-spin" />
              ) : (
                <Trash size={18} weight="bold" />
              )}
              {running ? "Deleting…" : "Delete demo data"}
            </button>
            <button
              onClick={() => navigate("/dashboard")}
              className="btn-ghost"
              disabled={running}
            >
              Cancel
            </button>
          </div>

          {progress && (
            <div className="mt-4 text-sm text-slate-400">
              {progress.step}: {progress.done}/{progress.total}
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              <strong>Reset failed.</strong>
              <div className="mt-1 font-mono text-xs">{error}</div>
            </div>
          )}

          {result && (
            <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle size={18} weight="fill" />
                <strong>Reset complete</strong>
              </div>
              <ul className="text-xs space-y-1 font-mono">
                {Object.entries(result).map(([entity, count]) => (
                  <li key={entity}>
                    {entity}: {count} deleted
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
