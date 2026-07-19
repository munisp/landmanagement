import { useEffect, useRef } from 'react';
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
  layers: [
    {
      id: 'osm-base',
      type: 'raster',
      source: 'osm',
    },
  ],
};

interface ParcelShape {
  id: number;
  parcelNumber: string;
  estimatedValue?: number;
  status?: string;
  areaSquareMeters?: number;
  coordinates?: { lat: number; lng: number };
  geometryGeoJSON?: string;
  boundaryCoordinates?: string;
}

interface MapLibreParcelWorkbenchProps {
  parcel?: ParcelShape | null;
  nearbyParcels?: ParcelShape[];
  className?: string;
}

function buildParcelPolygon(parcel?: ParcelShape | null): GeoJSON.Feature<GeoJSON.Polygon> | null {
  if (!parcel) return null;

  if (parcel.geometryGeoJSON) {
    try {
      const parsed = JSON.parse(parcel.geometryGeoJSON) as GeoJSON.Geometry;
      if (parsed.type === 'Polygon') {
        return { type: 'Feature', properties: { parcelNumber: parcel.parcelNumber }, geometry: parsed };
      }
      if (parsed.type === 'MultiPolygon' && parsed.coordinates?.[0]) {
        return {
          type: 'Feature',
          properties: { parcelNumber: parcel.parcelNumber },
          geometry: { type: 'Polygon', coordinates: parsed.coordinates[0] },
        };
      }
    } catch {
      // Ignore invalid GeoJSON and continue to fallbacks.
    }
  }

  if (parcel.boundaryCoordinates) {
    const polygon = String(parcel.boundaryCoordinates)
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [lat, lng] = pair.split(',').map(Number);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
      })
      .filter((point): point is [number, number] => Array.isArray(point));

    if (polygon.length >= 3) {
      const first = polygon[0];
      const closed = polygon[polygon.length - 1][0] === first[0] && polygon[polygon.length - 1][1] === first[1]
        ? polygon
        : [...polygon, first];
      return {
        type: 'Feature',
        properties: { parcelNumber: parcel.parcelNumber },
        geometry: { type: 'Polygon', coordinates: [closed] },
      };
    }
  }

  if (parcel.coordinates?.lat != null && parcel.coordinates?.lng != null) {
    const lat = parcel.coordinates.lat;
    const lng = parcel.coordinates.lng;
    const area = Math.max(Number(parcel.areaSquareMeters || 400), 100);
    const offset = Math.sqrt(area) / 111000 / 2;
    const polygon: [number, number][] = [
      [lng - offset, lat - offset],
      [lng + offset, lat - offset],
      [lng + offset, lat + offset],
      [lng - offset, lat + offset],
      [lng - offset, lat - offset],
    ];
    return {
      type: 'Feature',
      properties: { parcelNumber: parcel.parcelNumber },
      geometry: { type: 'Polygon', coordinates: [polygon] },
    };
  }

  return null;
}

function buildBounds(parcel?: ParcelShape | null, nearbyParcels: ParcelShape[] = []): LngLatBoundsLike | null {
  const points: [number, number][] = [];
  const polygon = buildParcelPolygon(parcel);
  if (polygon) {
    polygon.geometry.coordinates[0].forEach((coord) => points.push(coord as [number, number]));
  }
  nearbyParcels.forEach((candidate) => {
    if (candidate.coordinates) {
      points.push([candidate.coordinates.lng, candidate.coordinates.lat]);
    }
  });

  if (points.length === 0) return null;

  const lngs = points.map((point) => point[0]);
  const lats = points.map((point) => point[1]);
  return [
    [Math.min(...lngs), Math.min(...lats)],
    [Math.max(...lngs), Math.max(...lats)],
  ];
}

export function MapLibreParcelWorkbench({ parcel, nearbyParcels = [], className }: MapLibreParcelWorkbenchProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: mapContainerRef.current,
      style: MAP_STYLE,
      center: parcel?.coordinates ? [parcel.coordinates.lng, parcel.coordinates.lat] : [3.3792, 6.5244],
      zoom: parcel?.coordinates ? 13 : 6,
    });

    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: true, showZoom: true }), 'top-right');

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [parcel]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) {
      const timer = window.setTimeout(() => {
        if (mapRef.current?.isStyleLoaded()) {
          mapRef.current.resize();
        }
      }, 250);
      return () => window.clearTimeout(timer);
    }

    const applyData = () => {
      const anchorPolygon = buildParcelPolygon(parcel);
      const anchorPoint = parcel?.coordinates
        ? {
            type: 'FeatureCollection',
            features: [{
              type: 'Feature',
              properties: { parcelNumber: parcel.parcelNumber, status: parcel.status || 'unknown' },
              geometry: { type: 'Point', coordinates: [parcel.coordinates.lng, parcel.coordinates.lat] },
            }],
          }
        : { type: 'FeatureCollection', features: [] };

      const nearbyPoints = {
        type: 'FeatureCollection',
        features: nearbyParcels
          .filter((candidate) => candidate.coordinates)
          .map((candidate) => ({
            type: 'Feature' as const,
            properties: {
              parcelNumber: candidate.parcelNumber,
              status: candidate.status || 'unknown',
              estimatedValue: candidate.estimatedValue || 0,
            },
            geometry: {
              type: 'Point' as const,
              coordinates: [candidate.coordinates!.lng, candidate.coordinates!.lat],
            },
          })),
      };

      const polygonCollection = {
        type: 'FeatureCollection',
        features: anchorPolygon ? [anchorPolygon] : [],
      };

      if (!map.getSource('anchor-polygon')) {
        map.addSource('anchor-polygon', { type: 'geojson', data: polygonCollection as any });
        map.addLayer({ id: 'anchor-polygon-fill', type: 'fill', source: 'anchor-polygon', paint: { 'fill-color': '#2563eb', 'fill-opacity': 0.18 } });
        map.addLayer({ id: 'anchor-polygon-line', type: 'line', source: 'anchor-polygon', paint: { 'line-color': '#1d4ed8', 'line-width': 3 } });
      } else {
        (map.getSource('anchor-polygon') as maplibregl.GeoJSONSource).setData(polygonCollection as any);
      }

      if (!map.getSource('anchor-point')) {
        map.addSource('anchor-point', { type: 'geojson', data: anchorPoint as any });
        map.addLayer({ id: 'anchor-point-layer', type: 'circle', source: 'anchor-point', paint: { 'circle-radius': 7, 'circle-color': '#111827', 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' } });
      } else {
        (map.getSource('anchor-point') as maplibregl.GeoJSONSource).setData(anchorPoint as any);
      }

      if (!map.getSource('nearby-points')) {
        map.addSource('nearby-points', { type: 'geojson', data: nearbyPoints as any });
        map.addLayer({ id: 'nearby-points-layer', type: 'circle', source: 'nearby-points', paint: { 'circle-radius': 5, 'circle-color': '#10b981', 'circle-opacity': 0.85, 'circle-stroke-width': 1, 'circle-stroke-color': '#ffffff' } });
      } else {
        (map.getSource('nearby-points') as maplibregl.GeoJSONSource).setData(nearbyPoints as any);
      }

      const bounds = buildBounds(parcel, nearbyParcels);
      if (bounds) {
        map.fitBounds(bounds, { padding: 40, maxZoom: 15, duration: 0 });
      }
    };

    if (map.loaded()) {
      applyData();
    } else {
      map.once('load', applyData);
    }
  }, [parcel, nearbyParcels]);

  return <div ref={mapContainerRef} className={className ?? 'h-[420px] w-full rounded-xl'} />;
}
