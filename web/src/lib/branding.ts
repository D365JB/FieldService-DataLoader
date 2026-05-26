import { DataverseClient } from "@/lib/dataverse";
import { apiFetch } from "@/lib/appKey";

export interface BrandingResult {
  url: string;
  companyName: string;
  description: string;
  logoUrl: string | null;
  themeColor: string | null;
  candidateImages: string[];
  candidateColors: string[];
}

export interface BrandColors {
  navbarBackground: string;
  navbarShelf: string;
  main: string;
  accent: string;
  pageBackground: string;
  globalLink: string;
  headerColor: string;
  controlBorder: string;
  controlShade: string;
  defaultEntity: string;
  defaultCustomEntity: string;
  processControl: string;
  hoverLink: string;
  selectedLink: string;
}

/** Detect company branding from a website URL via the API. */
export async function extractBranding(url: string): Promise<BrandingResult> {
  const normalized = /^https?:\/\//i.test(url.trim())
    ? url.trim()
    : `https://${url.trim()}`;
  const target = `/api/extractBranding?url=${encodeURIComponent(normalized)}`;
  // v1.42.7 — match the v1.42.4 fetchWebsite retry pattern. The SWA
  // managed-API proxy converts Function App cold-start 503s into a
  // generic 500 "Backend call failure"; retrying across transient 5xx
  // codes covers the cold-start window. Always-ready=1 (also v1.42.7)
  // makes this rare in practice but the retry is cheap insurance.
  const transient = new Set([500, 502, 503, 504]);
  let lastDetail = "";
  let lastStatus = 0;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await apiFetch(target);
    if (res.ok) return res.json();
    lastStatus = res.status;
    lastDetail = await res.text().catch(() => "");
    if (transient.has(res.status) && attempt < 2) {
      await new Promise((r) =>
        setTimeout(r, (attempt + 1) * 1500 + Math.random() * 1500),
      );
      continue;
    }
    break;
  }
  if (transient.has(lastStatus)) {
    throw new Error(
      "The branding detector is temporarily unavailable. Please try again in a moment, or click Skip & customize manually below.",
    );
  }
  throw new Error(
    `extractBranding ${lastStatus}: ${lastDetail || "request failed"}`,
  );
}

/** Download image bytes via the proxy (for webresource upload). */
export async function fetchImageBytes(url: string): Promise<{
  contentType: string;
  bytes: number;
  base64: string;
}> {
  const target = `/api/fetchImage?url=${encodeURIComponent(url)}`;
  const transient = new Set([429, 500, 502, 503, 504]);
  let lastStatus = 0;
  let lastDetail = "";

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await apiFetch(target);
    if (res.ok) return res.json();
    lastStatus = res.status;
    lastDetail = await res.text().catch(() => "");
    if (transient.has(res.status) && attempt < 2) {
      await new Promise((r) =>
        setTimeout(r, (attempt + 1) * 1200 + Math.random() * 1000),
      );
      continue;
    }
    break;
  }

  if (transient.has(lastStatus)) {
    throw new Error(
      "Logo service is temporarily unavailable. Please retry, or continue with colors only.",
    );
  }
  throw new Error(`fetchImage ${lastStatus}: ${lastDetail || "request failed"}`);
}

/**
 * Downscale a raster logo so its base64 payload comfortably fits inside
 * Dataverse's webresource `content` size budget. The model-driven app
 * navbar renders the logo at roughly 24px tall, so 256×256 is plenty.
 *
 * Strategy:
 *   - SVG / ICO: returned unchanged (vector / already tiny).
 *   - Raster ≤ MAX_BASE64_BYTES (~ 350 KB): returned unchanged.
 *   - Otherwise: load into <img>, draw onto canvas at max 256px on the
 *     long edge, re-encode as PNG, return base64 (data-URL prefix
 *     stripped). Falls back to the original on any failure so the
 *     apply step still has *something* to upload.
 *
 * Why ~350 KB: Dataverse will accept larger but the cross-region POST
 * latency past ~ 1 MB starts losing CORS preflight races on slow links,
 * surfacing as `TypeError: Failed to fetch`.
 */
const MAX_BASE64_BYTES = 350 * 1024;

export async function downscaleLogo(
  logo: { contentType: string; base64: string; fileName: string },
): Promise<{ contentType: string; base64: string; fileName: string }> {
  const ct = logo.contentType.toLowerCase();
  if (ct.includes("svg") || ct.includes("icon") || ct.includes("ico")) {
    return logo;
  }
  if (logo.base64.length <= MAX_BASE64_BYTES) {
    return logo;
  }

  try {
    const dataUrl = `data:${logo.contentType};base64,${logo.base64}`;
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("image decode failed"));
      el.src = dataUrl;
    });
    const MAX = 256;
    const scale = Math.min(1, MAX / Math.max(img.width, img.height));
    const w = Math.max(1, Math.round(img.width * scale));
    const h = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return logo;
    ctx.drawImage(img, 0, 0, w, h);
    const reduced = canvas.toDataURL("image/png");
    const b64 = reduced.split(",", 2)[1] ?? "";
    if (!b64) return logo;
    const baseName = logo.fileName.replace(/\.[a-z0-9]+$/i, "");
    return {
      contentType: "image/png",
      base64: b64,
      fileName: `${baseName}.png`,
    };
  } catch {
    return logo;
  }
}

/** Sensible defaults for a D365 theme given a single primary brand color. */
export function deriveColors(primary: string, accent?: string): BrandColors {
  const p = normalizeHex(primary);
  const a = accent ? normalizeHex(accent) : shiftLightness(p, 12);
  return {
    navbarBackground: p,
    navbarShelf: shiftLightness(p, -8),
    main: p,
    accent: a,
    pageBackground: "#FFFFFF",
    globalLink: p,
    headerColor: shiftLightness(p, -15),
    controlBorder: "#C8C8C8",
    controlShade: "#F3F3F3",
    defaultEntity: p,
    defaultCustomEntity: a,
    processControl: p,
    hoverLink: shiftLightness(p, 10),
    selectedLink: shiftLightness(p, -10),
  };
}

function normalizeHex(c: string): string {
  let s = (c || "").trim();
  if (!s.startsWith("#")) s = "#" + s;
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    s = "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3];
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(s)) return "#0078D4";
  return s.toUpperCase();
}

function shiftLightness(hex: string, deltaPct: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const adjust = (v: number) => {
    const nv = Math.max(0, Math.min(255, Math.round(v + (deltaPct / 100) * 255)));
    return nv;
  };
  return (
    "#" +
    [adjust(r), adjust(g), adjust(b)]
      .map((n) => n.toString(16).padStart(2, "0"))
      .join("")
      .toUpperCase()
  );
}

interface ApplyThemeArgs {
  client: DataverseClient;
  themeName: string;
  colors: BrandColors;
  logo?: { contentType: string; base64: string; fileName: string } | null;
  /** Called with status messages for UI updates. */
  onStatus?: (msg: string) => void;
}

interface ThemeRecord {
  themeid: string;
  name: string;
  type: boolean;
  isdefaulttheme: boolean;
}

/**
 * Creates (or updates) a D365 theme matching themeName, optionally uploads the
 * logo as a web resource, then publishes the theme as default.
 */
export async function applyTheme({
  client,
  themeName,
  colors,
  logo,
  onStatus,
}: ApplyThemeArgs): Promise<{
  themeId: string;
  webResourceId?: string;
  logoLinked: boolean;
  logoLinkDiag?: string;
}> {
  // 1) Optional: upload logo as web resource.
  let webResourceId: string | undefined;
  if (logo) {
    const sizeKb = Math.round(logo.base64.length / 1024);
    onStatus?.(`Uploading logo as web resource (${sizeKb} KB)…`);
    try {
      webResourceId = await upsertLogoWebResource(client, themeName, logo);
    } catch (err) {
      const msg = (err as Error).message ?? String(err);
      const hint = /failed to fetch|network error/i.test(msg)
        ? ` — this usually means the logo (${sizeKb} KB) was too large for Dataverse to accept in a single request, or your Dataverse session timed out. Try a smaller / different logo, or uncheck "Include logo" and re-apply.`
        : "";
      throw new Error(`Logo upload failed: ${msg}${hint}`);
    }
    onStatus?.("Publishing web resource…");
    try {
      await publishWebResource(client, webResourceId);
    } catch (err) {
      throw new Error(
        `Publishing web resource failed (logo uploaded but not yet visible): ${(err as Error).message ?? err}`,
      );
    }
  }

  // 2) Find existing theme by name. We deliberately do NOT filter on `type`
  // here — different Dataverse orgs report it as either Edm.Boolean or an
  // option-set, and a wrong filter either silently misses our previous theme
  // (causing duplicate-create attempts) or 400s on filter parse. Filtering by
  // name is enough since custom theme names are unique within an org for our
  // purposes. Likewise we don't send `type` on create/update — the platform
  // assigns it correctly (custom) and explicitly sending `false` triggers the
  // "System or Default theme can only be created out of box" 400 in some orgs
  // because the value gets coerced to the System option.
  onStatus?.("Looking up existing theme…");
  const existing = await client.query<ThemeRecord>("themes", {
    filter: `name eq '${themeName.replace(/'/g, "''")}'`,
    select: ["themeid", "name", "type", "isdefaulttheme"],
    top: 1,
  });

  const body: Record<string, unknown> = {
    name: themeName,
    navbarbackgroundcolor: colors.navbarBackground,
    navbarshelfcolor: colors.navbarShelf,
    maincolor: colors.main,
    accentcolor: colors.accent,
    pageheaderbackgroundcolor: colors.pageBackground,
    globallinkcolor: colors.globalLink,
    headercolor: colors.headerColor,
    controlborder: colors.controlBorder,
    controlshade: colors.controlShade,
    defaultentitycolor: colors.defaultEntity,
    defaultcustomentitycolor: colors.defaultCustomEntity,
    processcontrolcolor: colors.processControl,
    hoverlinkeffect: colors.hoverLink,
    selectedlinkeffect: colors.selectedLink,
  };
  // v1.44.5 — Logo→theme binding is done in TWO steps, not inline.
  //
  // Why: history of pain with inline `@odata.bind` on the theme entity.
  //   * Some orgs expose the lookup nav property as `logoid` (logical name).
  //   * Older orgs expose it schema-cased as `LogoId`.
  //   * Some orgs (e.g. clariantservicepoc, May 2026) expose it under the
  //     *relationship*'s schema name (typically `lk_theme_webresource_logoid`)
  //     and reject every column-based casing with "undeclared property '<X>'
  //     which only has property annotations in the payload but no property
  //     value was found in the payload."
  //   * v1.44.2 (try `logoid` → `LogoId`) covered most orgs.
  //   * v1.44.4 (drop binding entirely on failure) stopped Apply from
  //     crashing but left the logo orphaned in the org — published web
  //     resource but no theme→logo link, which is exactly the complaint
  //     the user just raised.
  //
  // v1.44.5 fix: create/update the theme WITHOUT any inline @odata.bind
  // (so the OData payload parser never sees the disputed property), then
  // discover the actual nav property name from $metadata and link the logo
  // via the $ref endpoint (`PUT /themes({id})/{navProp}/$ref`), which uses
  // URL-segment routing and is more permissive than payload-property
  // routing. Metadata discovery returns the EXACT name Dataverse uses on
  // this org — no guessing. If discovery fails (permissions, network), we
  // fall back to trying `logoid`, `LogoId` against $ref directly. Only if
  // every attempt fails do we degrade to "logo uploaded but not linked".
  //
  // `logoimage` remains the wrong target — it's a string URL column, not a
  // lookup. We never try it.

  let themeId: string;
  if (existing.length > 0) {
    onStatus?.("Updating theme…");
    themeId = existing[0].themeid;
    const res = await client.request(`/themes(${themeId})`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Update theme failed: ${res.status} ${detail}`);
    }
  } else {
    onStatus?.("Creating theme…");
    themeId = await client.create("themes", body);
  }

  let logoBindingDropped = false;
  let logoBindingDiag = "";
  if (webResourceId) {
    onStatus?.("Linking logo to theme…");
    const result = await linkLogoToTheme(client, themeId, webResourceId, onStatus);
    if (!result.ok) {
      logoBindingDropped = true;
      logoBindingDiag = result.diag;
    }
  }

  if (logoBindingDropped) {
    onStatus?.(
      `Theme applied, but the logo link could not be set automatically on this org. Diagnostic: ${logoBindingDiag}. The logo web resource was uploaded successfully and can be linked manually from the theme form (Settings → Themes → select theme → Logo lookup).`,
    );
  }

  // 3) Publish the theme as default. The correct call is the BOUND action
  // on the theme record: POST /themes({id})/Microsoft.Dynamics.CRM.PublishTheme.
  // The unbound /PublishTheme variant returns 404 ("Resource not found for
  // the segment 'PublishTheme'"). The PATCH-isdefaulttheme=true fallback is
  // also rejected ("Default status cannot be updated using update operation"),
  // because isdefaulttheme is server-managed and only flipped via PublishTheme.
  onStatus?.("Publishing theme as default…");
  const publishRes = await client.request(
    `/themes(${themeId})/Microsoft.Dynamics.CRM.PublishTheme`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    },
  );
  if (!publishRes.ok) {
    const detail = await publishRes.text().catch(() => "");
    throw new Error(
      `PublishTheme failed: ${publishRes.status} ${detail.slice(0, 400)}`,
    );
  }

  return {
    themeId,
    webResourceId,
    logoLinked: !!webResourceId && !logoBindingDropped,
    logoLinkDiag: logoBindingDropped ? logoBindingDiag : undefined,
  };
}

/**
 * Link a logo web resource to a theme record via the OData `$ref` endpoint
 * for the single-valued logo navigation property.
 *
 * Returns `{ ok: true }` on success, or `{ ok: false, diag }` with a short
 * diagnostic string listing what was tried and what HTTP status came back.
 * The diagnostic is surfaced to the user so a "logo didn't link" failure
 * can be debugged from the UI without opening the browser console.
 *
 * Strategy (v1.44.6):
 *  1. Discover the nav property name from $metadata broadly — fetch ALL
 *     ManyToOneRelationships on `theme` and pick any that reference
 *     `webresource` (covers orgs where the column logical name isn't
 *     literally `logoid`, or where the filter parser is fussy).
 *  2. Also try the historical guesses (`logoid`, `LogoId`,
 *     `lk_theme_webresource_logoid`).
 *  3. PUT — not POST — because the logo lookup is single-valued. POST is
 *     for collection-valued associations.
 *  4. Surface every attempt's HTTP status via onStatus so the user sees
 *     exactly what Dataverse said.
 */
async function linkLogoToTheme(
  client: DataverseClient,
  themeId: string,
  webResourceId: string,
  onStatus?: (msg: string) => void,
): Promise<{ ok: true } | { ok: false; diag: string }> {
  const candidates = new Set<string>();
  const diagParts: string[] = [];

  // Step 1 — broad metadata discovery. Fetch every ManyToOne relationship
  // on the `theme` entity (no filter — some orgs reject `$filter` on
  // EntityDefinitions sub-collections with cryptic 500s) and select the
  // ones that reference `webresource`. This finds the logo lookup
  // regardless of what the column logical name is on this org.
  onStatus?.("Discovering theme→logo navigation property from metadata…");
  try {
    const metaRes = await client.request(
      "/EntityDefinitions(LogicalName='theme')/ManyToOneRelationships?$select=ReferencingAttribute,ReferencingEntityNavigationPropertyName,ReferencedEntity",
    );
    if (metaRes.ok) {
      const json = (await metaRes.json()) as {
        value?: Array<{
          ReferencingAttribute?: string;
          ReferencingEntityNavigationPropertyName?: string;
          ReferencedEntity?: string;
        }>;
      };
      const rels = json.value ?? [];
      const wrRels = rels.filter((r) => r.ReferencedEntity === "webresource");
      diagParts.push(`metadata: ${rels.length} rels, ${wrRels.length} → webresource`);
      for (const r of wrRels) {
        if (r.ReferencingEntityNavigationPropertyName) {
          candidates.add(r.ReferencingEntityNavigationPropertyName);
        }
      }
      const discovered = wrRels
        .map((r) => `${r.ReferencingAttribute}→${r.ReferencingEntityNavigationPropertyName}`)
        .join(", ");
      if (discovered) onStatus?.(`Logo nav candidates from metadata: ${discovered}`);
    } else {
      diagParts.push(`metadata GET → HTTP ${metaRes.status}`);
    }
  } catch (err) {
    diagParts.push(`metadata GET threw: ${(err as Error).message ?? "unknown"}`);
  }

  // Step 2 — known fallbacks. Order doesn't really matter (Set dedupes);
  // every name is tried until one returns 2xx/412.
  for (const c of ["logoid", "LogoId", "lk_theme_webresource_logoid"]) {
    candidates.add(c);
  }

  // Step 3 — try each candidate against `$ref`. Body must be an absolute
  // @odata.id pointing at the target record. `DataverseClient` exposes
  // `orgUrl` and `apiVersion` as readonly publics.
  const apiBase = `${client.orgUrl}/api/data/${client.apiVersion}`;
  const odataId = `${apiBase}/webresourceset(${webResourceId})`;

  for (const navName of candidates) {
    let status = 0;
    let snippet = "";
    try {
      const res = await client.request(
        `/themes(${themeId})/${navName}/$ref`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "@odata.id": odataId }),
        },
      );
      status = res.status;
      // 204 No Content is the success code for $ref PUT.
      // 412 sometimes surfaces for already-set single-valued refs → success.
      if (res.ok || res.status === 412) {
        onStatus?.(`Logo linked via ${navName} (HTTP ${status})`);
        return { ok: true };
      }
      const body = await res.text().catch(() => "");
      snippet = body.slice(0, 120).replace(/\s+/g, " ");
      onStatus?.(`Logo link via ${navName} → HTTP ${status}: ${snippet || "(no body)"}`);
      diagParts.push(`${navName}=${status}`);
    } catch (err) {
      const msg = (err as Error).message ?? "unknown";
      onStatus?.(`Logo link via ${navName} threw: ${msg}`);
      diagParts.push(`${navName}=ERR`);
    }
  }
  return { ok: false, diag: diagParts.join("; ") };
}

async function upsertLogoWebResource(
  client: DataverseClient,
  themeName: string,
  logo: { contentType: string; base64: string; fileName: string },
): Promise<string> {
  // Downscale before anything else — large raster logos cause the POST below
  // to fail at the network layer ("Failed to fetch") because Dataverse drops
  // oversized webresource content connections.
  const small = await downscaleLogo(logo);
  // Web resource type codes:
  //   1 = HTML, 2 = CSS, 3 = JScript, 4 = XML, 5 = PNG, 6 = JPG, 7 = GIF,
  //   8 = XAP/Silverlight, 9 = XSL, 10 = ICO, 11 = SVG, 12 = RESX
  const typeMap: Record<string, number> = {
    "image/png": 5,
    "image/jpeg": 6,
    "image/jpg": 6,
    "image/gif": 7,
    "image/x-icon": 10,
    "image/vnd.microsoft.icon": 10,
    "image/svg+xml": 11,
  };
  const wrType = typeMap[small.contentType.toLowerCase()];
  if (!wrType) {
    throw new Error(`Unsupported logo content type: ${small.contentType}`);
  }

  const safeBase = themeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const ext = (small.fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "png").toLowerCase();
  const wrName = `fsdemo_/themes/${safeBase}_logo.${ext}`;

  const existing = await client.query<{ webresourceid: string }>("webresourceset", {
    filter: `name eq '${wrName.replace(/'/g, "''")}'`,
    select: ["webresourceid"],
    top: 1,
  });

  const body = {
    name: wrName,
    displayname: `${themeName} Logo`,
    webresourcetype: wrType,
    content: small.base64,
  };

  if (existing.length > 0) {
    const id = existing[0].webresourceid;
    const res = await client.request(`/webresourceset(${id})`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Update web resource failed: ${res.status} ${detail}`);
    }
    return id;
  }

  // Lean POST — deliberately NO `Prefer: return=representation` so Dataverse
  // doesn't echo the (potentially large) base64 content back. Read the new
  // id from the OData-EntityId response header instead.
  const res = await client.request("/webresourceset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Create web resource failed: ${res.status} ${detail}`);
  }
  const entityIdHeader = res.headers.get("OData-EntityId");
  const m = entityIdHeader?.match(/\(([0-9a-f-]{36})\)/i);
  if (!m) {
    throw new Error("Create web resource: missing OData-EntityId header");
  }
  return m[1];
}

async function publishWebResource(
  client: DataverseClient,
  webResourceId: string,
): Promise<void> {
  const xml = `<importexportxml><webresources><webresource>{${webResourceId}}</webresource></webresources></importexportxml>`;
  const res = await client.request("/PublishXml", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ParameterXml: xml }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`PublishXml failed: ${res.status} ${detail}`);
  }
}
