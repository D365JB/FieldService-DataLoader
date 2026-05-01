/**
 * Admin / telemetry page. Locked behind the shared `APP_ACCESS_KEY` —
 * everything else in the app is open. Shows the most recent telemetry
 * rows and a few aggregate counts: distinct users, sessions, top routes,
 * average session length.
 */
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  ArrowsClockwise,
  ChartLineUp,
  ClockClockwise,
  SignOut,
  User,
} from "@phosphor-icons/react";
import { apiFetch, appKeyStore } from "@/lib/appKey";

interface TelemetryRow {
  partitionKey: string;
  rowKey: string;
  ts: string;
  kind: string;
  user: string;
  tenant: string;
  sessionId: string;
  path: string;
  detail: string;
  ua: string;
}

interface TelemetryResponse {
  rows: TelemetryRow[];
  count: number;
  limit: number;
  days: number;
}

export function Admin() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<TelemetryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/telemetry?limit=2000&days=${days}`);
      if (res.status === 401) {
        appKeyStore.clear();
        setError("Access key was rejected. You'll be prompted to re-enter it.");
        return;
      }
      if (!res.ok) {
        setError(`Server returned ${res.status}.`);
        return;
      }
      const json = (await res.json()) as TelemetryResponse;
      setRows(json.rows);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const stats = useMemo(() => computeStats(rows), [rows]);

  return (
    <div className="min-h-screen bg-bg-base text-white">
      <header className="border-b border-border bg-bg-elevated/60 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <button
            onClick={() => navigate("/")}
            className="text-muted hover:text-white text-xs flex items-center gap-1.5"
          >
            <ArrowLeft size={14} />
            Back to app
          </button>
          <div className="flex-1" />
          <button
            onClick={() => void load()}
            className="text-xs text-muted hover:text-white flex items-center gap-1.5"
          >
            <ArrowsClockwise size={14} />
            Refresh
          </button>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            title="Time window"
            aria-label="Time window"
            className="bg-bg-base border border-border rounded-md px-2 py-1 text-xs"
          >
            <option value={1}>Last 24h</option>
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <button
            onClick={() => {
              if (
                window.confirm(
                  "Clear the saved access key and lock the admin page?",
                )
              ) {
                appKeyStore.clear();
              }
            }}
            className="text-xs text-muted hover:text-red-300 flex items-center gap-1.5"
            title="Clear stored access key"
          >
            <SignOut size={14} />
            Lock
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <ChartLineUp size={22} weight="duotone" className="text-accent" />
          <h1 className="text-xl font-semibold">Telemetry</h1>
          <span className="text-xs text-muted">
            {rows.length.toLocaleString()} events
          </span>
        </div>

        {error && (
          <div className="card p-3 text-sm text-red-300 bg-red-500/5 border-red-500/30">
            {error}
          </div>
        )}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard
            icon={<User size={16} weight="duotone" />}
            label="Distinct users"
            value={stats.distinctUsers}
          />
          <StatCard
            icon={<ClockClockwise size={16} weight="duotone" />}
            label="Sessions"
            value={stats.distinctSessions}
          />
          <StatCard
            icon={<ChartLineUp size={16} weight="duotone" />}
            label="Page views"
            value={stats.pageViews}
          />
          <StatCard
            icon={<ClockClockwise size={16} weight="duotone" />}
            label="Avg session"
            value={formatDuration(stats.avgSessionMs)}
          />
        </section>

        <section className="grid md:grid-cols-2 gap-4">
          <div className="card p-4">
            <h2 className="text-sm font-semibold mb-3">Top users</h2>
            <BreakdownTable
              rows={stats.topUsers.map((u) => ({ key: u.user, count: u.count }))}
              keyHeader="User"
              empty="No signed-in users yet."
            />
          </div>
          <div className="card p-4">
            <h2 className="text-sm font-semibold mb-3">Top pages</h2>
            <BreakdownTable
              rows={stats.topPaths.map((p) => ({ key: p.path, count: p.count }))}
              keyHeader="Path"
              empty="No page events recorded."
            />
          </div>
        </section>

        <section className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-semibold">Recent events</h2>
            {loading && (
              <span className="text-xs text-muted">Loading…</span>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-muted bg-bg-base/40 border-b border-border">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">When</th>
                  <th className="text-left px-3 py-2 font-medium">Kind</th>
                  <th className="text-left px-3 py-2 font-medium">User</th>
                  <th className="text-left px-3 py-2 font-medium">Path</th>
                  <th className="text-left px-3 py-2 font-medium">Detail</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 200).map((r) => (
                  <tr
                    key={`${r.partitionKey}/${r.rowKey}`}
                    className="border-b border-border/40"
                  >
                    <td className="px-3 py-1.5 whitespace-nowrap text-muted">
                      {formatTs(r.ts)}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-accent/15 border border-accent/30 text-accent text-[10px] font-medium tracking-wide">
                        {r.kind}
                      </span>
                    </td>
                    <td className="px-3 py-1.5 truncate max-w-[16rem]">
                      {r.user || <span className="text-muted">anonymous</span>}
                    </td>
                    <td className="px-3 py-1.5 text-muted">{r.path}</td>
                    <td className="px-3 py-1.5 text-muted truncate max-w-[24rem]">
                      {r.detail}
                    </td>
                  </tr>
                ))}
                {!loading && rows.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-8 text-center text-muted text-xs"
                    >
                      No telemetry yet for this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}) {
  return (
    <div className="card p-3">
      <div className="flex items-center gap-2 text-muted text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-xl font-semibold mt-1.5">{value}</div>
    </div>
  );
}

function BreakdownTable({
  rows,
  keyHeader,
  empty,
}: {
  rows: { key: string; count: number }[];
  keyHeader: string;
  empty: string;
}) {
  if (rows.length === 0) {
    return <p className="text-xs text-muted">{empty}</p>;
  }
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <table className="w-full text-xs">
      <thead className="text-muted">
        <tr>
          <th className="text-left font-medium pb-1.5">{keyHeader}</th>
          <th className="text-right font-medium pb-1.5 w-16">Count</th>
        </tr>
      </thead>
      <tbody>
        {rows.slice(0, 8).map((r) => (
          <tr key={r.key} className="border-t border-border/40">
            <td className="py-1.5 pr-2">
              <div className="flex items-center gap-2">
                <div className="flex-1 truncate max-w-[14rem]">{r.key}</div>
                <div
                  className="h-1 rounded bg-accent/40"
                  style={{ width: `${(r.count / max) * 60}px` }}
                />
              </div>
            </td>
            <td className="py-1.5 text-right tabular-nums">{r.count}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

interface Stats {
  distinctUsers: number;
  distinctSessions: number;
  pageViews: number;
  avgSessionMs: number;
  topUsers: { user: string; count: number }[];
  topPaths: { path: string; count: number }[];
}

function computeStats(rows: TelemetryRow[]): Stats {
  const userSet = new Set<string>();
  const sessionMap = new Map<string, { min: number; max: number }>();
  const userCount = new Map<string, number>();
  const pathCount = new Map<string, number>();
  let pageViews = 0;

  for (const r of rows) {
    if (r.user && r.user !== "anonymous") userSet.add(r.user);
    if (r.sessionId) {
      const t = Date.parse(r.ts);
      if (!Number.isNaN(t)) {
        const s = sessionMap.get(r.sessionId);
        if (s) {
          s.min = Math.min(s.min, t);
          s.max = Math.max(s.max, t);
        } else {
          sessionMap.set(r.sessionId, { min: t, max: t });
        }
      }
    }
    if (r.user) userCount.set(r.user, (userCount.get(r.user) ?? 0) + 1);
    if (r.kind === "page" && r.path) {
      pageViews++;
      pathCount.set(r.path, (pathCount.get(r.path) ?? 0) + 1);
    }
  }

  let totalMs = 0;
  let counted = 0;
  for (const s of sessionMap.values()) {
    const d = s.max - s.min;
    if (d > 0) {
      totalMs += d;
      counted++;
    }
  }

  return {
    distinctUsers: userSet.size,
    distinctSessions: sessionMap.size,
    pageViews,
    avgSessionMs: counted ? Math.round(totalMs / counted) : 0,
    topUsers: [...userCount.entries()]
      .map(([user, count]) => ({ user, count }))
      .sort((a, b) => b.count - a.count),
    topPaths: [...pathCount.entries()]
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count),
  };
}

function formatTs(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function formatDuration(ms: number): string {
  if (!ms) return "—";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  const h = (m / 60).toFixed(1);
  return `${h}h`;
}
