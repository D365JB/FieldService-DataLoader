import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { TtlCache } from "../lib/cache";
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
    "Access-Control-Allow-Headers": "Content-Type, x-app-key, x-fsdl-session",
    Vary: "Origin",
  };
}

const MAX_BYTES = 256 * 1024; // 256 KB cap on remote pages
const FETCH_TIMEOUT_MS = 15_000; // upstream sites under load can be slow

interface ParsedSite {
  url: string;
  title: string;
  description: string;
  text: string;
}

// Per-instance cache. During a multi-attendee demo, the first analyze of a
// given URL does the upstream work; everyone else gets the parsed result
// instantly. 10-minute TTL is short enough to pick up updated demo sites.
const siteCache = new TtlCache<ParsedSite>(10 * 60 * 1000, 100);

export async function fetchWebsite(
  req: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const origin = req.headers.get("origin");
  const cors = corsHeaders(origin);

  if (req.method === "OPTIONS") return { status: 204, headers: cors };

  const gate = requireAppKey(req, cors);
  if (gate) return gate;

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
    const cacheKey = parsed.toString();
    const cached = siteCache.get(cacheKey);
    if (cached) {
      return { status: 200, headers: cors, jsonBody: cached };
    }
    const result = await siteCache.coalesce(cacheKey, () =>
      fetchAndParse(parsed),
    );
    siteCache.set(cacheKey, result);
    return { status: 200, headers: cors, jsonBody: result };
  } catch (err) {
    context.error(`fetchWebsite failed [s=${req.headers.get("x-fsdl-session") ?? "anon"}]`, err);
    const isAbort = (err as Error)?.name === "AbortError";
    return {
      status: isAbort ? 504 : 502,
      headers: cors,
      jsonBody: {
        error: isAbort
          ? `Upstream timeout after ${FETCH_TIMEOUT_MS / 1000}s`
          : `Fetch failed: ${(err as Error).message}`,
      },
    };
  }
}

/** Fetch + parse a remote page. Caller handles caching/coalescing. */
async function fetchAndParse(parsed: URL): Promise<ParsedSite> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(parsed.toString(), {
      headers: { "User-Agent": "FS-Data-Studio/1.0 (+branding-extract)" },
      redirect: "follow",
      signal: ac.signal,
    });

    if (!res.ok) {
      throw new Error(`Upstream returned ${res.status}`);
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error("No response body");
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

    const title =
      html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
    const description =
      html
        .match(
          /<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i,
        )?.[1]
        ?.trim() ?? "";
    // v1.42.8 — was 3,000. Many marketing/product pages put the
    // industry-defining text well past the first ~500 words, so the
    // vertical classifier was making guesses off boilerplate hero
    // copy and navigation links. 15,000 chars ≈ 4–5K tokens, which
    // is comfortably inside the generateContent 200K cap and still
    // small enough for gpt-5-mini to chew through quickly.
    const stripped = html
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 15000);

    return { url: parsed.toString(), title, description, text: stripped };
  } finally {
    clearTimeout(timer);
  }
}

app.http("fetchWebsite", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: fetchWebsite,
});
