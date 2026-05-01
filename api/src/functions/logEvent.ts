/**
 * POST /api/events
 *
 * Public endpoint that accepts a single telemetry event from the SPA and
 * writes it to the `telemetry` table. Intentionally NOT gated by
 * APP_ACCESS_KEY — every visitor of the unlocked app produces these. The
 * endpoint never returns the stored data; the read side
 * (`getTelemetry`) is locked behind the access key.
 *
 * Body shape (all fields optional except `kind`):
 *   { kind, user?, tenant?, sessionId?, path?, detail?, durationMs? }
 */
import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { writeEvent } from "../lib/telemetry";

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
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

interface EventBody {
  kind?: string;
  user?: string;
  tenant?: string;
  sessionId?: string;
  path?: string;
  detail?: unknown;
}

export async function logEvent(
  req: HttpRequest,
  ctx: InvocationContext,
): Promise<HttpResponseInit> {
  const cors = corsHeaders(req.headers.get("origin"));
  if (req.method === "OPTIONS") return { status: 204, headers: cors };

  let body: EventBody;
  try {
    body = (await req.json()) as EventBody;
  } catch {
    return {
      status: 400,
      headers: cors,
      jsonBody: { error: "Body must be JSON." },
    };
  }
  if (!body || typeof body.kind !== "string" || !body.kind.trim()) {
    return {
      status: 400,
      headers: cors,
      jsonBody: { error: "`kind` is required." },
    };
  }

  try {
    await writeEvent({
      kind: body.kind,
      user: body.user,
      tenant: body.tenant,
      sessionId: body.sessionId,
      path: body.path,
      detail: body.detail,
      ua: req.headers.get("user-agent") ?? "",
    });
  } catch (err) {
    ctx.error("telemetry write failed", err);
    // Do NOT fail the SPA over a logging hiccup.
    return { status: 202, headers: cors, jsonBody: { ok: false } };
  }

  return { status: 202, headers: cors, jsonBody: { ok: true } };
}

app.http("logEvent", {
  route: "events",
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: logEvent,
});
