/**
 * Category normalization map (Stage 3).
 *
 * Raw source labels ("pothole", "road defect", "broken streetlight", ...) are
 * mapped onto the `issue_category` domain from supabase/migrations.
 * Keys are matched lowercase after trimming and collapsing whitespace.
 */

const CATEGORY_MAP = {
  // ROAD_DAMAGE
  pothole: 'ROAD_DAMAGE',
  potholes: 'ROAD_DAMAGE',
  'road defect': 'ROAD_DAMAGE',
  'road damage': 'ROAD_DAMAGE',
  crack: 'ROAD_DAMAGE',
  cracks: 'ROAD_DAMAGE',
  'broken pavement': 'ROAD_DAMAGE',
  'road surface': 'ROAD_DAMAGE',
  'road hazard': 'ROAD_DAMAGE',
  pavement: 'ROAD_DAMAGE',
  asphalt: 'ROAD_DAMAGE',

  // WATER_LEAK
  'water leak': 'WATER_LEAK',
  leak: 'WATER_LEAK',
  leaks: 'WATER_LEAK',
  'broken pipe': 'WATER_LEAK',
  'burst pipe': 'WATER_LEAK',
  'water main break': 'WATER_LEAK',
  'pipe burst': 'WATER_LEAK',

  // STREETLIGHT
  streetlight: 'STREETLIGHT',
  'street light': 'STREETLIGHT',
  'streetlight out': 'STREETLIGHT',
  'street light out': 'STREETLIGHT',
  'broken streetlight': 'STREETLIGHT',
  'light out': 'STREETLIGHT',
  'lamp post': 'STREETLIGHT',
  'dead streetlight': 'STREETLIGHT',

  // GARBAGE
  garbage: 'GARBAGE',
  trash: 'GARBAGE',
  litter: 'GARBAGE',
  'illegal dumping': 'GARBAGE',
  'garbage dump': 'GARBAGE',
  waste: 'GARBAGE',
  'missed pickup': 'GARBAGE',
  'overflowing bin': 'GARBAGE',

  // FLOODING
  flood: 'FLOODING',
  flooding: 'FLOODING',
  'flooded road': 'FLOODING',
  'heavy rain': 'FLOODING',
  'flash flood': 'FLOODING',
  flood_alert: 'FLOODING',

  // DRAINAGE
  drain: 'DRAINAGE',
  drainage: 'DRAINAGE',
  'blocked drain': 'DRAINAGE',
  'clogged drain': 'DRAINAGE',
  'storm drain': 'DRAINAGE',
  'open manhole': 'DRAINAGE',

  // TRAFFIC_SIGNAL
  'traffic signal': 'TRAFFIC_SIGNAL',
  'traffic light': 'TRAFFIC_SIGNAL',
  'signal out': 'TRAFFIC_SIGNAL',
  'broken traffic light': 'TRAFFIC_SIGNAL',

  // DAMAGED_SIGN
  'damaged sign': 'DAMAGED_SIGN',
  'broken sign': 'DAMAGED_SIGN',
  'fallen sign': 'DAMAGED_SIGN',
  'missing sign': 'DAMAGED_SIGN',
  signboard: 'DAMAGED_SIGN',
}

const ALLOWED_CATEGORIES = new Set([
  'ROAD_DAMAGE',
  'WATER_LEAK',
  'STREETLIGHT',
  'GARBAGE',
  'FLOODING',
  'DRAINAGE',
  'TRAFFIC_SIGNAL',
  'DAMAGED_SIGN',
  'OTHER',
])

export function canonicalizeKey(raw) {
  return String(raw ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
}

/** Map a raw category label to an issue_category value; unknown -> OTHER. */
export function normalizeCategory(rawCategory) {
  const key = canonicalizeKey(rawCategory)
  const upper = key.toUpperCase()
  if (ALLOWED_CATEGORIES.has(upper)) {
    return upper
  }
  return CATEGORY_MAP[key] ?? 'OTHER'
}

export function isKnownCategory(rawCategory) {
  const key = canonicalizeKey(rawCategory)
  return key in CATEGORY_MAP || ALLOWED_CATEGORIES.has(key.toUpperCase())
}

export { ALLOWED_CATEGORIES as CATEGORY_VALUES }
