import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";
import { requireAppKey } from "../lib/requireAppKey";
import { sessionTag } from "../lib/session";

interface GenerateRequest {
  prompt: string;
  maxCompletionTokens?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  systemPrompt?: string;
  jsonMode?: boolean;
  /** Optional AOAI deployment name. Must be in AOAI_ALLOWED_DEPLOYMENTS. */
  model?: string;
}

interface GenerateResponse {
  content: string;
  finishReason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

const AOAI_ENDPOINT = process.env.AOAI_ENDPOINT ?? "";
const AOAI_DEPLOYMENT = process.env.AOAI_DEPLOYMENT ?? "gpt-4o-mini";
const AOAI_API_KEY = process.env.AOAI_API_KEY;
const AOAI_API_VERSION = process.env.AOAI_API_VERSION ?? "2024-10-21";
// Allowlist of deployments the client may select via the `model` field.
// Defaults to just the primary deployment so unconfigured environments fail
// closed. Set AOAI_ALLOWED_DEPLOYMENTS=gpt-4o-mini,gpt-5-mini to expose both.
const AOAI_ALLOWED_DEPLOYMENTS = (process.env.AOAI_ALLOWED_DEPLOYMENTS ?? AOAI_DEPLOYMENT)
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let cachedCredential: DefaultAzureCredential | null = null;
function getCredential(): DefaultAzureCredential {
  if (!cachedCredential) cachedCredential = new DefaultAzureCredential();
  return cachedCredential;
}

/**
 * v1.44.0 — per-instance concurrency limiter.
 *
 * AOAI deployments have a TPM cap. When a single Function instance processes
 * many simultaneous requests (e.g. one user clicks Analyze while another
 * runs Brand extract), the parallel calls all share the same TPM budget and
 * compete for it via 429s. A tiny in-process semaphore caps how many we
 * fire at AOAI concurrently and queues the rest with a fair FIFO wait, so
 * the long tail of latency comes from waiting in our queue (cheap, no AOAI
 * billing) instead of 429-retry storms (expensive, blows up Retry-After).
 *
 * Limit chosen to roughly match the always-ready=1 worker's typical
 * concurrency. Override with AOAI_MAX_CONCURRENCY env var (no restart
 * required at the platform level — Flex picks it up on instance recycle).
 */
const AOAI_MAX_CONCURRENCY = Math.max(
  1,
  parseInt(process.env.AOAI_MAX_CONCURRENCY ?? "4", 10) || 4,
);
let aoaiInFlight = 0;
const aoaiQueue: Array<() => void> = [];

async function withAoaiSlot<T>(fn: () => Promise<T>): Promise<{
  result: T;
  queuedMs: number;
}> {
  const queuedAt = Date.now();
  if (aoaiInFlight >= AOAI_MAX_CONCURRENCY) {
    await new Promise<void>((resolve) => aoaiQueue.push(resolve));
  }
  const queuedMs = Date.now() - queuedAt;
  aoaiInFlight++;
  try {
    const result = await fn();
    return { result, queuedMs };
  } finally {
    aoaiInFlight--;
    const next = aoaiQueue.shift();
    if (next) next();
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  // Echo origin only when it's in the allowlist; otherwise no CORS header.
  const allowed =
    origin && ALLOWED_ORIGINS.length > 0 && ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0] ?? "*";
  return {
    "Access-Control-Allow-Origin": allowed,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, x-app-key, x-fsdl-session",
    Vary: "Origin",
  };
}

async function getAuthHeader(): Promise<Record<string, string>> {
  if (AOAI_API_KEY && AOAI_API_KEY !== "set-in-azure-portal-only") {
    return { "api-key": AOAI_API_KEY };
  }
  const token = await getCredential().getToken(
    "https://cognitiveservices.azure.com/.default",
  );
  if (!token) throw new Error("Failed to acquire managed identity token");
  return { Authorization: `Bearer ${token.token}` };
}

export async function generateContent(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") {
    return { status: 204, headers: cors };
  }

  const gate = requireAppKey(req, cors);
  if (gate) return gate;

  if (!AOAI_ENDPOINT) {
    return {
      status: 503,
      headers: cors,
      jsonBody: {
        error:
          "AI service is not configured (AOAI_ENDPOINT missing). Set Function App setting AOAI_ENDPOINT to your Azure OpenAI account endpoint.",
      },
    };
  }

  let body: GenerateRequest;
  try {
    body = (await req.json()) as GenerateRequest;
  } catch {
    return {
      status: 400,
      headers: cors,
      jsonBody: { error: "Invalid JSON body" },
    };
  }

  if (!body.prompt || typeof body.prompt !== "string") {
    return {
      status: 400,
      headers: cors,
      jsonBody: { error: "Missing required field: prompt" },
    };
  }

  // Cap total input size to protect the function instance from a runaway
  // client. 200 KB of input is well above any legitimate prompt we send.
  const inputSize =
    body.prompt.length + (body.systemPrompt?.length ?? 0);
  if (inputSize > 200_000) {
    return {
      status: 413,
      headers: cors,
      jsonBody: {
        error: `Input too large (${inputSize} chars > 200,000 limit)`,
      },
    };
  }

  const maxTokens = Math.min(Math.max(body.maxCompletionTokens ?? 4000, 100), 16000);
  const reasoning = body.reasoningEffort ?? "low";

  // Resolve deployment: client-selected (validated against allowlist) or default.
  let deployment = AOAI_DEPLOYMENT;
  if (body.model) {
    if (!AOAI_ALLOWED_DEPLOYMENTS.includes(body.model)) {
      return {
        status: 400,
        headers: cors,
        jsonBody: {
          error: `Model '${body.model}' is not allowed. Allowed: ${AOAI_ALLOWED_DEPLOYMENTS.join(", ")}`,
        },
      };
    }
    deployment = body.model;
  }

  const url = `${AOAI_ENDPOINT.replace(/\/+$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=${AOAI_API_VERSION}`;
  const messages = [
    ...(body.systemPrompt
      ? [{ role: "system", content: body.systemPrompt }]
      : []),
    { role: "user", content: body.prompt },
  ];

  const aoaiBody: Record<string, unknown> = {
    messages,
    max_completion_tokens: maxTokens,
  };
  // gpt-5* family supports `reasoning_effort`; older models will reject it.
  if (deployment.startsWith("gpt-5") || deployment.startsWith("o")) {
    aoaiBody.reasoning_effort = reasoning;
  }
  // JSON mode: make the model emit a single valid JSON object — skips client-side
  // fence-stripping retries and lets the decoder stop earlier.
  if (body.jsonMode) {
    aoaiBody.response_format = { type: "json_object" };
  }

  let auth: Record<string, string>;
  try {
    auth = await getAuthHeader();
  } catch (err) {
    context.error(`Auth failed${sessionTag(req)}`, err);
    return {
      status: 500,
      headers: cors,
      jsonBody: { error: "Failed to authenticate to AOAI" },
    };
  }

  // Retry on 429/5xx with backoff. Multi-user notes:
  //   - Honor `Retry-After` from AOAI when present — under load, the server
  //     knows the right wait better than our fixed exponential.
  //   - Add jitter so 50 simultaneous 429s don't all retry at the exact
  //     same instant ("thundering herd").
  //   - Hard request timeout per-attempt via AbortController so a single
  //     hung connection can't tie up an instance for the full 230s SWA limit.
  //   - Surface `Retry-After` to the client on final failure so the UI can
  //     pause before re-prompting.
  //   - v1.44.0: gate the whole retry loop behind a per-instance semaphore so
  //     parallel users queue locally instead of competing for the AOAI TPM
  //     budget via 429-retry storms.
  const sTag = sessionTag(req);
  const slot = await withAoaiSlot(async () => {
  const maxAttempts = 6;
  const perAttemptTimeoutMs = 110_000;
  let lastError = "";
  let lastRetryAfterSec = 0;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), perAttemptTimeoutMs);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(aoaiBody),
        signal: ac.signal,
      });

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastError = `${res.status} ${res.statusText}`;
        const retryAfterRaw = res.headers.get("retry-after");
        const retryAfterSec = retryAfterRaw ? parseInt(retryAfterRaw, 10) : NaN;
        // Drain body so the connection can be reused.
        await res.text().catch(() => {});
        if (Number.isFinite(retryAfterSec)) lastRetryAfterSec = retryAfterSec;
        // Base = honor Retry-After up to 30s, otherwise exponential capped at 16s.
        const base =
          Number.isFinite(retryAfterSec) && retryAfterSec > 0
            ? Math.min(retryAfterSec * 1000, 30_000)
            : Math.min(2 ** attempt * 1000, 16_000);
        // Full jitter — wait randomly in [base/2, base].
        const wait = Math.floor(base / 2 + Math.random() * (base / 2));
        context.warn(
          `AOAI ${res.status}, retry ${attempt + 1}/${maxAttempts} in ${wait}ms${
            Number.isFinite(retryAfterSec) ? ` (Retry-After=${retryAfterSec}s)` : ""
          }${sTag}`,
        );
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }

      if (!res.ok) {
        const text = await res.text();
        return {
          status: res.status,
          headers: cors,
          jsonBody: { error: `AOAI error: ${res.status}`, detail: text },
        };
      }

      const json = (await res.json()) as {
        choices?: Array<{
          message?: { content?: string };
          finish_reason?: string;
        }>;
        usage?: GenerateResponse["usage"];
      };
      const choice = json.choices?.[0];
      const response: GenerateResponse = {
        content: choice?.message?.content ?? "",
        finishReason: choice?.finish_reason,
        usage: json.usage,
      };
      return { status: 200, headers: cors, jsonBody: response };
    } catch (err) {
      const isAbort = (err as Error).name === "AbortError";
      lastError = isAbort
        ? `request aborted after ${perAttemptTimeoutMs / 1000}s`
        : (err as Error).message;
      const wait = Math.min(2 ** attempt * 1000, 16_000);
      const jittered = Math.floor(wait / 2 + Math.random() * (wait / 2));
      context.warn(
        `AOAI fetch error, retry ${attempt + 1}/${maxAttempts} in ${jittered}ms: ${lastError}${sTag}`,
      );
      await new Promise((r) => setTimeout(r, jittered));
    } finally {
      clearTimeout(timer);
    }
  }

  // Surface Retry-After so the client can show a friendly "high load, please
  // wait" message instead of immediately retrying.
  const retryHeaders =
    lastRetryAfterSec > 0
      ? { ...cors, "Retry-After": String(lastRetryAfterSec) }
      : cors;
  return {
    status: 503,
    headers: retryHeaders,
    jsonBody: {
      error: `AOAI unavailable after ${maxAttempts} attempts`,
      detail: lastError,
      retryAfterSec: lastRetryAfterSec || undefined,
    },
  };
  });
  if (slot.queuedMs > 250) {
    context.log(
      `AOAI slot waited ${slot.queuedMs}ms (in-flight cap=${AOAI_MAX_CONCURRENCY})${sTag}`,
    );
  }
  return slot.result;
}

app.http("generateContent", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: generateContent,
});
