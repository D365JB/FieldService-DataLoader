// US metro catalog used by the Territory Locations panel.
// Each metro defines a centre point that we scatter accounts and technician
// home addresses around. Coords are city-centre approximations — fine for
// rendering on the FS schedule board map; not for actual routing decisions.

export interface Metro {
  /** Internal id used as the `select` value in the UI. */
  id: string;
  /** Display label, e.g. "Seattle, WA". */
  label: string;
  city: string;
  state: string;
  /** Sample postal code anchored on the city centre (just for demo addresses). */
  postal: string;
  lat: number;
  lng: number;
}

export const METROS: Metro[] = [
  { id: "sea", label: "Seattle, WA", city: "Seattle", state: "WA", postal: "98101", lat: 47.6062, lng: -122.3321 },
  { id: "pdx", label: "Portland, OR", city: "Portland", state: "OR", postal: "97204", lat: 45.5152, lng: -122.6784 },
  { id: "sfo", label: "San Francisco, CA", city: "San Francisco", state: "CA", postal: "94103", lat: 37.7749, lng: -122.4194 },
  { id: "lax", label: "Los Angeles, CA", city: "Los Angeles", state: "CA", postal: "90012", lat: 34.0522, lng: -118.2437 },
  { id: "san", label: "San Diego, CA", city: "San Diego", state: "CA", postal: "92101", lat: 32.7157, lng: -117.1611 },
  { id: "phx", label: "Phoenix, AZ", city: "Phoenix", state: "AZ", postal: "85003", lat: 33.4484, lng: -112.0740 },
  { id: "lvg", label: "Las Vegas, NV", city: "Las Vegas", state: "NV", postal: "89101", lat: 36.1699, lng: -115.1398 },
  { id: "den", label: "Denver, CO", city: "Denver", state: "CO", postal: "80202", lat: 39.7392, lng: -104.9903 },
  { id: "slc", label: "Salt Lake City, UT", city: "Salt Lake City", state: "UT", postal: "84101", lat: 40.7608, lng: -111.8910 },
  { id: "abq", label: "Albuquerque, NM", city: "Albuquerque", state: "NM", postal: "87102", lat: 35.0844, lng: -106.6504 },
  { id: "dfw", label: "Dallas, TX", city: "Dallas", state: "TX", postal: "75201", lat: 32.7767, lng: -96.7970 },
  { id: "hou", label: "Houston, TX", city: "Houston", state: "TX", postal: "77002", lat: 29.7604, lng: -95.3698 },
  { id: "aus", label: "Austin, TX", city: "Austin", state: "TX", postal: "78701", lat: 30.2672, lng: -97.7431 },
  { id: "msp", label: "Minneapolis, MN", city: "Minneapolis", state: "MN", postal: "55402", lat: 44.9778, lng: -93.2650 },
  { id: "chi", label: "Chicago, IL", city: "Chicago", state: "IL", postal: "60601", lat: 41.8781, lng: -87.6298 },
  { id: "det", label: "Detroit, MI", city: "Detroit", state: "MI", postal: "48226", lat: 42.3314, lng: -83.0458 },
  { id: "atl", label: "Atlanta, GA", city: "Atlanta", state: "GA", postal: "30303", lat: 33.7490, lng: -84.3880 },
  { id: "mia", label: "Miami, FL", city: "Miami", state: "FL", postal: "33130", lat: 25.7617, lng: -80.1918 },
  { id: "tpa", label: "Tampa, FL", city: "Tampa", state: "FL", postal: "33602", lat: 27.9506, lng: -82.4572 },
  { id: "orl", label: "Orlando, FL", city: "Orlando", state: "FL", postal: "32801", lat: 28.5383, lng: -81.3792 },
  { id: "nyc", label: "New York, NY", city: "New York", state: "NY", postal: "10007", lat: 40.7128, lng: -74.0060 },
  { id: "bos", label: "Boston, MA", city: "Boston", state: "MA", postal: "02108", lat: 42.3601, lng: -71.0589 },
  { id: "phl", label: "Philadelphia, PA", city: "Philadelphia", state: "PA", postal: "19107", lat: 39.9526, lng: -75.1652 },
  { id: "dca", label: "Washington, DC", city: "Washington", state: "DC", postal: "20001", lat: 38.9072, lng: -77.0369 },
  { id: "clt", label: "Charlotte, NC", city: "Charlotte", state: "NC", postal: "28202", lat: 35.2271, lng: -80.8431 },
  { id: "rdu", label: "Raleigh, NC", city: "Raleigh", state: "NC", postal: "27601", lat: 35.7796, lng: -78.6382 },
  { id: "nas", label: "Nashville, TN", city: "Nashville", state: "TN", postal: "37203", lat: 36.1627, lng: -86.7816 },
];

export function metroById(id: string | undefined | null): Metro | undefined {
  if (!id) return undefined;
  return METROS.find((m) => m.id === id);
}

/**
 * Heuristic auto-match: given a territory name + code from a preset, pick the
 * best metro by keyword. Falls back to a hash so we always return something
 * deterministic (and spread across metros) when nothing matches by keyword.
 */
export function autoMatchMetro(territoryName: string, territoryCode: string): Metro {
  const haystack = `${territoryName} ${territoryCode}`.toLowerCase();
  const keywordToMetro: Array<[RegExp, string]> = [
    [/seattle|puget|cascade|olympic/, "sea"],
    [/portland|oregon|willamette/, "pdx"],
    [/pacific northwest|\bpnw\b|northwest/, "sea"],
    [/bay area|\bbay\b|silicon valley|san francisco|\bsf\b|peninsula/, "sfo"],
    [/los angeles|\bla\b|socal|southern california|hollywood/, "lax"],
    [/san diego/, "san"],
    [/phoenix|arizona|sonoran|valley of the sun/, "phx"],
    [/las vegas|vegas|nevada/, "lvg"],
    [/denver|colorado|rocky/, "den"],
    [/salt lake|utah|wasatch/, "slc"],
    [/albuquerque|new mexico/, "abq"],
    [/southwest|desert|sw\b/, "phx"],
    [/dallas|fort worth|metroplex|\bdfw\b/, "dfw"],
    [/houston|gulf coast/, "hou"],
    [/austin|central texas/, "aus"],
    [/texas|lone star/, "dfw"],
    [/minneapolis|saint paul|twin cities|minnesota/, "msp"],
    [/chicago|illinois|midwest|great lakes/, "chi"],
    [/detroit|michigan/, "det"],
    [/atlanta|georgia/, "atl"],
    [/miami|south florida/, "mia"],
    [/tampa|st\. petersburg/, "tpa"],
    [/orlando|central florida/, "orl"],
    [/florida|sunshine/, "mia"],
    [/southeast|deep south|carolinas/, "atl"],
    [/new york|\bnyc\b|tri-?state|manhattan|brooklyn|queens/, "nyc"],
    [/boston|new england|massachusetts/, "bos"],
    [/philadelphia|philly|pennsylvania/, "phl"],
    [/washington|\bdc\b|capital|beltway|virginia|maryland/, "dca"],
    [/charlotte|piedmont/, "clt"],
    [/raleigh|durham|triangle/, "rdu"],
    [/nashville|tennessee/, "nas"],
    [/northeast|atlantic/, "nyc"],
    [/north|nor\b|\bn\b/, "msp"],
    [/south|\bso\b|\bs\b/, "atl"],
    [/west|\bw\b|coastal/, "sfo"],
    [/east|\be\b/, "nyc"],
    [/central|midwest|\bmw\b|heartland/, "chi"],
  ];
  for (const [rx, id] of keywordToMetro) {
    if (rx.test(haystack)) {
      const m = metroById(id);
      if (m) return m;
    }
  }
  // Fallback — distribute across metros by hashing the code so different
  // territories don't all collapse to the same default city.
  let h = 0;
  for (const ch of `${territoryCode}${territoryName}`) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return METROS[h % METROS.length];
}

/**
 * Tiny seeded PRNG (mulberry32) so the same seed string always produces the
 * same sequence — accounts/technicians keep the same coords across re-runs.
 */
function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  let s = h >>> 0;
  return () => {
    s |= 0;
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const STREET_NAMES = [
  "Pine St", "Oak Ave", "Maple Dr", "Cedar Ln", "Elm St", "Birch Way",
  "Willow Rd", "Aspen Ct", "Park Blvd", "Lakeview Dr", "Hilltop Rd",
  "Sunset Blvd", "Riverside Dr", "Madison Ave", "Jefferson St", "Lincoln Way",
  "Industrial Pkwy", "Commerce Dr", "Market St", "Mission Ave", "Mill Rd",
  "Harbor Way", "Summit Pl", "Bay St", "Highland Ave", "Vista Dr",
];

export interface ScatteredAddress {
  line1: string;
  city: string;
  state: string;
  postal: string;
  lat: number;
  lng: number;
}

/**
 * Pick a random-but-deterministic address inside a `radiusMi`-mile circle
 * around the metro centre. `seed` should be unique per record so different
 * accounts/techs land at different points. Uses a uniform disk sample.
 */
export function scatterInMetro(
  metro: Metro,
  seed: string,
  radiusMi = 15,
): ScatteredAddress {
  const rng = seededRng(seed);
  // Uniform sample inside disk: r = R * sqrt(u), theta = 2*pi*v.
  const r = radiusMi * Math.sqrt(rng());
  const theta = 2 * Math.PI * rng();
  // 1 deg latitude ≈ 69 mi; longitude shrinks with cos(lat).
  const dLat = (r * Math.cos(theta)) / 69;
  const dLng =
    (r * Math.sin(theta)) /
    (69 * Math.cos((metro.lat * Math.PI) / 180));
  const number = 100 + Math.floor(rng() * 9899);
  const street = STREET_NAMES[Math.floor(rng() * STREET_NAMES.length)];
  return {
    line1: `${number} ${street}`,
    city: metro.city,
    state: metro.state,
    postal: metro.postal,
    lat: +(metro.lat + dLat).toFixed(6),
    lng: +(metro.lng + dLng).toFixed(6),
  };
}
