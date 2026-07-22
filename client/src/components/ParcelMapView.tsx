/*
 * ParcelMapView Component
 * Displays a persisted parcel location, boundary, and real nearby parcels.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { MapView } from './Map';
import { Button } from './ui/button';
import { Layers, Navigation, ZoomIn, ZoomOut } from 'lucide-react';
import { trpc } from '@/lib/trpc';

interface ParcelMapViewProps {
  parcel: {
    id: number;
    parcelNumber: string;
    state: string;
    lga: string;
    ward?: string | null;
    streetAddress?: string | null;
    areaSquareMeters?: number | null;
    coordinates?: string | null;
    boundaryCoordinates?: string | null;
  };
}

interface NearbyParcel {
  id: number;
  parcelNumber: string;
  status: string;
  coordinates: { lat: number; lng: number } | null;
}

function parseParcelCenter(coordinates?: string | null): google.maps.LatLngLiteral | null {
  if (!coordinates) return null;
  const values = coordinates.split(',').map((value) => Number(value.trim()));
  if (values.length !== 2 || !Number.isFinite(values[0]) || !Number.isFinite(values[1])) return null;
  const [lat, lng] = values;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function parseBoundaryPath(boundaryCoordinates?: string | null): google.maps.LatLngLiteral[] | null {
  if (!boundaryCoordinates) return null;
  const points = boundaryCoordinates
    .split(';')
    .map((point) => point.split(',').map((value) => Number(value.trim())))
    .filter((point) => point.length === 2 && Number.isFinite(point[0]) && Number.isFinite(point[1]))
    .map(([lat, lng]) => ({ lat, lng }));
  return points.length >= 3 ? points : null;
}

function htmlEscape(value: string): string {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character] ?? character));
}

export function ParcelMapView({ parcel }: ParcelMapViewProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const nearbyMarkerRefs = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [showSatellite, setShowSatellite] = useState(false);
  const [showNearbyParcels, setShowNearbyParcels] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const center = useMemo(() => parseParcelCenter(parcel.coordinates), [parcel.coordinates]);
  const boundaryPath = useMemo(() => parseBoundaryPath(parcel.boundaryCoordinates), [parcel.boundaryCoordinates]);

  const nearbyQuery = trpc.parcels.geospatialSearch.useQuery(
    {
      centerLat: center?.lat ?? 0,
      centerLng: center?.lng ?? 0,
      radiusKm: 2,
      limit: 50,
    },
    {
      enabled: Boolean(center && showNearbyParcels),
      staleTime: 30_000,
    },
  );

  useEffect(() => {
    nearbyMarkerRefs.current.forEach((marker) => { marker.map = null; });
    nearbyMarkerRefs.current = [];
    const map = mapRef.current;
    const result = nearbyQuery.data;
    if (!map || !mapReady || !showNearbyParcels || !result?.parcels) return;

    const nearbyParcels = (result.parcels as NearbyParcel[])
      .filter((candidate) => candidate.id !== parcel.id && candidate.coordinates);
    nearbyMarkerRefs.current = nearbyParcels.map((nearby) => {
      const position = nearby.coordinates as google.maps.LatLngLiteral;
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position,
        title: nearby.parcelNumber,
      });
      marker.addListener('click', () => {
        const infoWindow = new google.maps.InfoWindow({
          content: `<div style="padding:8px"><h4 style="font-weight:700;margin-bottom:4px">${htmlEscape(nearby.parcelNumber)}</h4><p style="color:#666;font-size:14px">Status: ${htmlEscape(nearby.status)}</p><a href="/parcels/${nearby.id}" style="color:#3b82f6;font-size:14px;text-decoration:none">View details</a></div>`,
          position,
        });
        infoWindow.open(map);
      });
      return marker;
    });

    return () => {
      nearbyMarkerRefs.current.forEach((marker) => { marker.map = null; });
      nearbyMarkerRefs.current = [];
    };
  }, [mapReady, nearbyQuery.data, parcel.id, showNearbyParcels]);

  if (!center) {
    return (
      <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        This parcel has no valid persisted survey coordinates. Map and nearby-parcel analysis are unavailable until a surveyor records its location.
      </div>
    );
  }

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;
    new google.maps.marker.AdvancedMarkerElement({
      map,
      position: center,
      title: parcel.parcelNumber,
    });

    if (boundaryPath) {
      const parcelPolygon = new google.maps.Polygon({
        paths: boundaryPath,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        map,
      });
      const bounds = new google.maps.LatLngBounds();
      boundaryPath.forEach((point) => bounds.extend(point));
      map.fitBounds(bounds);
      parcelPolygon.addListener('click', () => {
        new google.maps.InfoWindow({
          content: `<div style="padding:8px"><h3 style="font-weight:700;margin-bottom:4px">${htmlEscape(parcel.parcelNumber)}</h3><p style="color:#666;font-size:14px">${htmlEscape(parcel.streetAddress || `${parcel.lga}, ${parcel.state}`)}</p>${parcel.areaSquareMeters ? `<p style="font-size:14px;margin-top:4px">Area: ${parcel.areaSquareMeters.toFixed(2)} m²</p>` : ''}</div>`,
          position: center,
        }).open(map);
      });
    }
    setMapReady(true);
  };

  const toggleMapType = () => {
    if (!mapRef.current) return;
    const next = showSatellite ? 'roadmap' : 'satellite';
    mapRef.current.setMapTypeId(next);
    setShowSatellite(!showSatellite);
  };

  const zoomIn = () => {
    if (!mapRef.current) return;
    mapRef.current.setZoom((mapRef.current.getZoom() || 12) + 1);
  };

  const zoomOut = () => {
    if (!mapRef.current) return;
    mapRef.current.setZoom((mapRef.current.getZoom() || 12) - 1);
  };

  const recenterMap = () => {
    if (!mapRef.current) return;
    mapRef.current.setCenter(center);
    mapRef.current.setZoom(15);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button variant={showSatellite ? 'default' : 'outline'} size="sm" onClick={toggleMapType} className="gap-2">
            <Layers className="h-4 w-4" />
            {showSatellite ? 'Satellite' : 'Map'}
          </Button>
          <Button variant={showNearbyParcels ? 'default' : 'outline'} size="sm" onClick={() => setShowNearbyParcels((visible) => !visible)}>
            Nearby Parcels
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={zoomIn}><ZoomIn className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={zoomOut}><ZoomOut className="h-4 w-4" /></Button>
          <Button variant="outline" size="sm" onClick={recenterMap} className="gap-2"><Navigation className="h-4 w-4" />Recenter</Button>
        </div>
      </div>

      <div className="relative">
        <MapView initialCenter={center} initialZoom={15} onMapReady={handleMapReady} className="h-[600px] rounded-lg border" />
        <div className="absolute bottom-4 left-4 rounded-lg border bg-white p-3 shadow-lg">
          <h4 className="mb-2 text-sm font-semibold">Legend</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2"><div className="h-4 w-4 border-2 border-blue-500 bg-blue-500 opacity-20" /><span>Current Parcel</span></div>
            <div className="flex items-center gap-2"><div className="h-4 w-4 rounded-full bg-gray-300" /><span>Nearby Parcels</span></div>
          </div>
        </div>
        <div className="absolute right-4 top-4 max-w-xs rounded-lg border bg-white p-4 shadow-lg">
          <h4 className="mb-2 font-semibold">{parcel.parcelNumber}</h4>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">{parcel.streetAddress || `${parcel.lga}, ${parcel.state}`}</p>
            {parcel.areaSquareMeters != null && <p><span className="font-medium">Area:</span> {parcel.areaSquareMeters.toFixed(2)} m²</p>}
            {parcel.ward && <p><span className="font-medium">Ward:</span> {parcel.ward}</p>}
            {showNearbyParcels && nearbyQuery.isError && <p className="text-destructive">Nearby parcel data is currently unavailable.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
