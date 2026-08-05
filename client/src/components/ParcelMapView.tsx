import { useMemo, useState } from 'react';
import { Layers, Navigation } from 'lucide-react';
import { Button } from './ui/button';
import { trpc } from '@/lib/trpc';
import { MapLibreParcelWorkbench, type ParcelShape } from './MapLibreParcelWorkbench';

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
    geometryGeoJSON?: string | null;
    boundaryCoordinates?: string | null;
    status?: string | null;
  };
}

interface NearbyParcel {
  id: number;
  parcelNumber: string;
  status: string;
  coordinates: { lat: number; lng: number } | null;
}

function parseParcelCenter(coordinates?: string | null): { lat: number; lng: number } | null {
  if (!coordinates) return null;
  const values = coordinates.split(',').map((value) => Number(value.trim()));
  if (values.length !== 2 || !Number.isFinite(values[0]) || !Number.isFinite(values[1])) return null;
  const [lat, lng] = values;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

export function ParcelMapView({ parcel }: ParcelMapViewProps) {
  const [showNearbyParcels, setShowNearbyParcels] = useState(true);
  const center = useMemo(() => parseParcelCenter(parcel.coordinates), [parcel.coordinates]);
  const nearbyQuery = trpc.parcels.geospatialSearch.useQuery(
    { centerLat: center?.lat ?? 0, centerLng: center?.lng ?? 0, radiusKm: 2, limit: 50 },
    { enabled: Boolean(center && showNearbyParcels), staleTime: 30_000 },
  );

  if (!center) {
    return <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">This parcel has no valid persisted survey coordinates. Map and nearby-parcel analysis are unavailable until a surveyor records its location.</div>;
  }

  const currentParcel: ParcelShape = {
    id: parcel.id,
    parcelNumber: parcel.parcelNumber,
    status: parcel.status ?? undefined,
    areaSquareMeters: parcel.areaSquareMeters ?? undefined,
    coordinates: center,
    geometryGeoJSON: parcel.geometryGeoJSON ?? null,
    boundaryCoordinates: parcel.boundaryCoordinates ?? null,
  };
  const nearbyParcels: ParcelShape[] = showNearbyParcels
    ? ((nearbyQuery.data?.parcels ?? []) as NearbyParcel[])
      .filter((candidate) => candidate.id !== parcel.id && candidate.coordinates)
      .map((candidate) => ({ id: candidate.id, parcelNumber: candidate.parcelNumber, status: candidate.status, coordinates: candidate.coordinates }))
    : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2"><Button variant={showNearbyParcels ? 'default' : 'outline'} size="sm" onClick={() => setShowNearbyParcels((visible) => !visible)}><Layers className="mr-2 h-4 w-4" />Nearby parcels</Button></div>
        <Button variant="outline" size="sm" asChild><a href={`/parcels/${parcel.id}/map`}><Navigation className="mr-2 h-4 w-4" />Open full governed review</a></Button>
      </div>
      <div className="relative">
        <MapLibreParcelWorkbench parcel={currentParcel} nearbyParcels={nearbyParcels} enableMeasurementTools className="h-[600px] w-full rounded-lg border" />
        <div className="pointer-events-none absolute bottom-4 left-4 rounded-lg border bg-background/95 p-3 text-xs shadow"><p className="mb-2 font-semibold">Legend</p><div className="space-y-1 text-muted-foreground"><p><span className="mr-2 inline-block h-3 w-3 border-2 border-blue-700 bg-blue-500/30" />Current parcel evidence</p><p><span className="mr-2 inline-block h-3 w-3 rounded-full bg-emerald-500" />Recorded nearby parcel centroids</p></div></div>
        <div className="pointer-events-none absolute right-4 top-4 max-w-xs rounded-lg border bg-background/95 p-3 text-sm shadow"><p className="font-semibold">{parcel.parcelNumber}</p><p className="mt-1 text-muted-foreground">{parcel.streetAddress || `${parcel.lga}, ${parcel.state}`}</p>{parcel.areaSquareMeters != null ? <p className="mt-1"><span className="font-medium">Recorded area:</span> {parcel.areaSquareMeters.toFixed(2)} m²</p> : null}{parcel.ward ? <p><span className="font-medium">Ward:</span> {parcel.ward}</p> : null}{showNearbyParcels && nearbyQuery.isError ? <p className="mt-2 text-destructive">Nearby parcel context is currently unavailable.</p> : null}</div>
      </div>
    </div>
  );
}
