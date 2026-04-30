const PROXY_URL = import.meta.env.VITE_AOAI_PROXY_URL ?? "/api/generateContent";

export interface GenerateOptions {
  prompt: string;
  systemPrompt?: string;
  maxCompletionTokens?: number;
  reasoningEffort?: "low" | "medium" | "high";
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
  const res = await fetch(PROXY_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: opts.prompt,
      systemPrompt: opts.systemPrompt,
      maxCompletionTokens: opts.maxCompletionTokens ?? 4000,
      reasoningEffort: opts.reasoningEffort ?? "low",
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`AOAI proxy ${res.status}: ${detail || res.statusText}`);
  }
  return (await res.json()) as GenerateResult;
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
  const res = await fetch(`/api/fetchWebsite?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`fetchWebsite ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}
