import { useEffect, useMemo, useRef, useState } from 'react';
import { Cesium3DTileset, EllipsoidTerrainProvider, Resource, Viewer } from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import { trpc } from '@/lib/trpc';

if (typeof window !== 'undefined') {
  (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = '/cesium';
}

type CesiumAsset = {
  assetKey: string;
  parcelId: number | null;
  assetKind: string;
  evidenceStatus: 'verified' | 'provisional' | 'insufficient_evidence' | 'rejected';
  processingVersion: string;
  provenance: Record<string, unknown>;
  limitations: unknown;
  updatedAt: Date | string;
};

export function CesiumParcelViewer({ parcelId, className }: { parcelId?: number; className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [selectedAssetKey, setSelectedAssetKey] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [viewerError, setViewerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const assetsQuery = trpc.geospatialDelivery.listCesiumAssets.useQuery(
    { parcelIds: parcelId ? [parcelId] : [1] },
    { enabled: Boolean(parcelId), retry: false },
  );
  const issueCapability = trpc.geospatialDelivery.issueCesiumAssetCapability.useMutation();
  const assets = (assetsQuery.data ?? []) as CesiumAsset[];
  const selectedAsset = useMemo(
    () => assets.find((asset) => asset.assetKey === selectedAssetKey) ?? assets[0] ?? null,
    [assets, selectedAssetKey],
  );

  useEffect(() => {
    if (assets.length && !assets.some((asset) => asset.assetKey === selectedAssetKey)) {
      setSelectedAssetKey(assets[0]!.assetKey);
    }
    if (!assets.length) setSelectedAssetKey(null);
  }, [assets, selectedAssetKey]);

  useEffect(() => {
    if (!containerRef.current || viewerRef.current) return;
    const viewer = new Viewer(containerRef.current, {
      animation: false,
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      homeButton: true,
      infoBox: false,
      navigationHelpButton: true,
      sceneModePicker: true,
      selectionIndicator: false,
      timeline: false,
      terrainProvider: new EllipsoidTerrainProvider(),
      fullscreenButton: false,
    });
    viewer.scene.globe.show = true;
    viewer.scene.requestRenderMode = true;
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || !selectedAsset || !parcelId) return;
    let cancelled = false;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let tileset: Cesium3DTileset | undefined;

    const load = async () => {
      setLoading(true);
      setViewerError(null);
      try {
        const issued = await issueCapability.mutateAsync({
          assetKey: selectedAsset.assetKey,
          parcelIds: [parcelId],
          purpose: 'cesium.parcel-review',
        });
        if (cancelled) return;
        const resource = new Resource({
          url: issued.endpoint,
          headers: { 'X-Geospatial-Capability': `Bearer ${issued.capability}` },
          retryAttempts: 0,
        });
        tileset = await Cesium3DTileset.fromUrl(resource, {
          maximumScreenSpaceError: 16,
          dynamicScreenSpaceError: true,
        });
        if (cancelled) {
          tileset.destroy();
          return;
        }
        viewer.scene.primitives.removeAll();
        viewer.scene.primitives.add(tileset);
        await viewer.zoomTo(tileset);
        viewer.scene.requestRender();
        const refreshAt = Math.max(5_000, new Date(issued.expiresAt).getTime() - Date.now() - 30_000);
        refreshTimer = setTimeout(() => setReloadNonce((value) => value + 1), refreshAt);
      } catch {
        if (!cancelled) {
          setViewerError('The authorized 3D asset could not be loaded. Confirm that the asset is registered, active, and available from the governed delivery service.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
      if (refreshTimer) clearTimeout(refreshTimer);
      if (tileset && !tileset.isDestroyed()) viewer.scene.primitives.remove(tileset);
    };
  }, [issueCapability, parcelId, reloadNonce, selectedAsset]);

  return (
    <div className="relative">
      <div ref={containerRef} className={className ?? 'h-[460px] w-full rounded-xl border'} />
      <div className="absolute left-3 top-3 max-w-md rounded-md bg-background/95 p-3 text-xs shadow">
        <p className="font-medium text-foreground">CesiumJS governed 3D review</p>
        {assets.length > 1 ? (
          <label className="mt-2 block text-muted-foreground">
            Authorized asset
            <select
              className="mt-1 block w-full rounded border bg-background p-1 text-foreground"
              value={selectedAsset?.assetKey ?? ''}
              onChange={(event) => setSelectedAssetKey(event.target.value)}
            >
              {assets.map((asset) => <option key={asset.assetKey} value={asset.assetKey}>{asset.assetKey}</option>)}
            </select>
          </label>
        ) : null}
        {selectedAsset ? <p className="mt-2 text-muted-foreground">Evidence state: <span className="font-medium text-foreground">{selectedAsset.evidenceStatus}</span>; processor: {selectedAsset.processingVersion}.</p> : null}
        <p className="mt-2 text-muted-foreground">This visual product is not a cadastral boundary, survey, legal title, engineering model, or regulatory certification.</p>
      </div>
      {assetsQuery.isLoading || loading ? <p className="absolute bottom-3 left-3 rounded-md bg-background/95 p-2 text-xs text-muted-foreground shadow">Loading governed 3D evidence…</p> : null}
      {assetsQuery.isError ? <p className="absolute bottom-3 left-3 right-3 rounded-md bg-destructive/95 p-2 text-xs text-destructive-foreground">3D asset discovery was denied or is unavailable for this parcel.</p> : null}
      {!assetsQuery.isLoading && !assets.length && !assetsQuery.isError ? <p className="absolute bottom-3 left-3 right-3 rounded-md bg-background/95 p-2 text-xs text-muted-foreground shadow">No authorized, active 3D asset is registered for this parcel.</p> : null}
      {viewerError ? <p className="absolute bottom-3 left-3 right-3 rounded-md bg-destructive/95 p-2 text-xs text-destructive-foreground">{viewerError}</p> : null}
    </div>
  );
}
