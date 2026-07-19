import { useMemo, useState } from 'react';
import { Link } from 'wouter';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, ExternalLink, Loader2, MapPinned } from 'lucide-react';

export default function GeoLibreWorkspace() {
  const [parcelIdInput, setParcelIdInput] = useState('1');
  const [activeParcelId, setActiveParcelId] = useState(1);

  const launchQuery = trpc.geolibre.launchContext.useQuery(
    { parcelId: activeParcelId },
    { retry: false }
  );

  const launchContext = launchQuery.data as any;

  const geojsonText = useMemo(() => {
    if (!launchContext?.exportBundle?.geojson) return '';
    return JSON.stringify(launchContext.exportBundle.geojson, null, 2);
  }, [launchContext]);

  const handleDownload = () => {
    if (!launchContext?.exportBundle?.geojson) return;
    const blob = new Blob([geojsonText], { type: launchContext.exportBundle.mimeType || 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = launchContext.exportBundle.fileName || `parcel-${activeParcelId}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link href="/advanced-geospatial-center">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">GeoLibre Workspace</h1>
          <p className="mt-2 text-muted-foreground">
            This workspace integrates the upstream GeoLibre application as an advanced geospatial studio for parcel review, comparison, and GIS exploration.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>GeoLibre launch controls</CardTitle>
            <CardDescription>Load a parcel context, export the prepared GeoJSON bundle, and open the companion GeoLibre studio.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Parcel ID</Label>
                <Input value={parcelIdInput} onChange={(e) => setParcelIdInput(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button className="w-full" onClick={() => setActiveParcelId(Number(parcelIdInput) || 1)}>
                  Load GeoLibre context
                </Button>
              </div>
            </div>

            {launchQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading GeoLibre launch context…
              </div>
            ) : null}

            {launchContext ? (
              <>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium text-foreground">Provider</p>
                    <p className="mt-2 text-muted-foreground">{launchContext.provider}</p>
                  </div>
                  <div className="rounded-lg border p-4 text-sm">
                    <p className="font-medium text-foreground">Embed mode</p>
                    <p className="mt-2 text-muted-foreground">{launchContext.embedMode}</p>
                  </div>
                </div>

                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Prepared parcel bundle</p>
                  <p className="mt-2">
                    The current export package contains <strong>{launchContext.exportBundle?.featureCount ?? 0}</strong> features centered on parcel <strong>{launchContext.parcel?.parcelNumber ?? '—'}</strong>.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Badge variant="outline">GeoJSON export ready</Badge>
                    <Badge variant="outline">Nearby context included</Badge>
                    <Badge variant="outline">GeoLibre map-only launch</Badge>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <Button onClick={handleDownload}>
                    <Download className="mr-2 h-4 w-4" /> Download GeoJSON bundle
                  </Button>
                  <Button variant="outline" asChild>
                    <a href={launchContext.launchUrl} target="_blank" rel="noreferrer">
                      <ExternalLink className="mr-2 h-4 w-4" /> Open GeoLibre in new tab
                    </a>
                  </Button>
                </div>

                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  <p className="font-medium text-foreground">Operator guidance</p>
                  <p className="mt-2">{launchContext.guidance?.summary}</p>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Embedded GeoLibre companion app</CardTitle>
            <CardDescription>The iframe below targets the upstream GeoLibre application in map-only embed mode.</CardDescription>
          </CardHeader>
          <CardContent>
            {launchContext?.launchUrl ? (
              <iframe
                title="GeoLibre Workspace"
                src={launchContext.launchUrl}
                className="h-[560px] w-full rounded-xl border bg-background"
              />
            ) : (
              <div className="flex h-[560px] items-center justify-center rounded-xl border text-sm text-muted-foreground">
                Load a parcel context to initialize the GeoLibre workspace.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle><MapPinned className="mr-2 inline h-4 w-4" />Parcel launch context</CardTitle>
            <CardDescription>The current parcel and nearby context prepared for GeoLibre review.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border p-4">
              <p>
                {launchContext?.parcel
                  ? `${launchContext.parcel.parcelNumber} in ${launchContext.parcel.lga}, ${launchContext.parcel.state} is prepared for GeoLibre export with nearby parcel comparison context.`
                  : 'No parcel context is loaded yet.'}
              </p>
            </div>
            {(launchContext?.nearbyParcels ?? []).slice(0, 6).map((item: any) => (
              <div key={item.id} className="flex items-center justify-between rounded-lg border p-3">
                <span>{item.parcelNumber}</span>
                <Badge variant="outline">{item.distanceKm} km</Badge>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Prepared GeoJSON preview</CardTitle>
            <CardDescription>A preview of the generated GeoLibre context bundle.</CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="max-h-[420px] overflow-auto rounded-xl border bg-muted p-4 text-xs whitespace-pre-wrap">
              {geojsonText || 'Load a parcel to generate a GeoJSON export preview.'}
            </pre>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
