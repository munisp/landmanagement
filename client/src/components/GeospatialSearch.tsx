/**
 * GeospatialSearch Component
 * Interactive map-based parcel search with radius selector
 */

import { useState, useRef } from 'react';
import { MapView } from './Map';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { trpc } from '@/lib/trpc';
import { MapPin, Search, X, Navigation2 } from 'lucide-react';
import { Link } from 'wouter';

export function GeospatialSearch() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const [searchCenter, setSearchCenter] = useState<google.maps.LatLngLiteral>({ lat: 6.5244, lng: 3.3792 }); // Lagos, Nigeria
  const [radiusKm, setRadiusKm] = useState(5);
  const [isSearching, setIsSearching] = useState(false);
  const [centerMarker, setCenterMarker] = useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [radiusCircle, setRadiusCircle] = useState<google.maps.Circle | null>(null);
  const [resultMarkers, setResultMarkers] = useState<google.maps.marker.AdvancedMarkerElement[]>([]);

  const { data: searchResults, refetch } = trpc.parcels.geospatialSearch.useQuery(
    {
      centerLat: searchCenter.lat,
      centerLng: searchCenter.lng,
      radiusKm,
    },
    { enabled: false } // Manual trigger only
  );

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;

    // Add click listener to set search center
    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng) {
        const newCenter = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        setSearchCenter(newCenter);
        updateCenterMarker(map, newCenter);
      }
    });

    // Initialize center marker
    updateCenterMarker(map, searchCenter);
  };

  const updateCenterMarker = (map: google.maps.Map, center: google.maps.LatLngLiteral) => {
    // Remove old marker
    if (centerMarker) {
      centerMarker.map = null;
    }

    // Create new marker
    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: center,
      title: 'Search Center',
    });

    setCenterMarker(marker);
    map.setCenter(center);

    // Update radius circle
    updateRadiusCircle(map, center, radiusKm);
  };

  const updateRadiusCircle = (map: google.maps.Map, center: google.maps.LatLngLiteral, radius: number) => {
    // Remove old circle
    if (radiusCircle) {
      radiusCircle.setMap(null);
    }

    // Create new circle
    const circle = new google.maps.Circle({
      map,
      center,
      radius: radius * 1000, // Convert km to meters
      strokeColor: '#3b82f6',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
    });

    setRadiusCircle(circle);

    // Fit map to circle bounds
    const bounds = circle.getBounds();
    if (bounds) {
      map.fitBounds(bounds);
    }
  };

  const handleSearch = async () => {
    if (!mapRef.current) return;

    setIsSearching(true);

    // Clear previous result markers
    resultMarkers.forEach(marker => {
      marker.map = null;
    });
    setResultMarkers([]);

    // Update radius circle
    updateRadiusCircle(mapRef.current, searchCenter, radiusKm);

    // Perform search
    const result = await refetch();

    if (result.data && result.data.parcels) {
      // Add markers for results
      const newMarkers = result.data.parcels.map((parcel: any) => {
        const [lat, lng] = parcel.coordinates.split(',').map(Number);
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current!,
          position: { lat, lng },
          title: parcel.parcelNumber,
        });

        // Add click listener
        marker.addListener('click', () => {
          const infoWindow = new google.maps.InfoWindow({
            content: `
              <div style="padding: 8px; max-width: 250px;">
                <h3 style="font-weight: bold; margin-bottom: 4px;">${parcel.parcelNumber}</h3>
                <p style="color: #666; font-size: 14px; margin-bottom: 8px;">${parcel.streetAddress}</p>
                <p style="font-size: 14px; margin-bottom: 4px;"><strong>Distance:</strong> ${parcel.distance.toFixed(2)} km</p>
                <p style="font-size: 14px; margin-bottom: 4px;"><strong>Area:</strong> ${parcel.areaSquareMeters.toFixed(2)} m²</p>
                <p style="font-size: 14px; margin-bottom: 8px;"><strong>Type:</strong> ${parcel.landUseType}</p>
                <a href="/parcels/${parcel.id}" style="color: #3b82f6; font-size: 14px; text-decoration: none;">View Details →</a>
              </div>
            `,
            position: { lat, lng },
          });
          infoWindow.open(mapRef.current!);
        });

        return marker;
      });

      setResultMarkers(newMarkers);
    }

    setIsSearching(false);
  };

  const handleUseCurrentLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const newCenter = {
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          };
          setSearchCenter(newCenter);
          if (mapRef.current) {
            updateCenterMarker(mapRef.current, newCenter);
          }
        },
        (error) => {
          console.error('Error getting location:', error);
          alert('Unable to get your location. Please click on the map to set search center.');
        }
      );
    } else {
      alert('Geolocation is not supported by your browser.');
    }
  };

  const clearSearch = () => {
    // Clear result markers
    resultMarkers.forEach(marker => {
      marker.map = null;
    });
    setResultMarkers([]);
  };

  return (
    <div className="space-y-6">
      {/* Search Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Geospatial Search
          </CardTitle>
          <CardDescription>
            Find parcels within a radius of a location. Click on the map to set search center.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <Label htmlFor="centerLat">Center Latitude</Label>
              <Input
                id="centerLat"
                type="number"
                step="0.0001"
                value={searchCenter.lat}
                onChange={(e) => setSearchCenter({ ...searchCenter, lat: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="centerLng">Center Longitude</Label>
              <Input
                id="centerLng"
                type="number"
                step="0.0001"
                value={searchCenter.lng}
                onChange={(e) => setSearchCenter({ ...searchCenter, lng: parseFloat(e.target.value) })}
              />
            </div>
            <div>
              <Label htmlFor="radius">Radius (km)</Label>
              <Input
                id="radius"
                type="number"
                min="0.1"
                max="100"
                step="0.5"
                value={radiusKm}
                onChange={(e) => setRadiusKm(parseFloat(e.target.value))}
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <Button onClick={handleSearch} disabled={isSearching} className="gap-2">
              <Search className="h-4 w-4" />
              {isSearching ? 'Searching...' : 'Search'}
            </Button>
            <Button variant="outline" onClick={handleUseCurrentLocation} className="gap-2">
              <Navigation2 className="h-4 w-4" />
              Use My Location
            </Button>
            {resultMarkers.length > 0 && (
              <Button variant="outline" onClick={clearSearch} className="gap-2">
                <X className="h-4 w-4" />
                Clear Results
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Map */}
      <Card>
        <CardContent className="p-0">
          <MapView
            initialCenter={searchCenter}
            initialZoom={12}
            onMapReady={handleMapReady}
            className="h-[600px] rounded-lg"
          />
        </CardContent>
      </Card>

      {/* Results List */}
      {searchResults && searchResults.parcels.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Search Results</CardTitle>
            <CardDescription>
              Found {searchResults.total} parcel{searchResults.total !== 1 ? 's' : ''} within {radiusKm} km
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {searchResults.parcels.map((parcel: any) => (
                <Link key={parcel.id} href={`/parcels/${parcel.id}`}>
                  <div className="p-4 border rounded-lg hover:bg-accent transition-colors cursor-pointer">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <h4 className="font-semibold">{parcel.parcelNumber}</h4>
                        <p className="text-sm text-muted-foreground">{parcel.streetAddress}</p>
                      </div>
                      <Badge variant={parcel.status === 'verified' ? 'default' : 'secondary'}>
                        {parcel.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Distance:</span>
                        <p className="font-medium">{parcel.distance.toFixed(2)} km</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Area:</span>
                        <p className="font-medium">{parcel.areaSquareMeters.toFixed(2)} m²</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Type:</span>
                        <p className="font-medium capitalize">{parcel.landUseType}</p>
                      </div>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {searchResults && searchResults.parcels.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <MapPin className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No parcels found within {radiusKm} km of the search center.</p>
            <p className="text-sm mt-2">Try increasing the search radius or moving the search center.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
