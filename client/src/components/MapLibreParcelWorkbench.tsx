import { useEffect, useRef, useState } from 'react';
import maplibregl, { LngLatBoundsLike, StyleSpecification } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

const MAP_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© OpenStreetMap contributors',
    },
  },
  layers: [{ id: 'osm-base', type: 'raster', source: 'osm' }],
};

const NEUTRAL_MAP_CENTER: [number, number] = [0, 20];
const NEUTRAL_MAP_ZOOM = 1.5;

type ParcelGeometry = GeoJSON.Polygon | GeoJSON.MultiPolygon;

interface ParcelShape {
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
}

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

/**
 * Returns only a persisted parcel polygon or multipolygon. A centroid is shown
 * separately as a point; it is never expanded into an invented boundary.
 */
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
    properties: {
      id: parcel.id,
      parcelNumber: parcel.parcelNumber,
      status: parcel.status ?? 'unknown',
      estimatedValue: parcel.estimatedValue ?? null,
    },
    geometry: { type: 'Point', coordinates: [coordinates.lng, coordinates.lat] },
  };
}

function polygonFeature(parcel: ParcelShape): GeoJSON.Feature<ParcelGeometry> | null {
  const geometry = buildPersistedParcelGeometry(parcel);
  return geometry
    ? { type: 'Feature', properties: { id: parcel.id, parcelNumber: parcel.parcelNumber, status: parcel.status ?? 'unknown' }, geometry }
    : null;
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
  if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.flat(2).forEach(([lng, lat]) => { if (isValidLngLat(lng, lat)) positions.push([lng, lat]); });
  }
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

export function MapLibreParcelWorkbench({ parcel, nearbyParcels = [], className }: MapLibreParcelWorkbenchProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [mapError, setMapError] = useState<string | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;
    const initialPoint = parcel ? pointFeature(parcel) : null;
    const initialCenter: [number, number] = initialPoint
      ? [initialPoint.geometry.coordinates[0]!, initialPoint.geometry.coordinates[1]!]
      : NEUTRAL_MAP_CENTER;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: initialCenter,
      zoom: initialPoint ? 13 : NEUTRAL_MAP_ZOOM,
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

      const bounds = buildBounds(parcel, nearbyParcels);
      if (bounds) map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
    };

    if (map.isStyleLoaded()) applyData();
    else map.once('style.load', applyData);
    return () => {
      map.off('style.load', applyData);
    };
  }, [parcel, nearbyParcels]);

  const hasPersistedBoundary = Boolean(buildPersistedParcelGeometry(parcel));
  return (
    <div className="relative">
      <div ref={mapContainerRef} className={className ?? 'h-[420px] w-full rounded-xl'} />
      {mapError ? <p className="absolute bottom-3 left-3 right-3 rounded-md bg-destructive/95 p-2 text-xs text-destructive-foreground">{mapError}</p> : null}
      {parcel && !hasPersistedBoundary ? <p className="absolute left-3 top-3 max-w-sm rounded-md bg-background/95 p-2 text-xs text-muted-foreground shadow">This parcel has no validated persisted boundary. The map shows only recorded centroid evidence; it does not infer a cadastral boundary.</p> : null}
    </div>
  );
}
