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

const MAX_BYTES = 256 * 1024; // 256 KB cap on remote pages

export async function fetchWebsite(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return { status: 204, headers: cors };

  const url = req.query.get("url");
  if (!url) {
    return {
      status: 400,
      headers: cors,
      jsonBody: { error: "Missing required query parameter: url" },
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return {
      status: 400,
      headers: cors,
      jsonBody: { error: "Invalid URL" },
    };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      status: 400,
      headers: cors,
      jsonBody: { error: "Only http/https URLs are allowed" },
    };
  }

  // Block obvious SSRF targets — private/loopback/link-local hosts.
  const host = parsed.hostname.toLowerCase();
  const blocked = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "169.254.169.254", // IMDS
    "metadata.google.internal",
  ];
  if (
    blocked.includes(host) ||
    host.endsWith(".local") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
  ) {
    return {
      status: 403,
      headers: cors,
      jsonBody: { error: "Host is not allowed" },
    };
  }

  try {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), 10_000);
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "FS-Data-Studio/1.0 (+branding-extract)" },
      redirect: "follow",
      signal: ac.signal,
    });
    clearTimeout(timer);

    if (!res.ok) {
      return {
        status: res.status,
        headers: cors,
        jsonBody: { error: `Upstream returned ${res.status}` },
      };
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return {
        status: 502,
        headers: cors,
        jsonBody: { error: "No response body" },
      };
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

    const html = new TextDecoder("utf-8", { fatal: false }).decode(
      Buffer.concat(chunks.map((c) => Buffer.from(c))),
    );

    // Extract just title + meta description + first ~3KB of visible text — enough for AI to reason about.
    const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
    const description =
      html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)?.[1]?.trim() ?? "";
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 3000);

    return {
      status: 200,
      headers: cors,
      jsonBody: { url: parsed.toString(), title, description, text: stripped },
    };
  } catch (err) {
    context.error("fetchWebsite failed", err);
    return {
      status: 502,
      headers: cors,
      jsonBody: { error: `Fetch failed: ${(err as Error).message}` },
    };
  }
}

app.http("fetchWebsite", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: fetchWebsite,
});
