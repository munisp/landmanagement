/**
 * GeospatialSearchWithBatch Component
 * Enhanced geospatial search with batch selection and operations
 */

import { useMemo, useRef, useState } from 'react';
import { MapView } from './Map';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { trpc } from '@/lib/trpc';
import { MapPin, Search, X, Navigation2, Download, UserPlus, CheckCircle, Route } from 'lucide-react';
import { Link } from 'wouter';
import { toast } from 'sonner';

interface SelectedParcel {
  id: number;
  parcelNumber: string;
  coordinates: string;
  distance: number;
}

export function GeospatialSearchWithBatch() {
  const mapRef = useRef<google.maps.Map | null>(null);
  const [searchCenter, setSearchCenter] = useState<google.maps.LatLngLiteral>({ lat: 6.5244, lng: 3.3792 });
  const [radiusKm, setRadiusKm] = useState(5);
  const [isSearching, setIsSearching] = useState(false);
  const [centerMarker, setCenterMarker] = useState<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [radiusCircle, setRadiusCircle] = useState<google.maps.Circle | null>(null);
  const [resultMarkers, setResultMarkers] = useState<google.maps.marker.AdvancedMarkerElement[]>([]);
  const [selectedParcels, setSelectedParcels] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [surveyorId, setSurveyorId] = useState('surveyor-1');

  const batchAssignMutation = trpc.parcels.batchAssign.useMutation({
    onSuccess: (updated) => {
      toast.success(`Assigned ${updated.length} parcel${updated.length === 1 ? '' : 's'} to ${surveyorId}`);
      setSelectedParcels(new Set());
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const batchVerifyMutation = trpc.parcels.batchVerify.useMutation({
    onSuccess: (updated) => {
      toast.success(`Verified ${updated.length} parcel${updated.length === 1 ? '' : 's'} successfully`);
      setSelectedParcels(new Set());
      refetch();
    },
    onError: (error) => toast.error(error.message),
  });

  const { data: searchResults, refetch } = trpc.parcels.geospatialSearch.useQuery(
    {
      centerLat: searchCenter.lat,
      centerLng: searchCenter.lng,
      radiusKm,
    },
    { enabled: false }
  );

  const handleMapReady = (map: google.maps.Map) => {
    mapRef.current = map;

    map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (e.latLng && !batchMode) {
        const newCenter = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        setSearchCenter(newCenter);
        updateCenterMarker(map, newCenter);
      }
    });

    updateCenterMarker(map, searchCenter);
  };

  const updateCenterMarker = (map: google.maps.Map, center: google.maps.LatLngLiteral) => {
    if (centerMarker) {
      centerMarker.map = null;
    }

    const marker = new google.maps.marker.AdvancedMarkerElement({
      map,
      position: center,
      title: 'Search Center',
    });

    setCenterMarker(marker);
    map.setCenter(center);
    updateRadiusCircle(map, center, radiusKm);
  };

  const updateRadiusCircle = (map: google.maps.Map, center: google.maps.LatLngLiteral, radius: number) => {
    if (radiusCircle) {
      radiusCircle.setMap(null);
    }

    const circle = new google.maps.Circle({
      map,
      center,
      radius: radius * 1000,
      strokeColor: '#3b82f6',
      strokeOpacity: 0.8,
      strokeWeight: 2,
      fillColor: '#3b82f6',
      fillOpacity: 0.1,
    });

    setRadiusCircle(circle);

    const bounds = circle.getBounds();
    if (bounds) {
      map.fitBounds(bounds);
    }
  };

  const handleSearch = async () => {
    if (!mapRef.current) return;

    setIsSearching(true);
    resultMarkers.forEach(marker => {
      marker.map = null;
    });
    setResultMarkers([]);
    setSelectedParcels(new Set());

    updateRadiusCircle(mapRef.current, searchCenter, radiusKm);

    const result = await refetch();

    if (result.data && result.data.parcels) {
      const newMarkers = result.data.parcels.map((parcel: any) => {
        const [lat, lng] = parcel.coordinates.split(',').map(Number);
        const marker = new google.maps.marker.AdvancedMarkerElement({
          map: mapRef.current!,
          position: { lat, lng },
          title: parcel.parcelNumber,
        });

        marker.addListener('click', () => {
          if (batchMode) {
            toggleParcelSelection(parcel.id);
          } else {
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
          }
        });

        return marker;
      });

      setResultMarkers(newMarkers);
    }

    setIsSearching(false);
  };

  const toggleParcelSelection = (parcelId: number) => {
    setSelectedParcels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(parcelId)) {
        newSet.delete(parcelId);
      } else {
        newSet.add(parcelId);
      }
      return newSet;
    });
  };

  const selectAll = () => {
    if (searchResults) {
      setSelectedParcels(new Set(searchResults.parcels.map((p: any) => p.id)));
    }
  };

  const deselectAll = () => {
    setSelectedParcels(new Set());
  };

  const exportToCSV = () => {
    if (!searchResults || selectedParcels.size === 0) {
      toast.error('Please select parcels to export');
      return;
    }

    const selected = searchResults.parcels.filter((p: any) => selectedParcels.has(p.id));
    const csv = [
      ['Parcel Number', 'Address', 'Distance (km)', 'Area (m²)', 'Type', 'Status'],
      ...selected.map((p: any) => [
        p.parcelNumber,
        p.streetAddress,
        p.distance.toFixed(2),
        p.areaSquareMeters.toFixed(2),
        p.landUseType,
        p.status,
      ]),
    ].map(row => row.join(',')).join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `parcels-export-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    toast.success(`Exported ${selectedParcels.size} parcels to CSV`);
  };

  const selectedResults = useMemo(
    () => searchResults?.parcels.filter((p: any) => selectedParcels.has(p.id)) ?? [],
    [searchResults, selectedParcels]
  );

  const handleBatchAssign = () => {
    if (selectedParcels.size === 0) {
      toast.error('Select parcels to assign');
      return;
    }

    batchAssignMutation.mutate({
      parcelIds: Array.from(selectedParcels),
      surveyorId,
    });
  };

  const handleBatchVerify = () => {
    if (selectedParcels.size === 0) {
      toast.error('Select parcels to verify');
      return;
    }

    batchVerifyMutation.mutate({
      parcelIds: Array.from(selectedParcels),
    });
  };

  const calculateRoute = () => {
    if (!searchResults || selectedParcels.size < 2) {
      toast.error('Please select at least 2 parcels for route optimization');
      return;
    }

    const selected = searchResults.parcels.filter((p: any) => selectedParcels.has(p.id));
    
    // Calculate total distance using simple sum (in production, use Google Maps Distance Matrix API)
    const totalDistance = selected.reduce((sum: number, p: any, idx: number) => {
      if (idx === 0) return 0;
      const [lat1, lng1] = selected[idx - 1].coordinates.split(',').map(Number);
      const [lat2, lng2] = p.coordinates.split(',').map(Number);
      return sum + haversineDistance(lat1, lng1, lat2, lng2);
    }, 0);

    toast.success(`Route calculated: ${totalDistance.toFixed(2)} km total distance for ${selectedParcels.size} parcels`);
  };

  const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
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
          toast.error('Unable to get your location');
        }
      );
    } else {
      toast.error('Geolocation is not supported by your browser');
    }
  };

  const clearSearch = () => {
    resultMarkers.forEach(marker => {
      marker.map = null;
    });
    setResultMarkers([]);
    setSelectedParcels(new Set());
    setBatchMode(false);
  };

  return (
    <div className="space-y-6">
      {/* Search Controls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Geospatial Search with Batch Operations
              </CardTitle>
              <CardDescription>
                Find parcels within a radius. Enable batch mode to select multiple parcels for bulk operations.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="batchMode"
                checked={batchMode}
                onCheckedChange={(checked) => {
                  setBatchMode(checked as boolean);
                  if (!checked) {
                    setSelectedParcels(new Set());
                  }
                }}
              />
              <Label htmlFor="batchMode" className="cursor-pointer">
                Batch Mode
              </Label>
            </div>
          </div>
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

          <div className="flex gap-2 mt-4 flex-wrap">
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

      {/* Batch Operations Toolbar */}
      {batchMode && searchResults && searchResults.parcels.length > 0 && (
        <Card className="border-primary">
          <CardContent className="py-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <span className="text-sm font-medium">
                  {selectedParcels.size} of {searchResults.parcels.length} selected
                </span>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={selectAll}>
                    Select All
                  </Button>
                  <Button size="sm" variant="outline" onClick={deselectAll}>
                    Deselect All
                  </Button>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={surveyorId}
                  onChange={(event) => setSurveyorId(event.target.value)}
                  placeholder="surveyor-1"
                  className="h-8 w-32"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBatchAssign}
                  disabled={selectedParcels.size === 0 || batchAssignMutation.isPending}
                  className="gap-2"
                >
                  <UserPlus className="h-4 w-4" />
                  Assign
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleBatchVerify}
                  disabled={selectedParcels.size === 0 || batchVerifyMutation.isPending}
                  className="gap-2"
                >
                  <CheckCircle className="h-4 w-4" />
                  Verify
                </Button>
                <Button
                  size="sm"
                  onClick={exportToCSV}
                  disabled={selectedParcels.size === 0}
                  className="gap-2"
                >
                  <Download className="h-4 w-4" />
                  Export CSV
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={calculateRoute}
                  disabled={selectedParcels.size < 2}
                  className="gap-2"
                >
                  <Route className="h-4 w-4" />
                  Calculate Route
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
                <div
                  key={parcel.id}
                  className={`p-4 border rounded-lg transition-colors ${
                    selectedParcels.has(parcel.id) ? 'bg-primary/10 border-primary' : 'hover:bg-accent'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {batchMode && (
                      <Checkbox
                        checked={selectedParcels.has(parcel.id)}
                        onCheckedChange={() => toggleParcelSelection(parcel.id)}
                        className="mt-1"
                      />
                    )}
                    <Link href={`/parcels/${parcel.id}`} className="flex-1">
                      <div className="flex items-start justify-between mb-2">
                        <div>
                          <h4 className="font-semibold">{parcel.parcelNumber}</h4>
                          <p className="text-sm text-muted-foreground">{parcel.streetAddress}</p>
                          {selectedParcels.has(parcel.id) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              {parcel.surveyorId ? `Assigned to ${parcel.surveyorId}` : 'No surveyor assigned yet'}
                            </p>
                          )}
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
                    </Link>
                  </div>
                </div>
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
