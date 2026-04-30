import { DataverseClient } from "@/lib/dataverse";

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
  const res = await fetch(
    `/api/extractBranding?url=${encodeURIComponent(normalized)}`,
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`extractBranding ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
}

/** Download image bytes via the proxy (for webresource upload). */
export async function fetchImageBytes(url: string): Promise<{
  contentType: string;
  bytes: number;
  base64: string;
}> {
  const res = await fetch(`/api/fetchImage?url=${encodeURIComponent(url)}`);
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`fetchImage ${res.status}: ${detail || res.statusText}`);
  }
  return res.json();
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
}: ApplyThemeArgs): Promise<{ themeId: string; webResourceId?: string }> {
  // 1) Optional: upload logo as web resource.
  let webResourceId: string | undefined;
  if (logo) {
    onStatus?.("Uploading logo as web resource…");
    webResourceId = await upsertLogoWebResource(client, themeName, logo);
    onStatus?.("Publishing web resource…");
    await publishWebResource(client, webResourceId);
  }

  // 2) Find existing theme by name (custom themes have type=false; the OOTB
  // CRM Default Theme is type=true). The `type` column is Edm.Boolean — using
  // `eq 0` triggers a 400 "incompatible operand types" so we compare to false.
  onStatus?.("Looking up existing theme…");
  const existing = await client.query<ThemeRecord>("themes", {
    filter: `name eq '${themeName.replace(/'/g, "''")}' and type eq false`,
    select: ["themeid", "name", "type", "isdefaulttheme"],
    top: 1,
  });

  const body: Record<string, unknown> = {
    name: themeName,
    type: false,
    navbarbackgroundcolor: colors.navbarBackground,
    navbarshelfcolor: colors.navbarShelf,
    maincolor: colors.main,
    accentcolor: colors.accent,
    pagecolor: colors.pageBackground,
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
  if (webResourceId) {
    body["LogoImage@odata.bind"] = `/webresourceset(${webResourceId})`;
  }

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

  // 3) Publish the theme (sets it as default + applies).
  onStatus?.("Publishing theme as default…");
  const publishRes = await client.request("/PublishTheme", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      Target: {
        themeid: themeId,
        "@odata.type": "Microsoft.Dynamics.CRM.theme",
      },
    }),
  });
  if (!publishRes.ok) {
    // Fallback: at least flip isdefaulttheme.
    const detail = await publishRes.text().catch(() => "");
    onStatus?.(
      `PublishTheme returned ${publishRes.status} — falling back to isdefaulttheme=true. (${detail.slice(0, 200)})`,
    );
    const fallback = await client.request(`/themes(${themeId})`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isdefaulttheme: true }),
    });
    if (!fallback.ok) {
      const fdetail = await fallback.text().catch(() => "");
      throw new Error(`Publish/Default failed: ${fallback.status} ${fdetail}`);
    }
  }

  return { themeId, webResourceId };
}

async function upsertLogoWebResource(
  client: DataverseClient,
  themeName: string,
  logo: { contentType: string; base64: string; fileName: string },
): Promise<string> {
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
  const wrType = typeMap[logo.contentType.toLowerCase()];
  if (!wrType) {
    throw new Error(`Unsupported logo content type: ${logo.contentType}`);
  }

  const safeBase = themeName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40);
  const ext = (logo.fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? "png").toLowerCase();
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
    content: logo.base64,
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
  return client.create("webresourceset", body);
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
