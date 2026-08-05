import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { LngLatBoundsLike, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { trpc } from '@/lib/trpc';

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    platformBasemap: {
      type: 'raster',
      tiles: ['/api/geospatial-delivery/basemap/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors · delivered by the platform',
    },
  },
  layers: [{ id: 'platform-basemap', type: 'raster', source: 'platformBasemap' }],
};

const NEUTRAL_MAP_CENTER: [number, number] = [0, 20];
const NEUTRAL_MAP_ZOOM = 1.5;
const VECTOR_LAYER_IDS = ['authorized-parcel-fill', 'authorized-parcel-line'];
const EARTH_RADIUS_METERS = 6_371_008.8;

type ParcelGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;
type MeasurementMode = 'distance' | 'area' | null;

export interface ParcelShape {
  id: number;
  parcelNumber: string;
  estimatedValue?: number;
  status?: string;
  areaSquareMeters?: number;
  coordinates?: { lat: number; lng: number } | null;
  geometryGeoJSON?: string | null;
  boundaryCoordinates?: string | null;
}

interface MapLibreParcelWorkbenchProps {
  parcel?: ParcelShape | null;
  nearbyParcels?: ParcelShape[];
  className?: string;
  enableMeasurementTools?: boolean;
}

type TileGrant = { endpoint: string; capability: string; expiresAt: string };

function isValidLngLat(lng: unknown, lat: unknown): lng is number {
  return typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat)
    && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;
}

function polygonFromBoundaryCoordinates(boundaryCoordinates: string): GeoJSON.Polygon | null {
  const ring = boundaryCoordinates
    .split(';')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [latText, lngText] = pair.split(',');
      const lat = Number(latText);
      const lng = Number(lngText);
      return isValidLngLat(lng, lat) ? [lng, lat] as [number, number] : null;
    })
    .filter((coordinate): coordinate is [number, number] => coordinate !== null);

  if (ring.length < 3) return null;
  const first = ring[0];
  const last = ring[ring.length - 1];
  const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
  return { type: 'Polygon', coordinates: [closed] };
}

function geometryFromUnknown(value: unknown): ParcelGeometry | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { type?: string; geometry?: unknown; coordinates?: unknown };
  const geometry = candidate.type === 'Feature' ? candidate.geometry : candidate;
  if (!geometry || typeof geometry !== 'object') return null;
  const typed = geometry as { type?: string; coordinates?: unknown };
  if ((typed.type === 'Polygon' || typed.type === 'MultiPolygon') && Array.isArray(typed.coordinates)) {
    return typed as ParcelGeometry;
  }
  return null;
}

/** Returns only persisted parcel geometry; it never generates an inferred boundary. */
export function buildPersistedParcelGeometry(parcel?: ParcelShape | null): ParcelGeometry | null {
  if (!parcel) return null;
  if (parcel.geometryGeoJSON) {
    try {
      const geometry = geometryFromUnknown(JSON.parse(parcel.geometryGeoJSON));
      if (geometry) return geometry;
    } catch {
      // The server remains the authoritative repair/validation path for malformed geometry.
    }
  }
  return parcel.boundaryCoordinates ? polygonFromBoundaryCoordinates(parcel.boundaryCoordinates) : null;
}

function featureCollection(features: GeoJSON.Feature[]): GeoJSON.FeatureCollection {
  return { type: 'FeatureCollection', features };
}

function pointFeature(parcel: ParcelShape): GeoJSON.Feature<GeoJSON.Point> | null {
  const coordinates = parcel.coordinates;
  if (!coordinates || !isValidLngLat(coordinates.lng, coordinates.lat)) return null;
  return {
    type: 'Feature',
    properties: { id: parcel.id, parcelNumber: parcel.parcelNumber, status: parcel.status ?? 'unknown', estimatedValue: parcel.estimatedValue ?? null },
    geometry: { type: 'Point', coordinates: [coordinates.lng, coordinates.lat] },
  };
}

function polygonFeature(parcel: ParcelShape): GeoJSON.Feature<ParcelGeometry> | null {
  const geometry = buildPersistedParcelGeometry(parcel);
  return geometry ? { type: 'Feature', properties: { id: parcel.id, parcelNumber: parcel.parcelNumber, status: parcel.status ?? 'unknown' }, geometry } : null;
}

function collectPositions(geometry: GeoJSON.Geometry, positions: [number, number][]) {
  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates;
    if (isValidLngLat(lng, lat)) positions.push([lng, lat]);
    return;
  }
  if (geometry.type === 'LineString' || geometry.type === 'MultiPoint') {
    geometry.coordinates.forEach(([lng, lat]) => { if (isValidLngLat(lng, lat)) positions.push([lng, lat]); });
    return;
  }
  if (geometry.type === 'Polygon' || geometry.type === 'MultiLineString') {
    geometry.coordinates.flat().forEach(([lng, lat]) => { if (isValidLngLat(lng, lat)) positions.push([lng, lat]); });
    return;
  }
  if (geometry.type === 'MultiPolygon') geometry.coordinates.flat(2).forEach(([lng, lat]) => { if (isValidLngLat(lng, lat)) positions.push([lng, lat]); });
}

function buildBounds(parcel?: ParcelShape | null, nearbyParcels: ParcelShape[] = []): LngLatBoundsLike | null {
  const positions: [number, number][] = [];
  const anchorPolygon = parcel ? polygonFeature(parcel) : null;
  if (anchorPolygon) collectPositions(anchorPolygon.geometry, positions);
  if (parcel) {
    const anchorPoint = pointFeature(parcel);
    if (anchorPoint) collectPositions(anchorPoint.geometry, positions);
  }
  nearbyParcels.forEach((candidate) => {
    const point = pointFeature(candidate);
    if (point) collectPositions(point.geometry, positions);
  });
  if (!positions.length) return null;
  return [
    [Math.min(...positions.map(([lng]) => lng)), Math.min(...positions.map(([, lat]) => lat))],
    [Math.max(...positions.map(([lng]) => lng)), Math.max(...positions.map(([, lat]) => lat))],
  ];
}

function removeVectorTileSource(map: maplibregl.Map) {
  VECTOR_LAYER_IDS.forEach((layerId) => { if (map.getLayer(layerId)) map.removeLayer(layerId); });
  if (map.getSource('authorized-parcels')) map.removeSource('authorized-parcels');
}

function haversineMeters(points: [number, number][]): number {
  return points.slice(1).reduce((total, [lng, lat], index) => {
    const [previousLng, previousLat] = points[index]!;
    const lat1 = previousLat * Math.PI / 180;
    const lat2 = lat * Math.PI / 180;
    const deltaLat = lat2 - lat1;
    const deltaLng = (lng - previousLng) * Math.PI / 180;
    const a = Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
    return total + 2 * EARTH_RADIUS_METERS * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }, 0);
}

function localAreaSquareMeters(points: [number, number][]): number {
  if (points.length < 3) return 0;
  const referenceLatitude = points.reduce((sum, [, latitude]) => sum + latitude, 0) / points.length * Math.PI / 180;
  const projected = points.map(([longitude, latitude]) => [
    EARTH_RADIUS_METERS * longitude * Math.PI / 180 * Math.cos(referenceLatitude),
    EARTH_RADIUS_METERS * latitude * Math.PI / 180,
  ] as [number, number]);
  let twiceArea = 0;
  projected.forEach(([x, y], index) => {
    const [nextX, nextY] = projected[(index + 1) % projected.length]!;
    twiceArea += x * nextY - nextX * y;
  });
  return Math.abs(twiceArea) / 2;
}

function formatDistance(meters: number): string {
  return meters >= 1_000 ? `${(meters / 1_000).toFixed(3)} km` : `${meters.toFixed(1)} m`;
}

function formatArea(squareMeters: number): string {
  return squareMeters >= 10_000 ? `${(squareMeters / 10_000).toFixed(4)} ha` : `${squareMeters.toFixed(1)} m²`;
}

function measurementSourceData(mode: MeasurementMode, points: [number, number][]): GeoJSON.FeatureCollection {
  const features: GeoJSON.Feature[] = points.map((coordinates, index) => ({
    type: 'Feature',
    properties: { index: index + 1 },
    geometry: { type: 'Point', coordinates },
  }));
  if (points.length >= 2) {
    const coordinates = mode === 'area' && points.length >= 3 ? [...points, points[0]!] : points;
    features.push({ type: 'Feature', properties: { role: 'line' }, geometry: { type: 'LineString', coordinates } });
  }
  if (mode === 'area' && points.length >= 3) {
    features.push({ type: 'Feature', properties: { role: 'area' }, geometry: { type: 'Polygon', coordinates: [[...points, points[0]!]] } });
  }
  return featureCollection(features);
}

function applyMeasurementLayers(map: maplibregl.Map, mode: MeasurementMode, points: [number, number][]) {
  const data = measurementSourceData(mode, points);
  if (!map.getSource('measurement')) {
    map.addSource('measurement', { type: 'geojson', data });
    map.addLayer({ id: 'measurement-fill', type: 'fill', source: 'measurement', filter: ['==', ['get', 'role'], 'area'], paint: { 'fill-color': '#f97316', 'fill-opacity': 0.18 } });
    map.addLayer({ id: 'measurement-line', type: 'line', source: 'measurement', filter: ['==', ['get', 'role'], 'line'], paint: { 'line-color': '#ea580c', 'line-width': 3 } });
    map.addLayer({ id: 'measurement-points', type: 'circle', source: 'measurement', filter: ['!', ['has', 'role']], paint: { 'circle-color': '#ffffff', 'circle-radius': 5, 'circle-stroke-color': '#ea580c', 'circle-stroke-width': 2 } });
    return;
  }
  (map.getSource('measurement') as maplibregl.GeoJSONSource).setData(data);
}

export function MapLibreParcelWorkbench({ parcel, nearbyParcels = [], className, enableMeasurementTools = false }: MapLibreParcelWorkbenchProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const tileCapabilityRef = useRef<string | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);
  const [tileGrant, setTileGrant] = useState<TileGrant | null>(null);
  const [tileError, setTileError] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [measurementMode, setMeasurementMode] = useState<MeasurementMode>(null);
  const [measurementPoints, setMeasurementPoints] = useState<[number, number][]>([]);
  const issueTileCapability = trpc.geospatialDelivery.issueVectorTileCapability.useMutation();
  const parcelId = parcel?.id;
  const nearbySignature = useMemo(() => nearbyParcels.map((candidate) => candidate.id).join(','), [nearbyParcels]);

  useEffect(() => {
    if (!parcelId) {
      tileCapabilityRef.current = null;
      setTileGrant(null);
      setTileError(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const issue = async () => {
      try {
        setTileError(null);
        const issued = await issueTileCapability.mutateAsync({ parcelIds: [parcelId], purpose: 'maplibre.parcel-review' });
        if (cancelled) return;
        tileCapabilityRef.current = issued.capability;
        setTileGrant({ endpoint: issued.endpoint, capability: issued.capability, expiresAt: issued.expiresAt });
        const refreshIn = Math.max(5_000, new Date(issued.expiresAt).getTime() - Date.now() - 30_000);
        timer = setTimeout(() => setRefreshNonce((value) => value + 1), refreshIn);
      } catch {
        if (!cancelled) {
          tileCapabilityRef.current = null;
          setTileGrant(null);
          setTileError('Authorized vector tiles are unavailable. The map retains only persisted local evidence and does not infer a parcel boundary.');
        }
      }
    };
    void issue();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [issueTileCapability, parcelId, refreshNonce]);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const initialPoint = parcel ? pointFeature(parcel) : null;
    const initialCenter: [number, number] = initialPoint ? [initialPoint.geometry.coordinates[0]!, initialPoint.geometry.coordinates[1]!] : NEUTRAL_MAP_CENTER;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: initialCenter,
      zoom: initialPoint ? 13 : NEUTRAL_MAP_ZOOM,
      transformRequest: (url, resourceType) => {
        if (resourceType === 'Tile' && url.startsWith('/api/geospatial-delivery/tiles/') && tileCapabilityRef.current) {
          return { url, headers: { 'X-Geospatial-Capability': `Bearer ${tileCapabilityRef.current}` } };
        }
        return { url };
      },
    });
    const onError = (event: maplibregl.ErrorEvent) => setMapError(event.error?.message ?? 'The map could not load one of its approved sources.');
    map.on('error', onError);
    map.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: 'metric' }), 'bottom-left');
    mapRef.current = map;
    return () => {
      map.off('error', onError);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const applyData = () => {
      const anchorPolygon = parcel ? polygonFeature(parcel) : null;
      const anchorPoint = parcel ? pointFeature(parcel) : null;
      const nearbyPoints = featureCollection(nearbyParcels.flatMap((candidate) => {
        const point = pointFeature(candidate);
        return point ? [point] : [];
      }));
      const polygonCollection = featureCollection(anchorPolygon ? [anchorPolygon] : []);
      const anchorPointCollection = featureCollection(anchorPoint ? [anchorPoint] : []);

      if (!map.getSource('anchor-polygon')) {
        map.addSource('anchor-polygon', { type: 'geojson', data: polygonCollection });
        map.addLayer({ id: 'anchor-polygon-fill', type: 'fill', source: 'anchor-polygon', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.18 } });
        map.addLayer({ id: 'anchor-polygon-line', type: 'line', source: 'anchor-polygon', paint: { 'line-color': '#1d4ed8', 'line-width': 3 } });
      } else {
        (map.getSource('anchor-polygon') as maplibregl.GeoJSONSource).setData(polygonCollection);
      }
      if (!map.getSource('anchor-point')) {
        map.addSource('anchor-point', { type: 'geojson', data: anchorPointCollection });
        map.addLayer({ id: 'anchor-point-layer', type: 'circle', source: 'anchor-point', paint: { 'circle-radius': 7, 'circle-color': '#111827', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
      } else {
        (map.getSource('anchor-point') as maplibregl.GeoJSONSource).setData(anchorPointCollection);
      }
      if (!map.getSource('nearby-points')) {
        map.addSource('nearby-points', { type: 'geojson', data: nearbyPoints });
        map.addLayer({ id: 'nearby-points-layer', type: 'circle', source: 'nearby-points', paint: { 'circle-radius': 5, 'circle-color': '#10b981', 'circle-opacity': 0.85, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
      } else {
        (map.getSource('nearby-points') as maplibregl.GeoJSONSource).setData(nearbyPoints);
      }

      removeVectorTileSource(map);
      if (tileGrant && parcel) {
        map.addSource('authorized-parcels', { type: 'vector', tiles: [tileGrant.endpoint], minzoom: 0, maxzoom: 22 });
        map.addLayer({ id: 'authorized-parcel-fill', type: 'fill', source: 'authorized-parcels', 'source-layer': 'parcels', paint: { 'fill-color': '#0891b2', 'fill-opacity': 0.25 } });
        map.addLayer({ id: 'authorized-parcel-line', type: 'line', source: 'authorized-parcels', 'source-layer': 'parcels', paint: { 'line-color': '#0e7490', 'line-width': 2.5 } });
        map.setLayoutProperty('anchor-polygon-fill', 'visibility', 'none');
        map.setLayoutProperty('anchor-polygon-line', 'visibility', 'none');
      } else {
        map.setLayoutProperty('anchor-polygon-fill', 'visibility', 'visible');
        map.setLayoutProperty('anchor-polygon-line', 'visibility', 'visible');
      }
      applyMeasurementLayers(map, measurementMode, measurementPoints);
      const bounds = buildBounds(parcel, nearbyParcels);
      if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
    };
    if (map.isStyleLoaded()) applyData();
    else map.once('style.load', applyData);
    return () => { map.off('style.load', applyData); };
  }, [measurementMode, measurementPoints, nearbyParcels, nearbySignature, parcel, tileGrant]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !enableMeasurementTools) return;
    const onClick = (event: maplibregl.MapMouseEvent) => {
      if (!measurementMode) return;
      setMeasurementPoints((points) => [...points, [event.lngLat.lng, event.lngLat.lat]]);
    };
    map.on('click', onClick);
    map.getCanvas().style.cursor = measurementMode ? 'crosshair' : '';
    return () => {
      map.off('click', onClick);
      map.getCanvas().style.cursor = '';
    };
  }, [enableMeasurementTools, measurementMode]);

  const hasPersistedBoundary = Boolean(buildPersistedParcelGeometry(parcel));
  const measurementValue = measurementMode === 'distance'
    ? measurementPoints.length >= 2 ? `Approximate distance: ${formatDistance(haversineMeters(measurementPoints))}` : 'Click at least two locations to measure distance.'
    : measurementMode === 'area'
      ? measurementPoints.length >= 3 ? `Approximate area: ${formatArea(localAreaSquareMeters(measurementPoints))}` : 'Click at least three locations to measure area.'
      : null;

  return (
    <div className="relative">
      <div ref={mapContainerRef} className={className ?? 'h-[420px] w-full rounded-xl'} />
      {enableMeasurementTools ? <div className="absolute right-3 top-3 max-w-xs rounded-md bg-background/95 p-2 text-xs shadow">
        <p className="mb-2 font-medium text-foreground">Review measurement</p>
        <div className="flex flex-wrap gap-1">
          <button type="button" className={`rounded border px-2 py-1 ${measurementMode === 'distance' ? 'bg-primary text-primary-foreground' : 'bg-background'}`} onClick={() => { setMeasurementMode('distance'); setMeasurementPoints([]); }}>Distance</button>
          <button type="button" className={`rounded border px-2 py-1 ${measurementMode === 'area' ? 'bg-primary text-primary-foreground' : 'bg-background'}`} onClick={() => { setMeasurementMode('area'); setMeasurementPoints([]); }}>Area</button>
          <button type="button" className="rounded border bg-background px-2 py-1" onClick={() => { setMeasurementMode(null); setMeasurementPoints([]); }}>Clear</button>
        </div>
        {measurementValue ? <p className="mt-2 text-muted-foreground">{measurementValue} Measurements are visual review aids and are not survey or title evidence.</p> : null}
      </div> : null}
      {mapError ? <p className="absolute bottom-3 left-3 right-3 rounded-md bg-destructive/95 p-2 text-xs text-destructive-foreground">{mapError}</p> : null}
      {tileError ? <p className="absolute bottom-12 left-3 right-3 rounded-md bg-background/95 p-2 text-xs text-muted-foreground shadow">{tileError}</p> : null}
      {tileGrant ? <p className="absolute left-3 top-3 rounded-md bg-background/95 p-2 text-xs text-muted-foreground shadow">Authorized PostGIS vector tiles are active for this parcel.</p> : null}
      {parcel && !hasPersistedBoundary && !tileGrant ? <p className="absolute left-3 top-3 max-w-sm rounded-md bg-background/95 p-2 text-xs text-muted-foreground shadow">This parcel has no validated persisted boundary. The map shows only recorded centroid evidence; it does not infer a cadastral boundary.</p> : null}
    </div>
  );
}
