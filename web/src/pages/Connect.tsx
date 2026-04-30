import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMsal } from "@azure/msal-react";
import { Plug, CheckCircle, Warning } from "@phosphor-icons/react";
import { AppHeader } from "@/components/AppHeader";
import { getDataverseToken } from "@/auth/msal";

interface WhoAmIResponse {
  UserId: string;
  BusinessUnitId: string;
  OrganizationId: string;
}

export function Connect() {
  const { accounts } = useMsal();
  const navigate = useNavigate();
  const [orgUrl, setOrgUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    user: string;
    org: string;
    name: string;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleTest() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const trimmed = orgUrl.replace(/\/+$/, "");
      const token = await getDataverseToken(trimmed);

      const whoamiRes = await fetch(`${trimmed}/api/data/v9.2/WhoAmI`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "OData-MaxVersion": "4.0",
          "OData-Version": "4.0",
        },
      });
      if (!whoamiRes.ok) {
        throw new Error(
          `WhoAmI failed: ${whoamiRes.status} ${whoamiRes.statusText}`,
        );
      }
      const whoami: WhoAmIResponse = await whoamiRes.json();

      // Friendly user lookup
      const userRes = await fetch(
        `${trimmed}/api/data/v9.2/systemusers(${whoami.UserId})?$select=fullname`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      const user = userRes.ok ? await userRes.json() : { fullname: "Unknown" };

      sessionStorage.setItem("orgUrl", trimmed);
      setResult({
        user: whoami.UserId,
        org: whoami.OrganizationId,
        name: user.fullname,
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleContinue() {
    navigate("/dashboard");
  }

  if (!accounts[0]) {
    navigate("/");
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col">
      <AppHeader orgUrl={orgUrl} />
      <main className="flex-1 max-w-2xl mx-auto px-6 py-16 w-full">
        <h1 className="text-3xl font-bold text-white mb-2">
          Connect to your Dataverse
        </h1>
        <p className="text-slate-400 mb-8">
          Enter the URL of the Dynamics 365 environment you want to populate.
          We'll verify access using your sign-in.
        </p>

        <div className="card p-6">
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Environment URL
          </label>
          <input
            type="url"
            value={orgUrl}
            onChange={(e) => setOrgUrl(e.target.value)}
            placeholder="https://contoso.crm.dynamics.com"
            className="w-full bg-bg-elevated border border-border rounded-lg px-4 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-accent"
          />
          <p className="text-xs text-muted mt-2">
            Find this in your D365 Power Platform admin center, e.g.{" "}
            <code>https://orgname.crm.dynamics.com</code>.
          </p>

          <div className="flex gap-3 mt-6">
            <button
              onClick={handleTest}
              disabled={!orgUrl || busy}
              className="btn-primary flex items-center gap-2 disabled:opacity-50"
            >
              <Plug size={18} weight="bold" />
              {busy ? "Connecting…" : "Test connection"}
            </button>
            {result && (
              <button onClick={handleContinue} className="btn-primary">
                Continue →
              </button>
            )}
          </div>

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm flex items-start gap-2">
              <Warning size={18} className="flex-shrink-0 mt-0.5" />
              <div>
                <strong>Connection failed.</strong>
                <div className="mt-1 font-mono text-xs">{error}</div>
              </div>
            </div>
          )}

          {result && (
            <div className="mt-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-sm flex items-start gap-2">
              <CheckCircle size={18} weight="fill" className="mt-0.5" />
              <div>
                <strong>Connected as {result.name}</strong>
                <div className="mt-1 font-mono text-xs opacity-70">
                  org {result.org.slice(0, 8)}…
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
