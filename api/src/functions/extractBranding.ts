import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
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

const MAX_BYTES = 512 * 1024;

interface BrandingResult {
  url: string;
  companyName: string;
  description: string;
  logoUrl: string | null;
  themeColor: string | null;
  candidateImages: string[];
  candidateColors: string[];
}

function abs(base: URL, href: string): string | null {
  try {
    return new URL(href, base).toString();
  } catch {
    return null;
  }
}

/** Pull all attribute values for a given attr in matching <link>/<meta>/<img> tags. */
function findAll(
  html: string,
  re: RegExp,
): Array<Record<string, string>> {
  const out: Array<Record<string, string>> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const tag = m[0];
    const attrs: Record<string, string> = {};
    const attrRe = /(\w[\w-]*)\s*=\s*["']([^"']*)["']/g;
    let am: RegExpExecArray | null;
    while ((am = attrRe.exec(tag)) !== null) {
      attrs[am[1].toLowerCase()] = am[2];
    }
    out.push(attrs);
  }
  return out;
}

function extractBrandingFromHtml(html: string, base: URL): Omit<BrandingResult, "url"> {
  // Title / company name
  const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
  const ogSiteName = findAll(html, /<meta[^>]+>/gi).find(
    (a) => a.property === "og:site_name",
  )?.content;
  const companyName = (ogSiteName || title.split(/[|\-—–·]/)[0] || base.hostname).trim();

  const description =
    findAll(html, /<meta[^>]+>/gi).find(
      (a) => a.name === "description" || a.property === "og:description",
    )?.content ?? "";

  // Theme color from meta tag
  const metas = findAll(html, /<meta[^>]+>/gi);
  const themeColorMeta = metas.find((m) => m.name === "theme-color");
  const themeColor = themeColorMeta?.content?.trim() ?? null;

  // Candidate logos: og:image, apple-touch-icon, link rel=icon (largest sizes), <img> with logo in src/alt/class
  const candidates: string[] = [];

  const ogImage = metas.find(
    (m) => m.property === "og:image" || m.property === "og:image:secure_url",
  )?.content;
  if (ogImage) {
    const a = abs(base, ogImage);
    if (a) candidates.push(a);
  }

  const links = findAll(html, /<link[^>]+>/gi);
  // Apple touch icons (often the cleanest square logo)
  for (const l of links) {
    if (
      (l.rel || "").toLowerCase().includes("apple-touch-icon") &&
      l.href
    ) {
      const a = abs(base, l.href);
      if (a) candidates.push(a);
    }
  }
  // Standard icons
  for (const l of links) {
    const rel = (l.rel || "").toLowerCase();
    if (
      (rel === "icon" || rel === "shortcut icon" || rel === "mask-icon") &&
      l.href
    ) {
      const a = abs(base, l.href);
      if (a) candidates.push(a);
    }
  }
  // <img> tags with "logo" in attributes
  const imgs = findAll(html, /<img[^>]+>/gi);
  for (const i of imgs) {
    const src = i.src || i["data-src"];
    if (!src) continue;
    const haystack = `${i.alt || ""} ${i.class || ""} ${i.id || ""} ${src}`.toLowerCase();
    if (haystack.includes("logo")) {
      const a = abs(base, src);
      if (a) candidates.push(a);
    }
  }

  // Dedup, prefer in order
  const seen = new Set<string>();
  const candidateImages = candidates.filter((c) => {
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
  const logoUrl = candidateImages[0] ?? null;

  // Candidate colors: scrape inline <style> + style="" for hex codes; rank by frequency.
  const styles: string[] = [];
  const styleBlocks = html.match(/<style[\s\S]*?<\/style>/gi) ?? [];
  for (const sb of styleBlocks) styles.push(sb);
  const inlineStyles = html.match(/style=["'][^"']*["']/gi) ?? [];
  for (const s of inlineStyles) styles.push(s);
  const colorCounts = new Map<string, number>();
  const hexRe = /#([0-9a-f]{6}|[0-9a-f]{3})\b/gi;
  for (const s of styles) {
    const matches = s.match(hexRe) ?? [];
    for (let c of matches) {
      c = c.toLowerCase();
      if (c.length === 4) {
        c = "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
      }
      // Skip pure black / white / transparent-ish neutrals that dominate every site
      if (
        c === "#000000" ||
        c === "#ffffff" ||
        c === "#fefefe" ||
        c === "#f0f0f0" ||
        c === "#cccccc"
      ) {
        continue;
      }
      colorCounts.set(c, (colorCounts.get(c) ?? 0) + 1);
    }
  }
  const candidateColors = [...colorCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([c]) => c);

  return {
    companyName,
    description,
    logoUrl,
    themeColor,
    candidateImages,
    candidateColors,
  };
}

export async function extractBranding(
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
    return { status: 400, headers: cors, jsonBody: { error: "Invalid URL" } };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      status: 400,
      headers: cors,
      jsonBody: { error: "Only http/https URLs are allowed" },
    };
  }

  const host = parsed.hostname.toLowerCase();
  const blocked = [
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "169.254.169.254",
    "metadata.google.internal",
  ];
  if (
    blocked.includes(host) ||
    host.endsWith(".local") ||
    host.startsWith("10.") ||
    host.startsWith("192.168.") ||
    /^172\.(1[6-9]|2[0-9]|3[01])\./.test(host)
  ) {
    return { status: 403, headers: cors, jsonBody: { error: "Host is not allowed" } };
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
      return { status: 502, headers: cors, jsonBody: { error: "No response body" } };
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

    const branding = extractBrandingFromHtml(html, parsed);
    const result: BrandingResult = {
      url: parsed.toString(),
      ...branding,
    };
    return { status: 200, headers: cors, jsonBody: result };
  } catch (err) {
    context.error(`extractBranding failed [s=${req.headers.get("x-fsdl-session") ?? "anon"}]`, err);
    return {
      status: 502,
      headers: cors,
      jsonBody: { error: `Fetch failed: ${(err as Error).message}` },
    };
  }
}

app.http("extractBranding", {
  methods: ["GET", "OPTIONS"],
  authLevel: "anonymous",
  handler: extractBranding,
});
