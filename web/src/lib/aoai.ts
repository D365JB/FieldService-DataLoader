const PROXY_URL = import.meta.env.VITE_AOAI_PROXY_URL ?? "/api/generateContent";

export interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  maxCompletionTokens?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  /** When true, asks AOAI to enforce a JSON object response (skips fence-stripping, faster + safer). */
  jsonMode?: boolean;
  /** Optional AOAI deployment name. Server validates against allowlist; falls back to default when omitted. */
  model?: string;
}

export interface GenerateResult {
  content: string;
  finishReason?: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/** Calls the AOAI proxy with retry/backoff and JSON parsing. */
export async function generateContent(
  opts: GenerateOptions,
): Promise<GenerateResult> {
  // The proxy already does ~6 retries with jitter against AOAI. We add ONE
  // outer retry here to defend against transient SWA/Function blips between
  // the browser and the proxy (502/503/504), and against AOAI overload that
  // exhausted the proxy's budget. Two layers of cheap retry catch nearly all
  // multi-user contention without making angry users wait too long.
  const body = JSON.stringify({
    prompt: opts.prompt,
    systemPrompt: opts.systemPrompt,
    maxCompletionTokens: opts.maxCompletionTokens ?? 4000,
    reasoningEffort: opts.reasoningEffort ?? "low",
    jsonMode: opts.jsonMode ?? false,
    ...(opts.model ? { model: opts.model } : {}),
  });

  const transientStatuses = new Set([429, 502, 503, 504]);
  let lastErr: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    let res: Response;
    try {
      res = await fetch(PROXY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (err) {
      // Network failure (offline, DNS, etc.). Wait a moment, then try once.
      lastErr = err as Error;
      if (attempt === 0) {
        await sleep(1500 + Math.random() * 1500);
        continue;
      }
      throw lastErr;
    }

    if (res.ok) {
      return (await res.json()) as GenerateResult;
    }

    if (transientStatuses.has(res.status) && attempt === 0) {
      // Honor Retry-After when the proxy sets it on final-503 (multi-user
      // saturation). Otherwise short jittered wait.
      const retryAfter = parseInt(res.headers.get("retry-after") ?? "", 10);
      const baseWait = Number.isFinite(retryAfter)
        ? Math.min(retryAfter * 1000, 15_000)
        : 2_000;
      await sleep(baseWait + Math.random() * 1500);
      continue;
    }

    const detail = await res.text().catch(() => "");
    const friendly =
      res.status === 503
        ? "AI service is busy. Please wait a few seconds and try again."
        : res.status === 429
          ? "Too many requests right now. Please wait and retry."
          : detail || res.statusText;
    throw new Error(`AOAI proxy ${res.status}: ${friendly}`);
  }
  throw lastErr ?? new Error("AOAI proxy: unreachable");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Generates content where the model is expected to return JSON. Strips ```json fences,
 * then parses. Throws if the parse fails.
 */
export async function generateJson<T = unknown>(
  opts: GenerateOptions,
): Promise<T> {
  const result = await generateContent({
    ...opts,
    jsonMode: true,
    systemPrompt:
      (opts.systemPrompt ?? "") +
      "\n\nRespond with valid JSON only. No prose, no markdown fences.",
  });
  let text = result.content.trim();
  // Strip ``` fences if present.
  text = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    throw new Error(
      `AOAI returned non-JSON content: ${(err as Error).message}\n\n${text.slice(0, 500)}`,
    );
  }
}

/** Fetches and strips a customer URL through the SWA proxy. */
export async function fetchWebsite(url: string): Promise<{
  url: string;
  title: string;
  description: string;
  text: string;
}> {
  const normalized = /^https?:\/\//i.test(url.trim())
    ? url.trim()
    : `https://${url.trim()}`;
  const target = `/api/fetchWebsite?url=${encodeURIComponent(normalized)}`;
  // One retry on transient 502/503/504 (proxy or upstream blip). The proxy
  // also caches successful fetches per-instance so a retry that hits the
  // same instance is essentially free.
  const transient = new Set([502, 503, 504]);
  let lastDetail = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await fetch(target);
    if (res.ok) return res.json();
    lastDetail = await res.text().catch(() => "");
    if (transient.has(res.status) && attempt === 0) {
      await sleep(1500 + Math.random() * 1500);
      continue;
    }
    throw new Error(
      `fetchWebsite ${res.status}: ${lastDetail || res.statusText}`,
    );
  }
  throw new Error(`fetchWebsite failed: ${lastDetail}`);
}

/** Returns the list of AOAI deployments the client may select. */
export async function listModels(): Promise<{
  models: string[];
  default: string;
}> {
  const res = await fetch("/api/models");
  if (!res.ok) {
    throw new Error(`listModels ${res.status}: ${await res.text().catch(() => "")}`);
  }
  return (await res.json()) as { models: string[]; default: string };
}
