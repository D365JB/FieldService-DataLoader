/**
 * GET /api/telemetry
 *
 * Locked endpoint — requires the shared `x-app-key` header (validated by
 * `requireAppKey`). Returns the most recent telemetry rows from the
 * `telemetry` table for the admin/audit page.
 *
 * Query params:
 *   limit  — max rows (default 500, capped at 2000)
 *   days   — partitions to scan (default 7, capped at 30)
 */
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { readRecent } from "../lib/telemetry";
import { requireAppKey } from "../lib/requireAppKey";

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    origin && ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-app-key",
    Vary: "Origin",
  };
}

function intParam(value: string | null, def: number, max: number): number {
  const n = value ? Number.parseInt(value, 10) : NaN;
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(n, max);
}

export async function getTelemetry(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return { status: 204, headers: cors };

  const gate = requireAppKey(req, cors);
  if (gate) return gate;

  const limit = intParam(req.query.get("limit"), 500, 2000);
  const days = intParam(req.query.get("days"), 7, 30);

  try {
    const rows = await readRecent(limit, days);
    return {
      status: 200,
      headers: cors,
      jsonBody: { rows, limit, days, count: rows.length },
    };
  } catch (err) {
    ctx.error("telemetry read failed", err);
    return {
      status: 500,
      headers: cors,
      jsonBody: { error: (err as Error).message ?? "telemetry read failed" },
    };
  }
}

app.http("getTelemetry", {
  route: "telemetry",
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: getTelemetry,
});
