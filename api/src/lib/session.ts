/**
 * v1.44.0 — small helpers shared across HTTP functions.
 *
 * `sessionTag(req)` returns a short `[s=<id>]` suffix you can append to
 * `context.log` / `context.warn` calls so every backend log line can be
 * cross-referenced with the browser tab that produced it. App Insights
 * stores `traces.message` as a queryable column so this is enough to pivot
 * on a single user's session without a custom dimensions setup.
 *
 *   `traces | where message contains "[s=abc-123]"`
 */
import type { HttpRequest } from "@azure/functions";

export function sessionId(req: HttpRequest): string {
  return req.headers.get("x-fsdl-session") ?? "anon";
}

export function sessionTag(req: HttpRequest): string {
  return ` [s=${sessionId(req)}]`;
}
