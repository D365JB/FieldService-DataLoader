import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";

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
    "Access-Control-Allow-Headers": "Content-Type",
    Vary: "Origin",
  };
}

const MAX_BYTES = 1024 * 1024; // 1 MB cap on logo size
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/svg+xml",
  "image/webp",
  "image/x-icon",
  "image/vnd.microsoft.icon",
]);

export async function fetchImage(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);
  if (req.method === "OPTIONS") return { status: 204, headers: cors };

  const url = req.query.get("url");
  if (!url) {
    return { status: 400, headers: cors, jsonBody: { error: "Missing url" } };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 400, headers: cors, jsonBody: { error: "Invalid URL" } };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { status: 400, headers: cors, jsonBody: { error: "http/https only" } };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    ["localhost", "127.0.0.1", "0.0.0.0", "::1", "169.254.169.254"].includes(host) ||
    host.endsWith(".local") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
  ) {
    return { status: 403, headers: cors, jsonBody: { error: "Host not allowed" } };
  }

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "FS-Data-Studio/1.0 (+image-proxy)" },
      redirect: "follow",
      signal: ac.signal,
    });
    clearTimeout(timer);
    if (!res.ok) {
      return {
        status: res.status,
        headers: cors,
        jsonBody: { error: `Upstream ${res.status}` },
      };
    }
    const ctype = (res.headers.get("content-type") ?? "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!ALLOWED_TYPES.has(ctype)) {
      return {
        status: 415,
        headers: cors,
        jsonBody: { error: `Unsupported content-type: ${ctype}` },
      };
    }
    const reader = res.body?.getReader();
    if (!reader) {
      return { status: 502, headers: cors, jsonBody: { error: "No body" } };
    }
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (total < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
    reader.cancel().catch(() => {});
    const buf = Buffer.concat(chunks.map((c) => Buffer.from(c)));
    const base64 = buf.toString("base64");
    return {
      status: 200,
      headers: cors,
      jsonBody: {
        contentType: ctype,
        bytes: buf.byteLength,
        base64,
      },
    };
  } catch (err) {
    context.error("fetchImage failed", err);
    return {
      status: 502,
      headers: cors,
      jsonBody: { error: `Fetch failed: ${(err as Error).message}` },
    };
  }
}

app.http("fetchImage", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: fetchImage,
});
