/**
 * v1.44.0 — Friendly wrapper around `fetch` for `/api/*` calls.
 *
 *  - Auto-attaches the `x-fsdl-session` header so every backend log line can
 *    be correlated with the user's browser tab (same id telemetry events use).
 *  - Maps the three categories of failure we actually see in production into
 *    a structured `ApiFetchError` with a human-readable `friendly` field:
 *      1. Network / abort     — "API service unreachable, retrying…"
 *      2. 5xx + 503 from AOAI — "Backend overloaded, please wait Ns"
 *      3. 4xx                 — "Bad request" / surfaced server detail
 *  - Surfaces `Retry-After` (seconds) on 429/503 so callers can pause sanely
 *    instead of immediately re-firing.
 *
 * Use `apiFetch()` for new code. Existing call sites that use raw `fetch`
 * still pick up the session header automatically via the global interceptor
 * installed in `main.tsx`.
 */
import { getTelemetrySessionId } from "@/lib/telemetry";

export interface ApiFetchOptions extends RequestInit {
  /** Per-request timeout. Default 30s for fast calls, callers override for
   * long AOAI calls (e.g. Brand extract, Analyze) up to ~110s. */
  timeoutMs?: number;
}

export class ApiFetchError extends Error {
  /** HTTP status, or 0 for network/abort errors. */
  status: number;
  /** Server-provided `Retry-After` in seconds, when present. */
  retryAfterSec: number | null;
  /** Concise message safe to surface in the UI. */
  friendly: string;
  /** Raw response body (truncated to 2 KB) for diagnostics. */
  raw: string;

  constructor(opts: {
    status: number;
    retryAfterSec: number | null;
    friendly: string;
    raw: string;
  }) {
    super(`${opts.status === 0 ? "network" : `HTTP ${opts.status}`}: ${opts.friendly}`);
    this.name = "ApiFetchError";
    this.status = opts.status;
    this.retryAfterSec = opts.retryAfterSec;
    this.friendly = opts.friendly;
    this.raw = opts.raw;
  }
}

function friendlyForStatus(status: number, body: string): string {
  if (status === 0) {
    return "API service unreachable. The Functions host may be cold-starting — wait a few seconds and retry.";
  }
  if (status === 401 || status === 403) {
    return "Sign-in is required or the access key is invalid. Sign out and back in to refresh your token.";
  }
  if (status === 404) {
    return "API endpoint not found. The backend may not have finished deploying — check the version banner.";
  }
  if (status === 413) {
    return "Request payload too large for the API. Try shortening the prompt or URL.";
  }
  if (status === 429) {
    return "Azure OpenAI rate limit hit. The request is queued — please wait and retry.";
  }
  if (status === 503) {
    return "Backend reported overload. Wait the suggested delay then retry.";
  }
  if (status >= 500) {
    return "Backend error. The Functions host returned a 5xx — usually transient, retry in a moment.";
  }
  // Try to surface a server `error` field for 4xx that aren't covered above.
  try {
    const parsed = JSON.parse(body) as { error?: string };
    if (parsed?.error) return parsed.error;
  } catch {
    /* fall through */
  }
  return `Request failed with status ${status}.`;
}

/**
 * Wrap `fetch` with session-id injection, timeout, and structured errors.
 *
 * Returns the Response when `res.ok`. Throws `ApiFetchError` otherwise so
 * callers don't have to remember the dual error path (network vs HTTP).
 */
export async function apiFetch(
  url: string,
  options: ApiFetchOptions = {},
): Promise<Response> {
  const { timeoutMs = 30_000, headers, ...rest } = options;
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      signal: ac.signal,
      headers: {
        ...(headers as Record<string, string> | undefined),
        "x-fsdl-session": getTelemetrySessionId(),
      },
    });
  } catch (err) {
    clearTimeout(t);
    const isAbort = (err as Error).name === "AbortError";
    throw new ApiFetchError({
      status: 0,
      retryAfterSec: null,
      friendly: isAbort
        ? `API call exceeded ${Math.round(timeoutMs / 1000)}s timeout. The backend is slow or unreachable.`
        : friendlyForStatus(0, ""),
      raw: (err as Error).message,
    });
  }
  clearTimeout(t);
  if (res.ok) return res;
  const retryHeader = res.headers.get("retry-after");
  const retryAfterSec = retryHeader ? parseInt(retryHeader, 10) : NaN;
  const body = await res.text().catch(() => "");
  throw new ApiFetchError({
    status: res.status,
    retryAfterSec: Number.isFinite(retryAfterSec) ? retryAfterSec : null,
    friendly: friendlyForStatus(res.status, body),
    raw: body.slice(0, 2048),
  });
}

/**
 * Friendly-message extractor for callers that already use raw `fetch` and
 * just want a sane string to display when something blows up. Accepts
 * anything thrown (ApiFetchError, Error, string).
 */
export function friendlyApiError(err: unknown): string {
  if (err instanceof ApiFetchError) return err.friendly;
  const msg = (err as Error)?.message ?? String(err);
  if (/failed to fetch|networkerror|load failed/i.test(msg)) {
    return "API service unreachable. The Functions host may be cold-starting — wait a few seconds and retry.";
  }
  if (/aborted|timeout/i.test(msg)) {
    return "API call timed out. The backend is slow or unreachable — retry in a moment.";
  }
  return msg;
}
