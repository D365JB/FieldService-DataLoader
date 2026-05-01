import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { DefaultAzureCredential } from "@azure/identity";

interface GenerateRequest {
  prompt: string;
  maxCompletionTokens?: number;
  reasoningEffort?: "minimal" | "low" | "medium" | "high";
  systemPrompt?: string;
  jsonMode?: boolean;
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
const AOAI_DEPLOYMENT = process.env.AOAI_DEPLOYMENT ?? "gpt-5-mini";
const AOAI_API_KEY = process.env.AOAI_API_KEY;
const AOAI_API_VERSION = process.env.AOAI_API_VERSION ?? "2024-10-21";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

let cachedCredential: DefaultAzureCredential | null = null;
function getCredential(): DefaultAzureCredential {
  if (!cachedCredential) cachedCredential = new DefaultAzureCredential();
  return cachedCredential;
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
    "Access-Control-Allow-Headers": "Content-Type",
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

  if (!AOAI_ENDPOINT) {
    return {
      status: 500,
      headers: cors,
      jsonBody: { error: "AOAI_ENDPOINT not configured" },
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

  const maxTokens = Math.min(Math.max(body.maxCompletionTokens ?? 4000, 100), 16000);
  const reasoning = body.reasoningEffort ?? "low";

  const url = `${AOAI_ENDPOINT.replace(/\/+$/, "")}/openai/deployments/${AOAI_DEPLOYMENT}/chat/completions?api-version=${AOAI_API_VERSION}`;
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
  if (AOAI_DEPLOYMENT.startsWith("gpt-5") || AOAI_DEPLOYMENT.startsWith("o")) {
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
    context.error("Auth failed", err);
    return {
      status: 500,
      headers: cors,
      jsonBody: { error: "Failed to authenticate to AOAI" },
    };
  }

  // Retry on 429/5xx with exponential backoff (matches reference behavior).
  const maxAttempts = 5;
  let lastError = "";
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...auth },
        body: JSON.stringify(aoaiBody),
      });

      if (res.status === 429 || (res.status >= 500 && res.status < 600)) {
        lastError = `${res.status} ${res.statusText}`;
        const wait = Math.min(2 ** attempt * 1000, 16000);
        context.warn(
          `AOAI ${res.status}, retry ${attempt + 1}/${maxAttempts} in ${wait}ms`,
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
      lastError = (err as Error).message;
      const wait = Math.min(2 ** attempt * 1000, 16000);
      context.warn(`AOAI fetch error, retry in ${wait}ms: ${lastError}`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }

  return {
    status: 502,
    headers: cors,
    jsonBody: { error: `AOAI unavailable after ${maxAttempts} attempts`, detail: lastError },
  };
}

app.http("generateContent", {
  methods: ["POST", "OPTIONS"],
  authLevel: "anonymous",
  handler: generateContent,
});
