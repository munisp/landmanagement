import { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export type SearchMapCenter = { lat: number; lng: number };
export type SearchMapResult = { id: number; parcelNumber: string; status?: string; coordinates?: string | { lat: number; lng: number } | null };

function validCenter(value: SearchMapCenter): boolean {
  return Number.isFinite(value.lat) && Number.isFinite(value.lng) && Math.abs(value.lat) <= 90 && Math.abs(value.lng) <= 180;
}

function parseCoordinates(value: SearchMapResult['coordinates']): [number, number] | null {
  if (typeof value === 'string') {
    const [lat, lng] = value.split(',').map(Number);
    return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null;
  }
  if (value && typeof value.lat === 'number' && typeof value.lng === 'number' && validCenter(value)) return [value.lng, value.lat];
  return null;
}

function radiusRing(center: SearchMapCenter, radiusKm: number): [number, number][] {
  const radiusMeters = Math.max(100, Math.min(100_000, radiusKm * 1_000));
  const earthRadius = 6_371_008.8;
  const latitude = center.lat * Math.PI / 180;
  const longitude = center.lng * Math.PI / 180;
  return Array.from({ length: 65 }, (_, index) => {
    const bearing = index / 64 * Math.PI * 2;
    const angularDistance = radiusMeters / earthRadius;
    const nextLatitude = Math.asin(Math.sin(latitude) * Math.cos(angularDistance) + Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(bearing));
    const nextLongitude = longitude + Math.atan2(Math.sin(bearing) * Math.sin(angularDistance) * Math.cos(latitude), Math.cos(angularDistance) - Math.sin(latitude) * Math.sin(nextLatitude));
    return [nextLongitude * 180 / Math.PI, nextLatitude * 180 / Math.PI] as [number, number];
  });
}

export function MapLibreSearchMap({ center, radiusKm, results, onCenterChange, className }: { center: SearchMapCenter; radiusKm: number; results: SearchMapResult[]; onCenterChange: (center: SearchMapCenter) => void; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new maplibregl.Map({ container: containerRef.current, style: '/api/geospatial-delivery/basemap/style.json', center: [center.lng, center.lat], zoom: 11 });
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: 'metric' }), 'bottom-left');
    map.on('click', (event) => onCenterChange({ lat: event.lngLat.lat, lng: event.lngLat.lng }));
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; };
  }, [onCenterChange]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !validCenter(center)) return;
    const apply = () => {
      const centerFeature: GeoJSON.Feature<GeoJSON.Point> = { type: 'Feature', properties: { role: 'search_center' }, geometry: { type: 'Point', coordinates: [center.lng, center.lat] } };
      const radiusFeature: GeoJSON.Feature<GeoJSON.Polygon> = { type: 'Feature', properties: { role: 'radius' }, geometry: { type: 'Polygon', coordinates: [radiusRing(center, radiusKm)] } };
      const resultFeatures: GeoJSON.Feature<GeoJSON.Point>[] = results.flatMap((result) => {
        const coordinates = parseCoordinates(result.coordinates);
        return coordinates ? [{ type: 'Feature', properties: { id: result.id, parcelNumber: result.parcelNumber, status: result.status ?? 'unknown' }, geometry: { type: 'Point', coordinates } }] : [];
      });
      const update = (sourceId: string, data: GeoJSON.FeatureCollection) => {
        const source = map.getSource(sourceId) as maplibregl.GeoJSONSource | undefined;
        if (source) source.setData(data); else map.addSource(sourceId, { type: 'geojson', data });
      };
      update('search-radius', { type: 'FeatureCollection', features: [radiusFeature] });
      update('search-center', { type: 'FeatureCollection', features: [centerFeature] });
      update('search-results', { type: 'FeatureCollection', features: resultFeatures });
      if (!map.getLayer('search-radius-fill')) {
        map.addLayer({ id: 'search-radius-fill', type: 'fill', source: 'search-radius', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.1 } });
        map.addLayer({ id: 'search-radius-line', type: 'line', source: 'search-radius', paint: { 'line-color': '#2563eb', 'line-width': 2 } });
        map.addLayer({ id: 'search-center-point', type: 'circle', source: 'search-center', paint: { 'circle-color': '#1d4ed8', 'circle-radius': 7, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
        map.addLayer({ id: 'search-results-point', type: 'circle', source: 'search-results', paint: { 'circle-color': '#059669', 'circle-radius': 5, 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 1 } });
      }
      map.fitBounds([[Math.min(...radiusRing(center, radiusKm).map(([lng]) => lng)), Math.min(...radiusRing(center, radiusKm).map(([, lat]) => lat))], [Math.max(...radiusRing(center, radiusKm).map(([lng]) => lng)), Math.max(...radiusRing(center, radiusKm).map(([, lat]) => lat))]], { padding: 38, maxZoom: 14, duration: 0 });
    };
    if (map.isStyleLoaded()) apply(); else map.once('style.load', apply);
    return () => { map.off('style.load', apply); };
  }, [center, radiusKm, results]);

  return <div ref={containerRef} className={className ?? 'h-[600px] w-full rounded-lg'} />;
}
