import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { MapView } from "@/components/Map";
import { ArrowLeft, Loader2, MapPin, Maximize2, Ruler, Pencil, Layers } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";

function buildParcelBoundaries(parcel: any): google.maps.LatLngLiteral[] {
  const fromGeoJson = () => {
    if (!parcel?.geometryGeoJSON) return null;
    try {
      const parsed = JSON.parse(parcel.geometryGeoJSON);
      const coordinates = parsed?.type === 'Polygon'
        ? parsed.coordinates?.[0]
        : parsed?.type === 'MultiPolygon'
          ? parsed.coordinates?.[0]?.[0]
          : null;
      if (!Array.isArray(coordinates)) return null;
      const mapped = coordinates
        .map((coord: number[]) => Array.isArray(coord) && coord.length >= 2 ? { lat: Number(coord[1]), lng: Number(coord[0]) } : null)
        .filter(Boolean)
        .filter((coord: any) => Number.isFinite(coord.lat) && Number.isFinite(coord.lng));
      return mapped.length >= 3 ? mapped as google.maps.LatLngLiteral[] : null;
    } catch {
      return null;
    }
  };

  const fromBoundaryCoordinates = () => {
    if (!parcel?.boundaryCoordinates) return null;
    const mapped = String(parcel.boundaryCoordinates)
      .split(';')
      .map((pair: string) => pair.trim())
      .filter(Boolean)
      .map((pair: string) => {
        const [lat, lng] = pair.split(',').map(Number);
        return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
      })
      .filter(Boolean);
    return mapped.length >= 3 ? mapped as google.maps.LatLngLiteral[] : null;
  };

  const fromCentroid = () => {
    const lat = parcel?.coordinates?.lat;
    const lng = parcel?.coordinates?.lng;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const area = Math.max(Number(parcel?.areaSquareMeters || 400), 100);
    const offset = Math.sqrt(area) / 111000 / 2;
    return [
      { lat: lat + offset, lng: lng - offset },
      { lat: lat + offset, lng: lng + offset },
      { lat: lat - offset, lng: lng + offset },
      { lat: lat - offset, lng: lng - offset },
    ] as google.maps.LatLngLiteral[];
  };

  return fromGeoJson() || fromBoundaryCoordinates() || fromCentroid() || [];
}

export default function ParcelMap() {
  const { t } = useTranslation();
  const [, params] = useRoute("/parcels/:id/map");
  const parcelId = params?.id ? parseInt(params.id) : null;
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [polygon, setPolygon] = useState<google.maps.Polygon | null>(null);
  const [drawingManager, setDrawingManager] = useState<any>(null);
  const [mapType, setMapType] = useState<'roadmap' | 'satellite' | 'hybrid' | 'terrain'>('roadmap');
  const [measurements, setMeasurements] = useState<{ area?: number; distance?: number }>({});

  const { data: parcel, isLoading } = trpc.parcels.getById.useQuery(
    { id: parcelId! },
    { enabled: !!parcelId }
  );

  useEffect(() => {
    if (!map || !parcel) return;

    const google = (window as any).google;

    // Clear existing polygon
    if (polygon) {
      polygon.setMap(null);
    }

    const boundaries = buildParcelBoundaries(parcel);
    if (boundaries.length < 3) {
      toast.error(t('parcelMap.messages.geometryUnavailable', { defaultValue: 'Parcel geometry is unavailable for mapping.' }));
      return;
    }

    // Create polygon
    const newPolygon = new google.maps.Polygon({
      paths: boundaries,
      strokeColor: parcel.status === 'verified' ? '#10b981' : 
                   parcel.status === 'registered' ? '#3b82f6' : '#f59e0b',
      strokeOpacity: 0.8,
      strokeWeight: 3,
      fillColor: parcel.status === 'verified' ? '#10b981' : 
                 parcel.status === 'registered' ? '#3b82f6' : '#f59e0b',
      fillOpacity: 0.2,
      editable: true,
    });

    newPolygon.setMap(map);
    setPolygon(newPolygon);

    // Add marker at center
    const bounds = new google.maps.LatLngBounds();
    boundaries.forEach(coord => bounds.extend(coord));
    const center = bounds.getCenter();

    new google.maps.Marker({
      position: center,
      map: map,
      title: parcel.parcelNumber,
      icon: {
        path: google.maps.SymbolPath.CIRCLE,
        scale: 8,
        fillColor: parcel.status === 'verified' ? '#10b981' : 
                   parcel.status === 'registered' ? '#3b82f6' : '#f59e0b',
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
      },
    });

    // Fit map to polygon bounds
    map.fitBounds(bounds);

    // Add info window
    const infoWindow = new google.maps.InfoWindow({
      content: `
        <div style="padding: 8px; max-width: 250px;">
          <h3 style="margin: 0 0 8px 0; font-size: 14px; font-weight: 600;">${parcel.parcelNumber}</h3>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Address:</strong> ${parcel.streetAddress || 'N/A'}</p>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Area:</strong> ${parcel.areaSquareMeters?.toFixed(2)} m²</p>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Land Use:</strong> ${parcel.landUseType || 'N/A'}</p>
          <p style="margin: 4px 0; font-size: 12px;"><strong>Status:</strong> ${parcel.status?.replace('_', ' ')}</p>
        </div>
      `,
      position: center,
    });

    infoWindow.open(map);

    newPolygon.addListener('click', () => {
      infoWindow.open(map);
    });

    // Initialize drawing manager
    if (!drawingManager) {
      const manager = new google.maps.drawing.DrawingManager({
        drawingMode: null,
        drawingControl: true,
        drawingControlOptions: {
          position: google.maps.ControlPosition.TOP_CENTER,
          drawingModes: [
            google.maps.drawing.OverlayType.POLYGON,
            google.maps.drawing.OverlayType.POLYLINE,
          ],
        },
        polygonOptions: {
          fillColor: '#3b82f6',
          fillOpacity: 0.3,
          strokeWeight: 2,
          strokeColor: '#2563eb',
          editable: true,
        },
        polylineOptions: {
          strokeColor: '#ef4444',
          strokeWeight: 3,
        },
      });

      manager.setMap(map);
      setDrawingManager(manager);

      // Handle polygon complete event (area measurement)
      google.maps.event.addListener(manager, 'polygoncomplete', (drawnPolygon: any) => {
        const area = google.maps.geometry.spherical.computeArea(drawnPolygon.getPath());
        setMeasurements({ area });
        toast.success(`Area: ${area.toFixed(2)} m² (${(area / 10000).toFixed(4)} hectares)`);
      });

      // Handle polyline complete event (distance measurement)
      google.maps.event.addListener(manager, 'polylinecomplete', (polyline: any) => {
        const path = polyline.getPath();
        let distance = 0;
        for (let i = 0; i < path.getLength() - 1; i++) {
          distance += google.maps.geometry.spherical.computeDistanceBetween(
            path.getAt(i),
            path.getAt(i + 1)
          );
        }
        setMeasurements({ distance });
        toast.success(`Distance: ${distance.toFixed(2)} m (${(distance / 1000).toFixed(3)} km)`);
      });
    }

  }, [map, parcel]);

  // Update map type when changed
  useEffect(() => {
    if (map) {
      map.setMapTypeId(mapType);
    }
  }, [map, mapType]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!parcel) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">{t('parcelMap.states.notFound', { defaultValue: 'Parcel not found' })}</p>
            <Link href="/search">
              <Button className="mt-4">{t('parcelMap.actions.backToSearch', { defaultValue: 'Back to Search' })}</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <Link href={`/parcels/${parcelId}`}>
              <Button variant="ghost" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                {t('parcelMap.actions.backToDetails', { defaultValue: 'Back to Parcel Details' })}
              </Button>
            </Link>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-muted-foreground" />
                <Select value={mapType} onValueChange={(v: any) => setMapType(v)}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="roadmap">Roadmap</SelectItem>
                    <SelectItem value="satellite">Satellite</SelectItem>
                    <SelectItem value="hybrid">Hybrid</SelectItem>
                    <SelectItem value="terrain">Terrain</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="text-right">
                <h2 className="font-semibold">{parcel.parcelNumber}</h2>
                <p className="text-sm text-muted-foreground">{parcel.streetAddress || `${parcel.lga}, ${parcel.state}`}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Map Container */}
      <div className="flex-1 relative">
        <MapView
          onMapReady={(googleMap) => {
            setMap(googleMap);
          }}
          className="w-full h-full"
        />

        {/* Floating Info Panel */}
        <div className="absolute top-4 left-4 z-10 w-80">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{parcel.parcelNumber}</CardTitle>
                  <CardDescription className="flex items-center gap-2 mt-1">
                    <MapPin className="h-4 w-4" />
                    {parcel.streetAddress || `${parcel.lga}, ${parcel.state}`}
                  </CardDescription>
                </div>
                <Badge variant={
                  parcel.status === 'verified' ? 'default' :
                  parcel.status === 'registered' ? 'secondary' :
                  'outline'
                }>
                  {parcel.status?.replace('_', ' ')}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('parcelMap.labels.surveyPlan', { defaultValue: 'Survey Plan:' })}</span>
                  <p className="font-medium">{parcel.surveyPlanNumber}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('parcelMap.labels.area', { defaultValue: 'Area:' })}</span>
                  <p className="font-medium">{parcel.areaSquareMeters?.toFixed(2)} m² ({(parcel.areaSquareMeters! / 10000).toFixed(4)} hectares)</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('parcelMap.labels.landUse', { defaultValue: 'Land Use:' })}</span>
                  <p className="font-medium capitalize">{parcel.landUseType || 'N/A'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('parcelMap.labels.location', { defaultValue: 'Location:' })}</span>
                  <p className="font-medium">{parcel.state} State, {parcel.lga} LGA</p>
                  {parcel.ward && <p className="text-xs text-muted-foreground">{parcel.ward}</p>}
                </div>

                {measurements.area && (
                  <div className="pt-3 border-t">
                    <div className="flex items-center gap-2 text-blue-600">
                      <Ruler className="h-4 w-4" />
                      <div>
                                                  <p className="text-xs text-muted-foreground">{t('parcelMap.measurements.area', { defaultValue: 'Measured Area' })}</p>

                        <p className="font-semibold">{measurements.area.toFixed(2)} m²</p>
                      </div>
                    </div>
                  </div>
                )}

                {measurements.distance && (
                  <div className="pt-3 border-t">
                    <div className="flex items-center gap-2 text-red-600">
                      <Ruler className="h-4 w-4" />
                      <div>
                                                  <p className="text-xs text-muted-foreground">{t('parcelMap.measurements.distance', { defaultValue: 'Measured Distance' })}</p>

                        <p className="font-semibold">{measurements.distance.toFixed(2)} m</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t space-y-2">
                <Link href={`/parcels/${parcelId}`} className="block">
                  <Button variant="outline" size="sm" className="w-full gap-2">
                    <Maximize2 className="h-4 w-4" />
                    {t('parcelMap.actions.fullDetails', { defaultValue: 'Full Details' })}
                  </Button>
                </Link>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="w-full gap-2"
                  onClick={() => {
                    if (polygon) {
                      polygon.setEditable(!polygon.getEditable());
                      toast.info(polygon.getEditable()
                        ? t('parcelMap.messages.editingEnabled', { defaultValue: 'Boundary editing enabled' })
                        : t('parcelMap.messages.editingDisabled', { defaultValue: 'Boundary editing disabled' }));
                    }
                  }}
                >
                  <Pencil className="h-4 w-4" />
                  {t('parcelMap.actions.toggleEditMode', { defaultValue: 'Toggle Edit Mode' })}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Map Controls Legend */}
        <div className="absolute bottom-4 right-4 z-10">
          <Card className="p-4">
            <h4 className="font-semibold text-sm mb-2">{t('parcelMap.legend.title', { defaultValue: 'Legend' })}</h4>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-green-500 bg-green-500/20"></div>
                <span>{t('parcelMap.legend.verified', { defaultValue: 'Verified' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-blue-500 bg-blue-500/20"></div>
                <span>{t('parcelMap.legend.registered', { defaultValue: 'Registered' })}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded border-2 border-yellow-500 bg-yellow-500/20"></div>
                <span>{t('parcelMap.legend.pending', { defaultValue: 'Pending' })}</span>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t space-y-1 text-xs text-muted-foreground">
              <p>{t('parcelMap.legend.tipArea', { defaultValue: '• Use drawing tools to measure area' })}</p>
              <p>{t('parcelMap.legend.tipDistance', { defaultValue: '• Use polyline tool to measure distance' })}</p>
              <p>{t('parcelMap.legend.tipEdit', { defaultValue: '• Click boundary to toggle edit mode' })}</p>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
