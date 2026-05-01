/**
 * Territory → metro coordinates lookup used by the optional "geocode
 * resources" step. Each entry is the rough city-centre lat/long for a
 * common US metro the AI presetter tends to produce.
 *
 * Lookup is by territory CODE first (preferred — the preset enforces
 * uppercase codes) then by lower-cased territory NAME as a fallback so
 * AI-generated presets that use unusual codes still work as long as the
 * name matches a known city. Anything we can't resolve falls back to a
 * deterministic per-name pseudo-random offset around the contiguous-US
 * centroid so we never write null lat/long to Dataverse.
 */

interface Coord {
  lat: number;
  lng: number;
}

const BY_CODE: Record<string, Coord> = {
  PNW: { lat: 47.6062, lng: -122.3321 },  // Seattle
  SEA: { lat: 47.6062, lng: -122.3321 },
  POR: { lat: 45.5152, lng: -122.6784 },  // Portland
  BAY: { lat: 37.7749, lng: -122.4194 },  // San Francisco
  SFO: { lat: 37.7749, lng: -122.4194 },
  SV: { lat: 37.3382, lng: -121.8863 },   // San Jose
  LA: { lat: 34.0522, lng: -118.2437 },   // Los Angeles
  SD: { lat: 32.7157, lng: -117.1611 },   // San Diego
  PHX: { lat: 33.4484, lng: -112.0740 },  // Phoenix
  DEN: { lat: 39.7392, lng: -104.9903 },  // Denver
  SLC: { lat: 40.7608, lng: -111.8910 },  // Salt Lake City
  LV: { lat: 36.1699, lng: -115.1398 },   // Las Vegas
  CTX: { lat: 30.2672, lng: -97.7431 },   // Austin
  ATX: { lat: 30.2672, lng: -97.7431 },
  DFW: { lat: 32.7767, lng: -96.7970 },   // Dallas
  HOU: { lat: 29.7604, lng: -95.3698 },   // Houston
  SATX: { lat: 29.4241, lng: -98.4936 },  // San Antonio
  SAT: { lat: 29.4241, lng: -98.4936 },
  NOLA: { lat: 29.9511, lng: -90.0715 },  // New Orleans
  MIA: { lat: 25.7617, lng: -80.1918 },   // Miami
  TPA: { lat: 27.9506, lng: -82.4572 },   // Tampa
  ORL: { lat: 28.5384, lng: -81.3789 },   // Orlando
  ATL: { lat: 33.7490, lng: -84.3880 },   // Atlanta
  CLT: { lat: 35.2271, lng: -80.8431 },   // Charlotte
  RDU: { lat: 35.7796, lng: -78.6382 },   // Raleigh
  NSH: { lat: 36.1627, lng: -86.7816 },   // Nashville
  NYC: { lat: 40.7128, lng: -74.0060 },   // New York
  NJ: { lat: 40.7357, lng: -74.1724 },    // Newark
  PHL: { lat: 39.9526, lng: -75.1652 },   // Philadelphia
  DC: { lat: 38.9072, lng: -77.0369 },    // Washington DC
  BAL: { lat: 39.2904, lng: -76.6122 },   // Baltimore
  NE: { lat: 42.3601, lng: -71.0589 },    // Boston
  BOS: { lat: 42.3601, lng: -71.0589 },
  PIT: { lat: 40.4406, lng: -79.9959 },   // Pittsburgh
  CLE: { lat: 41.4993, lng: -81.6944 },   // Cleveland
  CIN: { lat: 39.1031, lng: -84.5120 },   // Cincinnati
  DET: { lat: 42.3314, lng: -83.0458 },   // Detroit
  MW: { lat: 41.8781, lng: -87.6298 },    // Chicago
  CHI: { lat: 41.8781, lng: -87.6298 },
  IND: { lat: 39.7684, lng: -86.1581 },   // Indianapolis
  STL: { lat: 38.6270, lng: -90.1994 },   // St. Louis
  MSP: { lat: 44.9778, lng: -93.2650 },   // Minneapolis
  KC: { lat: 39.0997, lng: -94.5786 },    // Kansas City
  OKC: { lat: 35.4676, lng: -97.5164 },   // Oklahoma City
};

const BY_NAME_LOWER: Record<string, Coord> = {
  "pacific northwest": BY_CODE.PNW,
  "seattle": BY_CODE.SEA,
  "portland": BY_CODE.POR,
  "california bay area": BY_CODE.BAY,
  "bay area": BY_CODE.BAY,
  "san francisco": BY_CODE.SFO,
  "silicon valley": BY_CODE.SV,
  "san jose": BY_CODE.SV,
  "los angeles": BY_CODE.LA,
  "southern california": BY_CODE.LA,
  "san diego": BY_CODE.SD,
  "phoenix": BY_CODE.PHX,
  "denver": BY_CODE.DEN,
  "salt lake city": BY_CODE.SLC,
  "las vegas": BY_CODE.LV,
  "central texas": BY_CODE.CTX,
  "austin": BY_CODE.ATX,
  "dallas-fort worth": BY_CODE.DFW,
  "dallas": BY_CODE.DFW,
  "fort worth": BY_CODE.DFW,
  "greater houston": BY_CODE.HOU,
  "houston": BY_CODE.HOU,
  "san antonio": BY_CODE.SAT,
  "san antonio & south texas": BY_CODE.SAT,
  "new orleans": BY_CODE.NOLA,
  "miami": BY_CODE.MIA,
  "tampa": BY_CODE.TPA,
  "orlando": BY_CODE.ORL,
  "atlanta": BY_CODE.ATL,
  "charlotte": BY_CODE.CLT,
  "raleigh": BY_CODE.RDU,
  "nashville": BY_CODE.NSH,
  "greater new york": BY_CODE.NYC,
  "new york": BY_CODE.NYC,
  "new york metro": BY_CODE.NYC,
  "northeast": BY_CODE.NE,
  "boston": BY_CODE.BOS,
  "philadelphia": BY_CODE.PHL,
  "washington dc": BY_CODE.DC,
  "baltimore": BY_CODE.BAL,
  "pittsburgh": BY_CODE.PIT,
  "cleveland": BY_CODE.CLE,
  "cincinnati": BY_CODE.CIN,
  "detroit": BY_CODE.DET,
  "midwest": BY_CODE.MW,
  "chicago": BY_CODE.CHI,
  "indianapolis": BY_CODE.IND,
  "st. louis": BY_CODE.STL,
  "saint louis": BY_CODE.STL,
  "minneapolis": BY_CODE.MSP,
  "twin cities": BY_CODE.MSP,
  "kansas city": BY_CODE.KC,
  "oklahoma city": BY_CODE.OKC,
};

// Continental US centroid — used as the last-resort fallback so demos
// without recognised territory codes still get plausible coords.
const CONTINENTAL_US_CENTRE: Coord = { lat: 39.8283, lng: -98.5795 };

/**
 * Return a metro centre coord for the given territory code/name. Returns
 * null when nothing matches so the caller can decide whether to fall
 * back to a global default or skip geocoding entirely.
 */
export function territoryCenter(
  code: string | undefined,
  name?: string | undefined,
): Coord | null {
  if (code) {
    const hit = BY_CODE[code.toUpperCase()];
    if (hit) return hit;
  }
  if (name) {
    const hit = BY_NAME_LOWER[name.toLowerCase().trim()];
    if (hit) return hit;
  }
  return null;
}

/**
 * Deterministic small offset (~3-5 mile spread) keyed off `seed` so the
 * same tech name always lands at the same coordinate across runs but
 * different techs in the same metro don't all stack on one pin.
 *
 * `radiusDeg` controls spread: 0.04 ≈ ~3 miles latitudinally, which is a
 * sensible "tech home" radius around a metro centre.
 */
export function jitterCoord(
  base: Coord,
  seed: string,
  radiusDeg = 0.04,
): Coord {
  // djb2 hash → split into two pseudo-random offsets in [-1, 1].
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h + seed.charCodeAt(i)) | 0;
  }
  const a = ((h & 0xffff) / 0xffff) * 2 - 1;
  const b = (((h >>> 16) & 0xffff) / 0xffff) * 2 - 1;
  return {
    lat: base.lat + a * radiusDeg,
    lng: base.lng + b * radiusDeg,
  };
}

/**
 * Top-level helper: resolve coordinates for a tech given their territory
 * code/name and tech name. Always returns a coord — falls back to a
 * jittered position around the US centroid when the territory is unknown.
 */
export function geocodeTech(
  techName: string,
  territoryCode: string | undefined,
  territoryName?: string,
): Coord {
  const base = territoryCenter(territoryCode, territoryName) ?? CONTINENTAL_US_CENTRE;
  return jitterCoord(base, techName);
}
