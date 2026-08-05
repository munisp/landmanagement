import { useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { trpc } from '@/lib/trpc';
import { MapLibreSearchMap, type SearchMapCenter } from './MapLibreSearchMap';
import { Search, X, Navigation2 } from 'lucide-react';
import { Link } from 'wouter';

export function GeospatialSearch() {
  const [searchCenter, setSearchCenter] = useState<SearchMapCenter>({ lat: 6.5244, lng: 3.3792 });
  const [radiusKm, setRadiusKm] = useState(5);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const { data: searchResults, refetch } = trpc.parcels.geospatialSearch.useQuery(
    { centerLat: searchCenter.lat, centerLng: searchCenter.lng, radiusKm },
    { enabled: false },
  );
  const results = hasSearched ? (searchResults?.parcels ?? []) : [];

  const handleSearch = async () => {
    setIsSearching(true);
    try { await refetch(); setHasSearched(true); } finally { setIsSearching(false); }
  };

  const handleUseCurrentLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (position) => setSearchCenter({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 },
    );
  };

  const clearSearch = () => setHasSearched(false);

  return (
    <div className="space-y-6">
      <Card><CardHeader><CardTitle>Governed geospatial search</CardTitle><CardDescription>Choose a search center by clicking the approved MapLibre basemap, then query recorded parcel locations. Search points are context, not inferred boundaries.</CardDescription></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-3"><div><Label htmlFor="latitude">Latitude</Label><Input id="latitude" type="number" step="any" min="-90" max="90" value={searchCenter.lat} onChange={(event) => setSearchCenter((center) => ({ ...center, lat: Number(event.target.value) }))} /></div><div><Label htmlFor="longitude">Longitude</Label><Input id="longitude" type="number" step="any" min="-180" max="180" value={searchCenter.lng} onChange={(event) => setSearchCenter((center) => ({ ...center, lng: Number(event.target.value) }))} /></div><div><Label htmlFor="radius">Radius (km)</Label><Input id="radius" type="number" min="0.1" max="100" step="0.5" value={radiusKm} onChange={(event) => setRadiusKm(Math.max(0.1, Math.min(100, Number(event.target.value) || 0.1)))} /></div></div><div className="mt-4 flex flex-wrap gap-2"><Button onClick={handleSearch} disabled={isSearching} className="gap-2"><Search className="h-4 w-4" />{isSearching ? 'Searching…' : 'Search'}</Button><Button variant="outline" onClick={handleUseCurrentLocation} className="gap-2"><Navigation2 className="h-4 w-4" />Use my location</Button>{results.length > 0 ? <Button variant="outline" onClick={clearSearch} className="gap-2"><X className="h-4 w-4" />Clear results</Button> : null}</div></CardContent></Card>
      <Card><CardContent className="p-0"><MapLibreSearchMap center={searchCenter} radiusKm={radiusKm} results={results} onCenterChange={setSearchCenter} className="h-[600px] rounded-lg" /></CardContent></Card>
      {hasSearched && results.length > 0 ? <Card><CardHeader><CardTitle>Search results</CardTitle><CardDescription>Found {searchResults?.total ?? results.length} parcel{(searchResults?.total ?? results.length) !== 1 ? 's' : ''} within {radiusKm} km.</CardDescription></CardHeader><CardContent><div className="space-y-3">{results.map((parcel: any) => <Link key={parcel.id} href={`/parcels/${parcel.id}`}><div className="cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent"><div className="mb-2 flex items-start justify-between"><div><h4 className="font-semibold">{parcel.parcelNumber}</h4><p className="text-sm text-muted-foreground">{parcel.streetAddress}</p></div><Badge variant={parcel.status === 'verified' ? 'default' : 'secondary'}>{parcel.status}</Badge></div><div className="grid grid-cols-3 gap-4 text-sm"><div><span className="text-muted-foreground">Distance:</span><p className="font-medium">{Number(parcel.distance ?? 0).toFixed(2)} km</p></div><div><span className="text-muted-foreground">Area:</span><p className="font-medium">{Number(parcel.areaSquareMeters ?? 0).toFixed(2)} m²</p></div><div><span className="text-muted-foreground">Type:</span><p className="font-medium capitalize">{parcel.landUseType ?? 'not classified'}</p></div></div></div></Link>)}</div></CardContent></Card> : null}
      {hasSearched && !isSearching && results.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">No recorded parcels were found within this search radius.</CardContent></Card> : null}
    </div>
  );
}
