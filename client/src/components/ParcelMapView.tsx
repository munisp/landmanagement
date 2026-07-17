/**
 * ParcelMapView Component
 * Displays parcel location with boundaries and nearby parcels
 */

import { useRef, useState } from 'react';
import { MapView } from './Map';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Layers, Navigation, ZoomIn, ZoomOut } from 'lucide-react';

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

export function ParcelMapView({ parcel }: ParcelMapViewProps) {
  const mapRef = useRef<google.maps.Map | null>(null);
  const [showSatellite, setShowSatellite] = useState(false);
  const [showNearbyParcels, setShowNearbyParcels] = useState(true);

  // Parse coordinates (format: "lat,lng" or GeoJSON)
  const getParcelCenter = (): google.maps.LatLngLiteral => {
    if (parcel.coordinates) {
      try {
        const coords = parcel.coordinates.split(',').map(c => parseFloat(c.trim()));
        if (coords.length === 2 && !isNaN(coords[0]) && !isNaN(coords[1])) {
          return { lat: coords[0], lng: coords[1] };
        }
      } catch (e) {
        console.error('Failed to parse parcel coordinates:', e);
      }
    }
    
    // Default to Nigeria center if no coordinates
    return { lat: 9.0820, lng: 8.6753 };
  };

  // Parse boundary coordinates (format: "lat1,lng1;lat2,lng2;..." or GeoJSON)
  const getBoundaryPath = (): google.maps.LatLngLiteral[] | null => {
    if (!parcel.boundaryCoordinates) return null;

    try {
      // Try parsing as semicolon-separated lat,lng pairs
      const points = parcel.boundaryCoordinates.split(';').map(point => {
        const [lat, lng] = point.split(',').map(c => parseFloat(c.trim()));
        return { lat, lng };
      });

      if (points.every(p => !isNaN(p.lat) && !isNaN(p.lng))) {
        return points;
      }
    } catch (e) {
      console.error('Failed to parse boundary coordinates:', e);
    }

    return null;
  };

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;

    const center = getParcelCenter();
    const boundaryPath = getBoundaryPath();

    // Add parcel marker
    new google.maps.marker.AdvancedMarkerElement({
      map,
      position: center,
      title: parcel.parcelNumber,
    });

    // Draw parcel boundary if available
    if (boundaryPath && boundaryPath.length > 0) {
      const parcelPolygon = new google.maps.Polygon({
        paths: boundaryPath,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        fillColor: '#3b82f6',
        fillOpacity: 0.2,
        map,
      });

      // Fit map to boundary
      const bounds = new google.maps.LatLngBounds();
      boundaryPath.forEach(point => bounds.extend(point));
      map.fitBounds(bounds);

      // Add info window on click
      parcelPolygon.addListener('click', () => {
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <h3 style="font-weight: bold; margin-bottom: 4px;">${parcel.parcelNumber}</h3>
              <p style="color: #666; font-size: 14px;">${parcel.streetAddress || `${parcel.lga}, ${parcel.state}`}</p>
              <p style="font-size: 14px; margin-top: 4px;">Area: ${parcel.areaSquareMeters?.toFixed(2)} m²</p>
            </div>
          `,
          position: center,
        });
        infoWindow.open(map);
      });
    }

    // Show nearby parcels (mock data - in production, fetch from API)
    if (showNearbyParcels) {
      addNearbyParcels(map, center);
    }
  };

  const addNearbyParcels = (map: google.maps.Map, center: google.maps.LatLngLiteral) => {
    // Mock nearby parcels (in production, fetch from tRPC)
    const nearbyParcels = [
      { lat: center.lat + 0.001, lng: center.lng + 0.001, number: 'PL-2024-002', status: 'verified' },
      { lat: center.lat - 0.001, lng: center.lng + 0.001, number: 'PL-2024-003', status: 'pending' },
      { lat: center.lat + 0.001, lng: center.lng - 0.001, number: 'PL-2024-004', status: 'verified' },
    ];

    nearbyParcels.forEach(nearby => {
      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: nearby.lat, lng: nearby.lng },
        title: nearby.number,
      });

      // Add click listener for nearby parcels
      marker.addListener('click', () => {
        const infoWindow = new google.maps.InfoWindow({
          content: `
            <div style="padding: 8px;">
              <h4 style="font-weight: bold; margin-bottom: 4px;">${nearby.number}</h4>
              <p style="color: #666; font-size: 14px;">Status: ${nearby.status}</p>
              <a href="/parcels/${nearby.number}" style="color: #3b82f6; font-size: 14px; text-decoration: none;">View Details →</a>
            </div>
          `,
          position: { lat: nearby.lat, lng: nearby.lng },
        });
        infoWindow.open(map);
      });
    });
  };

  const toggleMapType = () => {
    if (!mapRef.current) return;
    const newType = showSatellite ? 'roadmap' : 'satellite';
    mapRef.current.setMapTypeId(newType);
    setShowSatellite(!showSatellite);
  };

  const zoomIn = () => {
    if (!mapRef.current) return;
    const currentZoom = mapRef.current.getZoom() || 12;
    mapRef.current.setZoom(currentZoom + 1);
  };

  const zoomOut = () => {
    if (!mapRef.current) return;
    const currentZoom = mapRef.current.getZoom() || 12;
    mapRef.current.setZoom(currentZoom - 1);
  };

  const recenterMap = () => {
    if (!mapRef.current) return;
    mapRef.current.setCenter(getParcelCenter());
    mapRef.current.setZoom(15);
  };

  return (
    <div className="space-y-4">
      {/* Map Controls */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <Button
            variant={showSatellite ? 'default' : 'outline'}
            size="sm"
            onClick={toggleMapType}
            className="gap-2"
          >
            <Layers className="h-4 w-4" />
            {showSatellite ? 'Satellite' : 'Map'}
          </Button>
          <Button
            variant={showNearbyParcels ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowNearbyParcels(!showNearbyParcels)}
          >
            Nearby Parcels
          </Button>
        </div>

        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={zoomIn}>
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={zoomOut}>
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={recenterMap} className="gap-2">
            <Navigation className="h-4 w-4" />
            Recenter
          </Button>
        </div>
      </div>

      {/* Map */}
      <div className="relative">
        <MapView
          initialCenter={getParcelCenter()}
          initialZoom={15}
          onMapReady={handleMapReady}
          className="h-[600px] rounded-lg border"
        />

        {/* Map Legend */}
        <div className="absolute bottom-4 left-4 bg-white p-3 rounded-lg shadow-lg border">
          <h4 className="font-semibold text-sm mb-2">Legend</h4>
          <div className="space-y-1 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-blue-500 opacity-20 border-2 border-blue-500"></div>
              <span>Current Parcel</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-gray-300 rounded-full"></div>
              <span>Nearby Parcels</span>
            </div>
          </div>
        </div>

        {/* Parcel Info Overlay */}
        <div className="absolute top-4 right-4 bg-white p-4 rounded-lg shadow-lg border max-w-xs">
          <h4 className="font-semibold mb-2">{parcel.parcelNumber}</h4>
          <div className="space-y-1 text-sm">
            <p className="text-muted-foreground">{parcel.streetAddress || `${parcel.lga}, ${parcel.state}`}</p>
            {parcel.areaSquareMeters && (
              <p>
                <span className="font-medium">Area:</span> {parcel.areaSquareMeters.toFixed(2)} m²
              </p>
            )}
            {parcel.ward && (
              <p>
                <span className="font-medium">Ward:</span> {parcel.ward}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
