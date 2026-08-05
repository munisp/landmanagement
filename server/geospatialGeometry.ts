import { wktToGeoJSON as parseWktToGeoJSON } from '@terraformer/wkt';

/**
 * Converts persisted WKT to GeoJSON without manufacturing a fallback location.
 * A malformed stored geometry is omitted from a rendered layer and remains a
 * data-quality issue for the normal topology/repair workflow; it is never
 * projected at an unrelated coordinate such as `[0, 0]`.
 */
export function parsePersistedWktGeometry(wkt: string): GeoJSON.Geometry | null {
  if (!wkt.trim()) return null;
  try {
    const geometry = parseWktToGeoJSON(wkt);
    if (!geometry || !geometry.type) return null;
    return geometry;
  } catch {
    return null;
  }
}
