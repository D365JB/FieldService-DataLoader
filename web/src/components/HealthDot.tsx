/**
 * v1.43.0 — small green/amber/red status dot in the app header.
 *
 * Polls `/api/health` every 60s. The endpoint is anonymous and dependency-
 * free, so a non-200 is a real signal that the Functions host is unhappy
 * (not a downstream Dataverse / AOAI problem).
 *
 * States:
 *  - green: last probe returned 200
 *  - red:   last probe failed (network error or non-200)
 *  - amber: no probe completed yet (initial mount) or a probe is in flight
 *           after a previous failure
 */
import { useEffect, useState } from "react";

type HealthState = "pending" | "ok" | "down";

interface HealthInfo {
  state: HealthState;
  lastCheckedAt: string | null;
  lastError: string | null;
}

const POLL_MS = 60_000;
const TIMEOUT_MS = 8_000;

async function probe(): Promise<{ ok: boolean; error: string | null }> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
    const res = await fetch("/api/health", {
      method: "GET",
      cache: "no-store",
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

export function HealthDot() {
  const [info, setInfo] = useState<HealthInfo>({
    state: "pending",
    lastCheckedAt: null,
    lastError: null,
  });

  useEffect(() => {
    let mounted = true;
    async function tick() {
      const { ok, error } = await probe();
      if (!mounted) return;
      setInfo({
        state: ok ? "ok" : "down",
        lastCheckedAt: new Date().toISOString(),
        lastError: error,
      });
    }
    tick();
    const id = window.setInterval(tick, POLL_MS);
    return () => {
      mounted = false;
      window.clearInterval(id);
    };
  }, []);

  const color =
    info.state === "ok"
      ? "bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]"
      : info.state === "down"
        ? "bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.6)]"
        : "bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.6)]";

  const label =
    info.state === "ok"
      ? "API healthy"
      : info.state === "down"
        ? `API down${info.lastError ? ` — ${info.lastError}` : ""}`
        : "Checking API…";

  const checked = info.lastCheckedAt
    ? ` (checked ${new Date(info.lastCheckedAt).toLocaleTimeString()})`
    : "";

  return (
    <span
      className="inline-flex items-center gap-1.5 text-[11px] text-slate-400"
      title={label + checked}
      aria-label={label}
    >
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      <span className="hidden lg:inline">
        {info.state === "ok"
          ? "API"
          : info.state === "down"
            ? "API down"
            : "API…"}
      </span>
    </span>
  );
}
