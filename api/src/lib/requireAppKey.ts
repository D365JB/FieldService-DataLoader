import type { HttpRequest, HttpResponseInit } from "@azure/functions";

/**
 * Tenant-free shared-secret gate.
 *
 * Every public-facing function reads the `APP_ACCESS_KEY` env setting and
 * requires the client to send a matching `x-app-key` header. If the key is
 * unconfigured the function fails closed (500) — we never want to silently
 * publish an open AOAI/web-fetch proxy. Comparison is constant-time to
 * defend against timing leaks.
 *
 * This is deliberately simpler than Entra: every demo tenant uses different
 * sign-ins, but only the operator should be able to invoke the proxy. A
 * single shared secret stored in App Settings (and pasted into the SPA on
 * first launch) gives us that without any tenant assumptions.
 *
 * Returns `null` if the key is valid (or this is a CORS preflight); returns
 * an HttpResponseInit (401/500) the caller should immediately return.
 */
export function requireAppKey(
  req: HttpRequest,
  cors: Record<string, string>,
): HttpResponseInit | null {
  if (req.method === "OPTIONS") return null;
  const expected = process.env.APP_ACCESS_KEY ?? "";
  if (!expected) {
    return {
      status: 500,
      headers: cors,
      jsonBody: {
        error:
          "APP_ACCESS_KEY is not configured on the function. The proxy is locked until an access key is set.",
      },
    };
  }
  const provided = req.headers.get("x-app-key") ?? "";
  if (!constantTimeEquals(provided, expected)) {
    return {
      status: 401,
      headers: cors,
      jsonBody: { error: "Missing or invalid app access key." },
    };
  }
  return null;
}

function constantTimeEquals(a: string, b: string): boolean {
  // Reject empty up front so we don't leak that "no key" === "no key".
  if (!a || !b) return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
