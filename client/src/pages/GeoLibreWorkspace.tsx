import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { connect, type GeoLibreEmbedClient } from '@geolibre/embed';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Download, ExternalLink, Loader2, MapPinned, Radio, LocateFixed } from 'lucide-react';

type GeoLibreLaunchContext = {
  provider: string;
  baseUrl: string;
  launchUrl: string;
  embedMode: string;
  generatedAt: string;
  parcel: { id: number; parcelNumber: string; state: string; lga: string };
  nearbyParcels: Array<{ id: number; parcelNumber: string; distanceKm: number }>;
  exportBundle: {
    fileName: string;
    mimeType: string;
    featureCount: number;
    geojson: GeoJSON.FeatureCollection;
  };
  guidance?: { summary?: string };
};

type EmbedState = 'idle' | 'connecting' | 'ready' | 'error';

function addGeometryPositions(geometry: GeoJSON.Geometry, positions: [number, number][]) {
  if (geometry.type === 'Point') {
    positions.push(geometry.coordinates as [number, number]);
  } else if (geometry.type === 'MultiPoint' || geometry.type === 'LineString') {
    geometry.coordinates.forEach((coordinate) => positions.push(coordinate as [number, number]));
  } else if (geometry.type === 'MultiLineString' || geometry.type === 'Polygon') {
    geometry.coordinates.flat().forEach((coordinate) => positions.push(coordinate as [number, number]));
  } else if (geometry.type === 'MultiPolygon') {
    geometry.coordinates.flat(2).forEach((coordinate) => positions.push(coordinate as [number, number]));
  } else if (geometry.type === 'GeometryCollection') {
    geometry.geometries.forEach((child) => addGeometryPositions(child, positions));
  }
}

function featureCollectionBounds(featureCollection: GeoJSON.FeatureCollection): [number, number, number, number] | null {
  const positions: [number, number][] = [];
  featureCollection.features.forEach((feature) => {
    if (feature.geometry) addGeometryPositions(feature.geometry, positions);
  });
  const valid = positions.filter(([lng, lat]) => Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90);
  if (!valid.length) return null;
  return [
    Math.min(...valid.map(([lng]) => lng)),
    Math.min(...valid.map(([, lat]) => lat)),
    Math.max(...valid.map(([lng]) => lng)),
    Math.max(...valid.map(([, lat]) => lat)),
  ];
}

export default function GeoLibreWorkspace() {
  const [location] = useLocation();
  const routedParcelId = useMemo(() => {
    const value = Number(new URLSearchParams(location.split('?')[1] ?? '').get('parcelId'));
    return Number.isInteger(value) && value > 0 ? value : null;
  }, [location]);
  const [parcelIdInput, setParcelIdInput] = useState(() => String(routedParcelId ?? 1));
  const [activeParcelId, setActiveParcelId] = useState(() => routedParcelId ?? 1);
  const [embedState, setEmbedState] = useState<EmbedState>('idle');
  const [embedError, setEmbedError] = useState<string | null>(null);
  const [selectionSummary, setSelectionSummary] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const embedClientRef = useRef<GeoLibreEmbedClient | null>(null);

  useEffect(() => {
    if (routedParcelId !== null && routedParcelId !== activeParcelId) {
      setParcelIdInput(String(routedParcelId));
      setActiveParcelId(routedParcelId);
    }
  }, [activeParcelId, routedParcelId]);

  const launchQuery = trpc.geolibre.launchContext.useQuery(
    { parcelId: activeParcelId },
    { retry: false }
  );
  const launchContext = launchQuery.data as GeoLibreLaunchContext | undefined;
  const geojsonText = useMemo(() => launchContext ? JSON.stringify(launchContext.exportBundle.geojson, null, 2) : '', [launchContext]);
  const layerId = `landmanagement-parcel-context-${activeParcelId}`;

  useEffect(() => {
    const iframe = iframeRef.current;
    const bundle = launchContext?.exportBundle.geojson;
    const launchUrl = launchContext?.launchUrl;
    if (!iframe || !bundle || !launchUrl) return;

    let disposed = false;
    let unsubscribe: (() => void) | undefined;
    let client: GeoLibreEmbedClient | undefined;
    setEmbedState('connecting');
    setEmbedError(null);
    setSelectionSummary(null);

    void (async () => {
      const origin = new URL(launchUrl).origin;
      client = await connect(iframe, { origin, timeoutMs: 15_000, requestTimeoutMs: 15_000 });
      if (disposed) {
        client.disconnect();
        return;
      }
      embedClientRef.current = client;
      unsubscribe = client.on('selectionChanged', ({ featureIds }) => {
        setSelectionSummary(featureIds.length ? `${featureIds.length} GeoLibre feature${featureIds.length === 1 ? '' : 's'} selected` : 'GeoLibre selection cleared');
      });
      await client.addLayer({
        id: layerId,
        name: `Land-management parcel context: ${launchContext.parcel.parcelNumber}`,
        type: 'geojson',
        source: { type: 'geojson' },
        geojson: bundle,
        visible: true,
        opacity: 1,
        style: {
          type: 'categorized',
          colorField: 'role',
          paint: {
            'fill-color': ['match', ['get', 'role'], 'anchor', '#2563eb', '#10b981'],
            'fill-opacity': 0.22,
            'line-color': ['match', ['get', 'role'], 'anchor', '#1d4ed8', '#047857'],
            'line-width': 2,
          },
        },
      });
      const bounds = featureCollectionBounds(bundle);
      if (bounds) await client.setView({ bbox: bounds });
      if (!disposed) setEmbedState('ready');
    })().catch((error: unknown) => {
      if (disposed) return;
      embedClientRef.current = null;
      setEmbedState('error');
      setEmbedError(error instanceof Error ? error.message : 'The GeoLibre companion could not establish its authenticated embed session.');
    });

    return () => {
      disposed = true;
      unsubscribe?.();
      client?.disconnect();
      if (embedClientRef.current === client) embedClientRef.current = null;
    };
  }, [launchContext, layerId]);

  const handleDownload = () => {
    if (!launchContext) return;
    const blob = new Blob([geojsonText], { type: launchContext.exportBundle.mimeType || 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = launchContext.exportBundle.fileName || `parcel-${activeParcelId}.geojson`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const focusParcelInEmbed = async () => {
    if (!launchContext || !embedClientRef.current) return;
    const bounds = featureCollectionBounds(launchContext.exportBundle.geojson);
    if (!bounds) return;
    try {
      await embedClientRef.current.setView({ bbox: bounds });
      await embedClientRef.current.highlightFeature({ layerId, filter: { role: 'anchor' }, fit: true });
      setSelectionSummary(`Focused ${launchContext.parcel.parcelNumber} in GeoLibre`);
    } catch (error) {
      setEmbedError(error instanceof Error ? error.message : 'GeoLibre could not focus the selected parcel.');
    }
  };

  return (
    <div className="container space-y-6 py-8">
      <div className="flex items-center gap-3">
        <Button variant="outline" size="icon" asChild>
          <Link href="/advanced-geospatial-center"><ArrowLeft className="h-4 w-4" /></Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">GeoLibre Workspace</h1>
          <p className="mt-2 text-muted-foreground">A governed GeoLibre companion session for parcel review, comparison, and advanced client-side GIS exploration.</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
        <Card>
          <CardHeader>
            <CardTitle>GeoLibre launch controls</CardTitle>
            <CardDescription>Load a protected parcel context, synchronize it into the embedded companion, export GeoJSON, or open the same companion in a new tab.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Parcel ID</Label><Input value={parcelIdInput} onChange={(event) => setParcelIdInput(event.target.value)} inputMode="numeric" /></div>
              <div className="flex items-end"><Button className="w-full" onClick={() => { const next = Number(parcelIdInput); if (Number.isInteger(next) && next > 0) setActiveParcelId(next); }}>Load GeoLibre context</Button></div>
            </div>

            {launchQuery.isLoading ? <div className="flex items-center gap-2 rounded-lg border p-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading GeoLibre launch context…</div> : null}
            {launchQuery.error ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">{launchQuery.error.message}</div> : null}

            {launchContext ? <>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border p-4 text-sm"><p className="font-medium text-foreground">Provider</p><p className="mt-2 text-muted-foreground">{launchContext.provider}</p></div>
                <div className="rounded-lg border p-4 text-sm"><p className="font-medium text-foreground">Embed session</p><p className="mt-2 text-muted-foreground">{embedState === 'ready' ? 'Origin-verified and synchronized' : embedState === 'connecting' ? 'Connecting with origin verification…' : embedState === 'error' ? 'Connection unavailable' : launchContext.embedMode}</p></div>
              </div>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">Prepared parcel layer</p>
                <p className="mt-2">The protected bundle contains <strong>{launchContext.exportBundle.featureCount}</strong> persisted polygon features centered on <strong>{launchContext.parcel.parcelNumber}</strong>. The layer is sent to GeoLibre only after its origin-checked runtime session is ready.</p>
                <div className="mt-3 flex flex-wrap gap-2"><Badge variant="outline">GeoJSON provenance retained</Badge><Badge variant="outline">Runtime layer synchronization</Badge><Badge variant="outline">No fabricated geometry</Badge></div>
              </div>
              {selectionSummary ? <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground"><Radio className="h-4 w-4" />{selectionSummary}</div> : null}
              {embedError ? <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">{embedError}</div> : null}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleDownload}><Download className="mr-2 h-4 w-4" />Download GeoJSON bundle</Button>
                <Button variant="outline" onClick={() => void focusParcelInEmbed()} disabled={embedState !== 'ready'}><LocateFixed className="mr-2 h-4 w-4" />Focus anchor in companion</Button>
                <Button variant="outline" asChild><a href={launchContext.launchUrl} target="_blank" rel="noreferrer"><ExternalLink className="mr-2 h-4 w-4" />Open GeoLibre in new tab</a></Button>
              </div>
              <div className="rounded-lg border p-4 text-sm text-muted-foreground"><p className="font-medium text-foreground">Operator guidance</p><p className="mt-2">{launchContext.guidance?.summary ?? 'Use the companion map for review; keep authoritative edits and approval decisions in the governed land-management workflows.'}</p></div>
            </> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Embedded GeoLibre companion app</CardTitle><CardDescription>The companion uses an exact configured origin and communicates through GeoLibre’s acknowledged embed API.</CardDescription></CardHeader>
          <CardContent>
            {launchContext?.launchUrl ? <iframe key={`${activeParcelId}-${launchContext.generatedAt}`} ref={iframeRef} title="GeoLibre Workspace" src={launchContext.launchUrl} className="h-[560px] w-full rounded-xl border bg-background" loading="lazy" allow="fullscreen; geolocation" /> : <div className="flex h-[560px] items-center justify-center rounded-xl border text-sm text-muted-foreground">Load a parcel to initialize the GeoLibre workspace.</div>}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <Card>
          <CardHeader><CardTitle><MapPinned className="mr-2 inline h-4 w-4" />Parcel launch context</CardTitle><CardDescription>The current parcel and nearby context prepared for governed GeoLibre review.</CardDescription></CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <div className="rounded-lg border p-4"><p>{launchContext ? `${launchContext.parcel.parcelNumber} in ${launchContext.parcel.lga}, ${launchContext.parcel.state} is prepared for GeoLibre review with nearby persisted parcel context.` : 'No parcel context is loaded yet.'}</p></div>
            {(launchContext?.nearbyParcels ?? []).slice(0, 6).map((item) => <div key={item.id} className="flex items-center justify-between rounded-lg border p-3"><span>{item.parcelNumber}</span><Badge variant="outline">{item.distanceKm} km</Badge></div>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Prepared GeoJSON preview</CardTitle><CardDescription>A transparent preview of the exact context layer sent to the companion.</CardDescription></CardHeader>
          <CardContent><pre className="max-h-[420px] overflow-auto rounded-xl border bg-muted p-4 text-xs whitespace-pre-wrap">{geojsonText || 'Load a parcel to generate a GeoJSON export preview.'}</pre></CardContent>
        </Card>
      </div>
    </div>
  );
}
