import { useEffect, useMemo, useRef, useState } from "react";
import { Cartesian3, Color, ColorMaterialProperty, ConstantProperty, EllipsoidTerrainProvider, GeoJsonDataSource, Viewer } from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";
import { AlertTriangle, CloudLightning, Clock3, Globe2, Loader2, Radio, RefreshCw, ShieldCheck, Waves } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

if (typeof window !== "undefined") {
  (window as Window & { CESIUM_BASE_URL?: string }).CESIUM_BASE_URL = "/cesium";
}

type ContextLayer = {
  key: string;
  kind: "seismic" | "weather_alert";
  displayName: string;
  description: string;
  sourceName: string;
  attribution: string;
  refreshSeconds: number;
  userEnabled: boolean;
};

type ContextFeature = {
  type: "Feature";
  id?: string;
  geometry: { type: string; coordinates: unknown };
  properties: {
    layerKey?: string;
    sourceObservedAt?: string;
    sourceUpdatedAt?: string | null;
    expiresAt?: string | null;
    severity?: string | null;
    urgency?: string | null;
    qualityState?: string;
    sourceName?: string;
    place?: string | null;
    event?: string | null;
    headline?: string | null;
    mag?: number | null;
  };
};

type ContextGeoJson = {
  type: "FeatureCollection";
  features: ContextFeature[];
};

type WindowHours = 1 | 24 | 168 | 720;

const TIME_WINDOWS: Array<{ hours: WindowHours; label: string }> = [
  { hours: 1, label: "1 hour" },
  { hours: 24, label: "24 hours" },
  { hours: 168, label: "7 days" },
  { hours: 720, label: "30 days" },
];

function temporalWindow(hours: WindowHours) {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

function formatObservedAt(value?: string) {
  if (!value) return "Time unavailable";
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? date.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Time unavailable";
}

function featureLabel(feature: ContextFeature) {
  const { layerKey, mag, place, event, headline } = feature.properties;
  if (layerKey === "seismic") return `M${typeof mag === "number" ? mag.toFixed(1) : "?"} · ${place || "Earthquake"}`;
  return headline || event || "Weather alert";
}

function styleGeoJson(source: GeoJsonDataSource) {
  for (const entity of source.entities.values) {
    const layerKey = String(entity.properties?.layerKey?.getValue() ?? "");
    if (entity.point) {
      entity.point.color = new ConstantProperty(layerKey === "seismic" ? Color.fromCssColorString("#ef4444") : Color.fromCssColorString("#f59e0b"));
      entity.point.pixelSize = new ConstantProperty(layerKey === "seismic" ? 10 : 8);
      entity.point.outlineColor = new ConstantProperty(Color.WHITE);
      entity.point.outlineWidth = new ConstantProperty(2);
    }
    if (entity.billboard) {
      entity.billboard.color = new ConstantProperty(layerKey === "seismic" ? Color.fromCssColorString("#ef4444") : Color.fromCssColorString("#f59e0b"));
      entity.billboard.scale = new ConstantProperty(0.75);
    }
    if (entity.polygon) {
      const color = layerKey === "weather-alerts" ? Color.fromCssColorString("#f59e0b") : Color.fromCssColorString("#ef4444");
      entity.polygon.material = new ColorMaterialProperty(color.withAlpha(0.28));
      entity.polygon.outline = new ConstantProperty(true);
      entity.polygon.outlineColor = new ConstantProperty(color);
    }
    if (entity.polyline) {
      entity.polyline.material = new ColorMaterialProperty((layerKey === "weather-alerts" ? Color.fromCssColorString("#f59e0b") : Color.fromCssColorString("#ef4444")).withAlpha(0.9));
      entity.polyline.width = new ConstantProperty(2);
    }
  }
}

export function ContextGlobeViewer({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<Viewer | null>(null);
  const [windowHours, setWindowHours] = useState<WindowHours>(24);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [features, setFeatures] = useState<ContextFeature[]>([]);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [isLoadingEvents, setIsLoadingEvents] = useState(false);
  const utils = trpc.useUtils();

  const layersQuery = trpc.contextGlobe.listLayers.useQuery(undefined, {
    staleTime: 30_000,
    refetchInterval: 60_000,
    retry: false,
  });
  const issueCapability = trpc.contextGlobe.issueCapability.useMutation();
  const setLayerEnabled = trpc.contextGlobe.setLayerEnabled.useMutation({
    onSuccess: async () => {
      await utils.contextGlobe.listLayers.invalidate();
    },
    onError: (error) => toast.error(error.message || "Layer preference could not be saved."),
  });

  const layers = (layersQuery.data ?? []) as ContextLayer[];
  const enabledLayerKeys = useMemo(
    () => layers.filter((layer) => layer.userEnabled).map((layer) => layer.key).sort(),
    [layers],
  );
  const window = useMemo(() => temporalWindow(windowHours), [windowHours, refreshNonce]);

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
    viewer.scene.globe.baseColor = Color.fromCssColorString("#12233a");
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(0, 20, 20_000_000) });
    viewerRef.current = viewer;
    return () => {
      viewer.destroy();
      viewerRef.current = null;
    };
  }, []);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    let cancelled = false;
    let loadedSource: GeoJsonDataSource | undefined;
    let capabilityTimer: ReturnType<typeof setTimeout> | undefined;

    const clearContextData = () => {
      if (loadedSource && viewer.dataSources.contains(loadedSource)) viewer.dataSources.remove(loadedSource, true);
      loadedSource = undefined;
    };

    const load = async () => {
      clearContextData();
      setDeliveryError(null);
      if (!enabledLayerKeys.length) {
        setFeatures([]);
        viewer.scene.requestRender();
        return;
      }
      setIsLoadingEvents(true);
      try {
        const issued = await issueCapability.mutateAsync({
          audience: "context_tiles",
          layerKeys: enabledLayerKeys,
          purpose: "pwa.context-globe.read-only-view",
          ttlSeconds: 300,
        });
        const params = new URLSearchParams({
          layers: enabledLayerKeys.join(","),
          start: window.start,
          end: window.end,
        });
        const response = await fetch(`${issued.endpoint}?${params.toString()}`, {
          credentials: "include",
          headers: { "X-Context-Capability": `Bearer ${issued.capability}`, Accept: "application/geo+json" },
        });
        if (!response.ok) throw new Error(`Context delivery returned ${response.status}`);
        const body = (await response.json()) as ContextGeoJson;
        if (body.type !== "FeatureCollection" || !Array.isArray(body.features)) throw new Error("Context delivery returned an invalid GeoJSON collection");
        if (cancelled) return;
        const source = await GeoJsonDataSource.load(body, { clampToGround: true });
        if (cancelled) {
          source.entities.removeAll();
          return;
        }
        styleGeoJson(source);
        viewer.dataSources.add(source);
        loadedSource = source;
        setFeatures(body.features.slice(0, 12));
        if (source.entities.values.length) await viewer.flyTo(source, { duration: 0.8 });
        viewer.scene.requestRender();
        const delay = Math.max(30_000, new Date(issued.expiresAt).getTime() - Date.now() - 30_000);
        capabilityTimer = setTimeout(() => setRefreshNonce((value) => value + 1), delay);
      } catch {
        if (!cancelled) {
          setFeatures([]);
          setDeliveryError("Live public-context data is unavailable. No upstream provider was contacted directly by this browser.");
        }
      } finally {
        if (!cancelled) setIsLoadingEvents(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (capabilityTimer) clearTimeout(capabilityTimer);
      clearContextData();
    };
  }, [enabledLayerKeys, issueCapability, refreshNonce, window.end, window.start]);

  const toggleLayer = (layer: ContextLayer) => {
    setLayerEnabled.mutate({ layerKey: layer.key, enabled: !layer.userEnabled });
  };

  return (
    <div className={cn("grid gap-4 xl:grid-cols-[300px_minmax(0,1fr)_330px]", className)}>
      <Card className="order-2 border-slate-200 bg-slate-950 text-slate-100 xl:order-1">
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-sky-300"><Radio className="h-4 w-4" /> Context layers</div>
            <p className="mt-2 text-sm leading-6 text-slate-300">Select the approved public-context layers shown in this personal, read-only view.</p>
          </div>
          {layersQuery.isLoading ? <div className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> Loading layer policy…</div> : null}
          {layersQuery.isError ? <p className="rounded-md bg-red-950/60 p-3 text-sm text-red-200">Layer policy is unavailable for this signed-in user.</p> : null}
          <div className="space-y-3">
            {layers.map((layer) => {
              const seismic = layer.key === "seismic";
              return (
                <button
                  key={layer.key}
                  type="button"
                  onClick={() => toggleLayer(layer)}
                  disabled={setLayerEnabled.isPending}
                  className={cn("w-full rounded-xl border p-3 text-left transition duration-150 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300", layer.userEnabled ? "border-sky-400/60 bg-slate-800" : "border-slate-700 bg-slate-900/60 opacity-75")}
                  aria-pressed={layer.userEnabled}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 gap-2"><span className={cn("mt-0.5 rounded-full p-1.5", seismic ? "bg-red-500/20 text-red-300" : "bg-amber-400/20 text-amber-200")}>{seismic ? <Waves className="h-4 w-4" /> : <CloudLightning className="h-4 w-4" />}</span><span className="min-w-0"><span className="block font-medium text-white">{layer.displayName}</span><span className="mt-1 block text-xs leading-5 text-slate-400">Refreshes up to every {layer.refreshSeconds}s</span></span></div>
                    <span className={cn("rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide", layer.userEnabled ? "bg-sky-300 text-slate-950" : "bg-slate-700 text-slate-300")}>{layer.userEnabled ? "Shown" : "Hidden"}</span>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="border-t border-slate-700 pt-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Time window</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {TIME_WINDOWS.map((option) => <Button key={option.hours} type="button" variant={windowHours === option.hours ? "default" : "outline"} className={cn("h-9 text-xs", windowHours !== option.hours && "border-slate-600 bg-transparent text-slate-200 hover:bg-slate-800 hover:text-white")} onClick={() => setWindowHours(option.hours)}>{option.label}</Button>)}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="order-1 min-h-[560px] overflow-hidden rounded-2xl border border-slate-700 bg-slate-950 shadow-2xl xl:order-2">
        <div ref={containerRef} className="h-[min(72vh,760px)] min-h-[560px] w-full" />
        <div className="pointer-events-none absolute" />
        <div className="relative -mt-[min(72vh,760px)] min-h-[560px] p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="max-w-md rounded-xl border border-sky-300/25 bg-slate-950/90 p-3 text-slate-100 shadow-lg backdrop-blur">
              <div className="flex items-center gap-2 text-sm font-semibold"><Globe2 className="h-4 w-4 text-sky-300" /> Live public context</div>
              <p className="mt-1 text-xs leading-5 text-slate-300">{enabledLayerKeys.length ? `${enabledLayerKeys.length} selected layer${enabledLayerKeys.length === 1 ? "" : "s"} · ${windowHours === 1 ? "last hour" : `last ${windowHours / 24 >= 1 ? `${windowHours / 24} day${windowHours / 24 === 1 ? "" : "s"}` : `${windowHours} hours`}`}` : "Select a layer to request a scoped view."}</p>
            </div>
            <Button type="button" size="sm" variant="secondary" onClick={() => setRefreshNonce((value) => value + 1)} disabled={isLoadingEvents} className="bg-slate-50 text-slate-950 hover:bg-sky-100"><RefreshCw className={cn("mr-2 h-4 w-4", isLoadingEvents && "animate-spin")} /> Refresh</Button>
          </div>
          <div className="mt-auto flex min-h-[435px] items-end">
            <div className="max-w-xl rounded-xl border border-amber-300/30 bg-amber-950/90 p-3 text-xs leading-5 text-amber-100 shadow-lg backdrop-blur">
              <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" /><p><strong>Situational awareness only.</strong> Public earthquake and weather alerts are not parcel evidence, a site safety assessment, a forecast, an emergency instruction, a legal determination, or an authorization to change platform records.</p></div>
            </div>
          </div>
        </div>
      </div>

      <Card className="order-3">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-center gap-2"><Clock3 className="h-4 w-4 text-primary" /><h2 className="font-semibold">Current observations</h2></div>
          {isLoadingEvents ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Requesting signed delivery…</div> : null}
          {deliveryError ? <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{deliveryError}</p> : null}
          {!isLoadingEvents && !deliveryError && enabledLayerKeys.length === 0 ? <p className="text-sm leading-6 text-muted-foreground">No layers are selected. Layer choices are saved to your user policy and can be changed at any time.</p> : null}
          {!isLoadingEvents && !deliveryError && enabledLayerKeys.length > 0 && !features.length ? <p className="text-sm leading-6 text-muted-foreground">No active approved public-context events were returned for the selected window.</p> : null}
          <div className="space-y-3">
            {features.map((feature, index) => <div key={feature.id ?? `${feature.properties.layerKey}-${index}`} className="rounded-lg border bg-muted/30 p-3"><div className="flex items-start justify-between gap-3"><p className="text-sm font-medium leading-5">{featureLabel(feature)}</p><span className={cn("shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold uppercase", feature.properties.layerKey === "seismic" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800")}>{feature.properties.layerKey === "seismic" ? "Seismic" : "Weather"}</span></div><p className="mt-1 text-xs text-muted-foreground">Observed {formatObservedAt(feature.properties.sourceObservedAt)}</p>{feature.properties.severity ? <p className="mt-1 text-xs text-muted-foreground">Severity: {feature.properties.severity}{feature.properties.urgency ? ` · Urgency: ${feature.properties.urgency}` : ""}</p> : null}</div>)}
          </div>
          <div className="border-t pt-4 text-xs leading-5 text-muted-foreground"><div className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /><p>Delivery is tenant-scoped, short-lived, and same-origin. Capabilities are not persisted in browser storage.</p></div><p className="mt-3 font-medium text-foreground">Attribution</p>{layers.filter((layer) => layer.userEnabled).map((layer) => <p key={layer.key} className="mt-1">{layer.displayName}: {layer.attribution}</p>)}</div>
        </CardContent>
      </Card>
    </div>
  );
}
