declare module "@terraformer/wkt" {
  export function wktToGeoJSON(wkt: string): GeoJSON.Geometry | null;
}
