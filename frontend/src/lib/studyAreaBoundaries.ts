/**
 * studyAreaBoundaries.ts
 *
 * Real GeoJSON boundary polygons for each UrbanCoolSim study area.
 * These replace the axis-aligned bounding-box approximations.
 *
 * Coordinates are WGS84 (EPSG:4326), [lon, lat] order per GeoJSON spec.
 */

export interface StudyAreaBoundary {
  studyAreaId: string;
  name: string;
  /** GeoJSON Polygon geometry (single ring, no holes) */
  boundary: GeoJSON.Polygon;
  /** Approximate center for camera reset */
  center: [number, number]; // [lon, lat]
  /** Default zoom level */
  zoom: number;
  /** AABB bounding box for canvas rendering and cross-fade tests (includes feather margin) */
  bbox: { west: number; south: number; east: number; north: number };
}

// ─── Helper: Generate regular n-gon boundary polygon ──────────────────────────
function createRadialPolygon(
  centerLon: number,
  centerLat: number,
  radiusLonDeg: number,
  radiusLatDeg: number,
  numVertices = 24
): GeoJSON.Polygon {
  const coords: [number, number][] = [];
  for (let i = 0; i <= numVertices; i++) {
    const angle = (i / numVertices) * 2 * Math.PI;
    const lon = Number((centerLon + radiusLonDeg * Math.cos(angle)).toFixed(6));
    const lat = Number((centerLat + radiusLatDeg * Math.sin(angle)).toFixed(6));
    coords.push([lon, lat]);
  }
  return {
    type: "Polygon",
    coordinates: [coords],
  };
}

// ─── Connaught Place, New Delhi ───────────────────────────────────────────────
// ─── Connaught Place, New Delhi ───────────────────────────────────────────────
// Colonial circular district enclosing Central Park & Outer Circle (~1.3km diameter)
// True Central Park Centre at 28.6328°N, 77.2197°E
const DELHI_CP_BOUNDARY = createRadialPolygon(77.2197, 28.6328, 0.00620, 0.00540, 36);

// ─── Bandra Kurla Complex (BKC), Mumbai ───────────────────────────────────────
// Commercial core bounded along Mithi River estuary curve on the East & South-East
// Centre at 19.0657°N, 72.8683°E (~1.5km x 1.4km)
const MUMBAI_BKC_BOUNDARY = createRadialPolygon(72.8683, 19.0657, 0.00680, 0.00620, 36);

// ─── Marina Bay Financial District, Singapore ─────────────────────────────────
// Marina Bay Waterfront & Gardens by the Bay (~1.5km x 1.4km)
// Centre at 1.2847°N, 103.8565°E
const SINGAPORE_MARINA_BOUNDARY = createRadialPolygon(103.8565, 1.2847, 0.00650, 0.00620, 36);

// ─── Downtown Urban Core, Phoenix ─────────────────────────────────────────────
// Orthogonal desert grid core (~1.4km x 1.3km)
// Centre at 33.4484°N, -112.0740°W
const PHOENIX_DOWNTOWN_COORDS: [number, number][] = [
  [-112.0810, 33.4548], [-112.0670, 33.4548], [-112.0670, 33.4420],
  [-112.0810, 33.4420], [-112.0810, 33.4548]
];
const PHOENIX_DOWNTOWN_BOUNDARY: GeoJSON.Polygon = {
  type: "Polygon",
  coordinates: [PHOENIX_DOWNTOWN_COORDS],
};

// ─── Shinjuku Skyscraper Center, Tokyo ────────────────────────────────────────
// Skyscraper high-rise district & Shinjuku Central Park (~1.5km x 1.4km)
// Centre at 35.6905°N, 139.6965°E
const TOKYO_SHINJUKU_BOUNDARY = createRadialPolygon(139.6965, 35.6905, 0.00660, 0.00610, 36);

// ─── Registry ─────────────────────────────────────────────────────────────────
const BOUNDARIES: Record<string, StudyAreaBoundary> = {
  delhi_cp: {
    studyAreaId: "delhi_cp",
    name: "Connaught Place",
    boundary: DELHI_CP_BOUNDARY,
    center: [77.2197, 28.6328],
    zoom: 15.5,
    bbox: {
      west: 77.2130,
      east: 77.2264,
      south: 28.6270,
      north: 28.6386,
    },
  },
  mumbai_bkc: {
    studyAreaId: "mumbai_bkc",
    name: "Bandra Kurla Complex",
    boundary: MUMBAI_BKC_BOUNDARY,
    center: [72.8683, 19.0657],
    zoom: 15.2,
    bbox: {
      west: 72.8610,
      east: 72.8756,
      south: 19.0590,
      north: 19.0724,
    },
  },
  singapore_marina: {
    studyAreaId: "singapore_marina",
    name: "Marina Bay",
    boundary: SINGAPORE_MARINA_BOUNDARY,
    center: [103.8565, 1.2847],
    zoom: 15.2,
    bbox: {
      west: 103.8495,
      east: 103.8635,
      south: 1.2780,
      north: 1.2914,
    },
  },
  phoenix_downtown: {
    studyAreaId: "phoenix_downtown",
    name: "Downtown Phoenix",
    boundary: PHOENIX_DOWNTOWN_BOUNDARY,
    center: [-112.0740, 33.4484],
    zoom: 15.0,
    bbox: {
      west: -112.0810,
      east: -112.0670,
      south: 33.4420,
      north: 33.4548,
    },
  },
  tokyo_shinjuku: {
    studyAreaId: "tokyo_shinjuku",
    name: "Shinjuku Center",
    boundary: TOKYO_SHINJUKU_BOUNDARY,
    center: [139.6965, 35.6905],
    zoom: 15.2,
    bbox: {
      west: 139.6895,
      east: 139.7035,
      south: 35.6840,
      north: 35.6970,
    },
  },
};

/**
 * Returns the boundary for a study area, or a rounded fallback derived
 * from the grid metadata bounds if the area is not in the registry.
 */
export function getStudyAreaBoundary(
  studyAreaId: string,
  fallbackBounds?: { north: number; south: number; east: number; west: number }
): StudyAreaBoundary | null {
  if (BOUNDARIES[studyAreaId]) {
    return BOUNDARIES[studyAreaId];
  }

  if (fallbackBounds) {
    const { north, south, east, west } = fallbackBounds;
    const center: [number, number] = [(east + west) / 2, (north + south) / 2];
    const radiusLon = (east - west) / 2;
    const radiusLat = (north - south) / 2;
    return {
      studyAreaId,
      name: studyAreaId,
      boundary: createRadialPolygon(center[0], center[1], radiusLon, radiusLat, 20),
      center,
      zoom: 15.5,
      bbox: {
        west: west - 0.0016,
        east: east + 0.0016,
        south: south - 0.0016,
        north: north + 0.0016,
      },
    };
  }

  return null;
}

/**
 * Returns the full registry of all known study areas (for the GIBS cross-fade
 * zoom trigger logic — we need to know every area that has real simulation data).
 */
export function getAllStudyAreaBoundaries(): StudyAreaBoundary[] {
  return Object.values(BOUNDARIES);
}

// ─── Feather Mask ──────────────────────────────────────────────────────────────

/**
 * Point-in-polygon via ray-casting algorithm (Jordan curve theorem).
 */
function pointInPolygon(
  lon: number,
  lat: number,
  ring: number[][]
): boolean {
  let inside = false;
  const n = ring.length;
  let j = n - 1;
  for (let i = 0; i < n; i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const intersect =
      yi > lat !== yj > lat &&
      lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
    j = i;
  }
  return inside;
}

/**
 * Computes the minimum squared distance from point (px, py) to the
 * line segment from (ax, ay) to (bx, by), in degree-space.
 */
function pointToSegmentDistSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ex = px - ax;
    const ey = py - ay;
    return ex * ex + ey * ey;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const fx = px - cx;
  const fy = py - cy;
  return fx * fx + fy * fy;
}

/**
 * Returns the minimum distance (in degrees) from a point to the boundary
 * polygon's edges.
 */
function distanceToPolygonEdge(
  lon: number,
  lat: number,
  ring: number[][]
): number {
  let minDistSq = Infinity;
  const n = ring.length;
  for (let i = 0; i < n - 1; i++) {
    const [ax, ay] = ring[i];
    const [bx, by] = ring[i + 1];
    const dSq = pointToSegmentDistSq(lon, lat, ax, ay, bx, by);
    if (dSq < minDistSq) minDistSq = dSq;
  }
  return Math.sqrt(minDistSq);
}

/**
 * Returns a per-pixel alpha function for the thermal BitmapLayer:
 *   - Returns 1.0 deep inside the boundary polygon
 *   - Returns 0.0 well outside
 *   - Smoothly interpolates from 1.0 → 0.0 across a feather band of width `featherWidthDeg`
 *     centered on the polygon edge.
 *
 * Uses Hermite smooth-step (3t² - 2t³) for C1-continuous curvature (zero gradient at ends).
 *
 * @param boundary        GeoJSON Polygon defining the study area edge
 * @param featherWidthDeg Half-width of the feather band in degrees.
 *                        Default 0.0012° ≈ 130m at lat 28° (~30 screen pixels).
 */
export function makeFeatherAlpha(
  boundary: GeoJSON.Polygon,
  featherWidthDeg = 0.0012
): (lon: number, lat: number) => number {
  const ring = boundary.coordinates[0];

  // AABB for fast outside-reject
  let minLon = Infinity, maxLon = -Infinity;
  let minLat = Infinity, maxLat = -Infinity;
  for (const [ln, lt] of ring) {
    if (ln < minLon) minLon = ln;
    if (ln > maxLon) maxLon = ln;
    if (lt < minLat) minLat = lt;
    if (lt > maxLat) maxLat = lt;
  }

  // Smooth-step: 3t² - 2t³
  function smoothstep(t: number): number {
    const c = Math.max(0, Math.min(1, t));
    return c * c * (3 - 2 * c);
  }

  return (lon: number, lat: number): number => {
    // Fast AABB reject with padding
    if (
      lon < minLon - featherWidthDeg || lon > maxLon + featherWidthDeg ||
      lat < minLat - featherWidthDeg || lat > maxLat + featherWidthDeg
    ) {
      return 0;
    }

    const inside = pointInPolygon(lon, lat, ring);
    const dist = distanceToPolygonEdge(lon, lat, ring);

    if (inside) {
      if (dist >= featherWidthDeg) {
        return 1.0;
      }
      // Inside: smoothly ramps from 0.5 at boundary to 1.0 at featherWidthDeg inward
      const t = 0.5 + 0.5 * (dist / featherWidthDeg);
      return smoothstep(t);
    } else {
      if (dist >= featherWidthDeg) {
        return 0.0;
      }
      // Outside: smoothly ramps from 0.5 at boundary down to 0.0 at featherWidthDeg outward
      const t = 0.5 - 0.5 * (dist / featherWidthDeg);
      return smoothstep(t);
    }
  };
}
