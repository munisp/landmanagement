import { Link, useRoute } from 'wouter';
import { ArrowLeft, Box, ExternalLink, Loader2, MapPinned, ShieldCheck } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { MapLibreParcelWorkbench, type ParcelShape } from '@/components/MapLibreParcelWorkbench';

function statusVariant(status?: string): 'default' | 'secondary' | 'outline' {
  if (status === 'verified') return 'default';
  if (status === 'registered') return 'secondary';
  return 'outline';
}

function toParcelShape(parcel: any): ParcelShape {
  const latitude = Number(parcel.latitude ?? parcel.coordinates?.lat);
  const longitude = Number(parcel.longitude ?? parcel.coordinates?.lng);
  return {
    id: Number(parcel.id),
    parcelNumber: String(parcel.parcelNumber ?? parcel.id),
    estimatedValue: Number(parcel.estimatedValue ?? 0),
    status: parcel.status ?? undefined,
    areaSquareMeters: Number(parcel.areaSquareMeters ?? 0),
    coordinates: Number.isFinite(latitude) && Number.isFinite(longitude) ? { lat: latitude, lng: longitude } : null,
    geometryGeoJSON: parcel.geometryGeoJSON ?? null,
    boundaryCoordinates: parcel.boundaryCoordinates ?? null,
  };
}

export default function ParcelMap() {
  const [, params] = useRoute('/parcels/:id/map');
  const parcelId = Number(params?.id);
  const parcelQuery = trpc.parcels.getById.useQuery({ id: parcelId }, { enabled: Number.isInteger(parcelId) && parcelId > 0 });

  if (parcelQuery.isLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;
  }

  const parcel = parcelQuery.data;
  if (!parcel) {
    return <div className="flex min-h-screen items-center justify-center"><Card><CardContent className="space-y-4 py-12 text-center"><p className="text-muted-foreground">Parcel not found or unavailable.</p><Button asChild><Link href="/advanced-geospatial-center">Open governed geospatial center</Link></Button></CardContent></Card></div>;
  }

  const mapParcel = toParcelShape(parcel);
  const location = parcel.streetAddress || [parcel.ward, parcel.lga, parcel.state].filter(Boolean).join(', ') || 'Recorded parcel location';
  const hasGeometry = Boolean(mapParcel.geometryGeoJSON || mapParcel.boundaryCoordinates);

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container flex flex-wrap items-center justify-between gap-4 py-4">
          <Button variant="outline" asChild><Link href={`/parcels/${parcelId}`}><ArrowLeft className="mr-2 h-4 w-4" />Back to parcel</Link></Button>
          <div className="text-right"><p className="font-semibold">{mapParcel.parcelNumber}</p><p className="text-sm text-muted-foreground">{location}</p></div>
        </div>
      </header>

      <main className="container space-y-6 py-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h1 className="text-3xl font-bold">Governed parcel review</h1><p className="mt-2 max-w-3xl text-muted-foreground">This MapLibre review surface uses authorized PostGIS vector tiles when available and never invents a parcel boundary. Measurements are non-persistent visual aids, not a survey, title, or legal determination.</p></div>
          <Badge variant={statusVariant(parcel.status)}>{String(parcel.status ?? 'unknown').replace(/_/g, ' ')}</Badge>
        </div>

        <Card>
          <CardHeader><CardTitle><MapPinned className="mr-2 inline h-4 w-4" />Parcel geometry and authorized context</CardTitle><CardDescription>Persisted geometry is preferred. If it is unavailable, the map shows recorded centroid evidence only.</CardDescription></CardHeader>
          <CardContent><MapLibreParcelWorkbench parcel={mapParcel} enableMeasurementTools className="h-[680px] w-full rounded-xl border" /></CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card><CardHeader><CardTitle>Evidence posture</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><div className="rounded-lg border p-4"><p className="font-medium text-foreground">Boundary source</p><p className="mt-1">{hasGeometry ? 'Persisted polygon or multipolygon geometry is available for review.' : 'No persisted boundary is available. Only recorded point evidence may be displayed.'}</p></div><div className="rounded-lg border p-4"><p className="font-medium text-foreground">Recorded area</p><p className="mt-1">{Number(parcel.areaSquareMeters ?? 0).toLocaleString()} m². Displayed map measurements are independent review aids and do not update this registered value.</p></div><div className="rounded-lg border p-4"><p className="font-medium text-foreground">Edit discipline</p><p className="mt-1">Map geometry is read-only. Boundary changes require the governed survey, evidence, review, and approval workflow.</p></div></CardContent></Card>
          <Card><CardHeader><CardTitle>Continue governed review</CardTitle></CardHeader><CardContent className="flex flex-col gap-3"><Button asChild><Link href={`/advanced-geospatial-center?parcelId=${parcelId}`}>Open advanced MapLibre and Lakehouse workbench</Link></Button><Button variant="outline" asChild><Link href={`/geolibre-workspace?parcelId=${parcelId}`}>Open GeoLibre companion session <ExternalLink className="ml-2 h-4 w-4" /></Link></Button><Button variant="outline" asChild><Link href={`/3d-visualization?parcelId=${parcelId}`}>Open governed CesiumJS 3D evidence <Box className="ml-2 h-4 w-4" /></Link></Button><div className="mt-2 flex items-start gap-2 rounded-lg border p-3 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />Authorized map resources are scoped to the authenticated user and parcel; source geometry and evidence status remain visible in the governed workflows.</div></CardContent></Card>
        </div>
      </main>
    </div>
  );
}
