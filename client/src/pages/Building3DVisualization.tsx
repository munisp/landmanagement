import { Link, useLocation } from 'wouter';
import { ArrowLeft, Box, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CesiumParcelViewer } from '@/components/CesiumParcelViewer';

function parcelIdFromLocation(location: string): number | null {
  const query = location.split('?')[1] ?? '';
  const value = Number(new URLSearchParams(query).get('parcelId'));
  return Number.isInteger(value) && value > 0 ? value : null;
}

export default function Building3DVisualization() {
  const [location] = useLocation();
  const parcelId = parcelIdFromLocation(location);
  const parcelQuery = trpc.parcels.getById.useQuery({ id: parcelId ?? 0 }, { enabled: parcelId !== null });

  if (!parcelId) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-6"><Card className="max-w-xl"><CardHeader><CardTitle>Governed 3D evidence requires a parcel</CardTitle><CardDescription>Open this view from a parcel or the Advanced Geospatial Center so the platform can discover only 3D assets authorized for that record.</CardDescription></CardHeader><CardContent><Button asChild><Link href="/advanced-geospatial-center">Open Advanced Geospatial Center</Link></Button></CardContent></Card></div>;
  }

  if (parcelQuery.isLoading) return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>;

  const parcel = parcelQuery.data;
  if (!parcel) {
    return <div className="flex min-h-screen items-center justify-center bg-background p-6"><Card><CardContent className="space-y-4 py-12 text-center"><p className="text-muted-foreground">Parcel not found or unavailable.</p><Button asChild><Link href="/advanced-geospatial-center">Open Advanced Geospatial Center</Link></Button></CardContent></Card></div>;
  }

  const locationLabel = parcel.streetAddress || [parcel.ward, parcel.lga, parcel.state].filter(Boolean).join(', ') || 'Recorded parcel location';

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card"><div className="container flex flex-wrap items-center justify-between gap-4 py-4"><Button variant="outline" asChild><Link href={`/parcels/${parcelId}/map`}><ArrowLeft className="mr-2 h-4 w-4" />Back to governed parcel map</Link></Button><div className="text-right"><p className="font-semibold">{parcel.parcelNumber ?? parcel.id}</p><p className="text-sm text-muted-foreground">{locationLabel}</p></div></div></header>
      <main className="container space-y-6 py-6">
        <div><h1 className="text-3xl font-bold">Governed CesiumJS 3D evidence</h1><p className="mt-2 max-w-3xl text-muted-foreground">This view loads only active, registered 3D Tiles assets authorized for this parcel. It intentionally does not generate a building, terrain, flood surface, or boundary from client-side defaults.</p></div>
        <Card><CardHeader><CardTitle><Box className="mr-2 inline h-4 w-4" />Authorized 3D asset review</CardTitle><CardDescription>Asset discovery and content delivery are bound to the authenticated user, parcel scope, evidence state, and short-lived capability.</CardDescription></CardHeader><CardContent><CesiumParcelViewer parcelId={parcelId} className="h-[700px] w-full rounded-xl border" /></CardContent></Card>
        <div className="grid gap-6 lg:grid-cols-2"><Card><CardHeader><CardTitle>Evidence boundaries</CardTitle></CardHeader><CardContent className="space-y-3 text-sm text-muted-foreground"><div className="flex gap-2 rounded-lg border p-3"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p>Only registered active 3D asset manifests are available. Direct object-store paths and asset capabilities are not exposed to the page or persisted by the browser.</p></div><div className="flex gap-2 rounded-lg border p-3"><TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><p>A visual asset is not a cadastral boundary, title, survey, engineering certification, terrain model, or regulatory finding unless its registered evidence metadata says otherwise.</p></div></CardContent></Card><Card><CardHeader><CardTitle>Continue review</CardTitle></CardHeader><CardContent className="flex flex-col gap-3"><Button asChild><Link href={`/advanced-geospatial-center?parcelId=${parcelId}`}>Open MapLibre and Lakehouse workbench</Link></Button><Button variant="outline" asChild><Link href={`/geolibre-workspace?parcelId=${parcelId}`}>Open GeoLibre companion session</Link></Button><p className="text-xs text-muted-foreground">Use the governed evidence and review workflows for any change, claim, or decision. This viewer intentionally has no synthetic edit, export, or building-model controls.</p></CardContent></Card></div>
      </main>
    </div>
  );
}
