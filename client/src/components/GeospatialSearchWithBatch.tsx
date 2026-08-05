import { useMemo, useState } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Badge } from './ui/badge';
import { Checkbox } from './ui/checkbox';
import { trpc } from '@/lib/trpc';
import { MapLibreSearchMap, type SearchMapCenter } from './MapLibreSearchMap';
import { MapPin, Search, X, Navigation2, Download, UserPlus, CheckCircle, Route } from 'lucide-react';
import { Link } from 'wouter';
import { toast } from 'sonner';

function parsedPosition(value: string): { lat: number; lng: number } | null {
  const [lat, lng] = value.split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}

function haversineDistance(a: string, b: string): number {
  const first = parsedPosition(a); const second = parsedPosition(b);
  if (!first || !second) return 0;
  const radians = (value: number) => value * Math.PI / 180;
  const deltaLat = radians(second.lat - first.lat); const deltaLng = radians(second.lng - first.lng);
  const h = Math.sin(deltaLat / 2) ** 2 + Math.cos(radians(first.lat)) * Math.cos(radians(second.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 6_371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function GeospatialSearchWithBatch() {
  const [searchCenter, setSearchCenter] = useState<SearchMapCenter>({ lat: 6.5244, lng: 3.3792 });
  const [radiusKm, setRadiusKm] = useState(5);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [selectedParcels, setSelectedParcels] = useState<Set<number>>(new Set());
  const [batchMode, setBatchMode] = useState(false);
  const [surveyorId, setSurveyorId] = useState('surveyor-1');
  const { data: searchResults, refetch } = trpc.parcels.geospatialSearch.useQuery({ centerLat: searchCenter.lat, centerLng: searchCenter.lng, radiusKm }, { enabled: false });
  const results = hasSearched ? (searchResults?.parcels ?? []) as any[] : [];
  const batchAssignMutation = trpc.parcels.batchAssign.useMutation({ onSuccess: (updated) => { toast.success(`Assigned ${updated.length} parcel${updated.length === 1 ? '' : 's'} to ${surveyorId}`); setSelectedParcels(new Set()); void refetch(); }, onError: (error) => toast.error(error.message) });
  const batchVerifyMutation = trpc.parcels.batchVerify.useMutation({ onSuccess: (updated) => { toast.success(`Verified ${updated.length} parcel${updated.length === 1 ? '' : 's'} successfully`); setSelectedParcels(new Set()); void refetch(); }, onError: (error) => toast.error(error.message) });
  const selectedResults = useMemo(() => results.filter((parcel) => selectedParcels.has(parcel.id)), [results, selectedParcels]);

  const handleSearch = async () => { setIsSearching(true); setSelectedParcels(new Set()); try { await refetch(); setHasSearched(true); } finally { setIsSearching(false); } };
  const toggleParcelSelection = (id: number) => setSelectedParcels((previous) => { const next = new Set(previous); next.has(id) ? next.delete(id) : next.add(id); return next; });
  const clearSearch = () => { setHasSearched(false); setSelectedParcels(new Set()); setBatchMode(false); };
  const exportToCSV = () => {
    if (!selectedResults.length) return toast.error('Please select parcels to export');
    const quote = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csv = [['Parcel Number', 'Address', 'Distance (km)', 'Area (m²)', 'Type', 'Status'], ...selectedResults.map((p) => [p.parcelNumber, p.streetAddress, Number(p.distance ?? 0).toFixed(2), Number(p.areaSquareMeters ?? 0).toFixed(2), p.landUseType, p.status])].map((row) => row.map(quote).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `governed-parcel-export-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url); toast.success(`Exported ${selectedResults.length} selected parcels`);
  };
  const calculateRoute = () => {
    if (selectedResults.length < 2) return toast.error('Select at least two parcels for an approximate route distance');
    const distance = selectedResults.slice(1).reduce((sum, parcel, index) => sum + haversineDistance(selectedResults[index].coordinates, parcel.coordinates), 0);
    toast.success(`Approximate straight-line distance: ${distance.toFixed(2)} km across ${selectedResults.length} parcels. Use the governed network analysis workflow for routing decisions.`);
  };
  const useCurrentLocation = () => navigator.geolocation ? navigator.geolocation.getCurrentPosition((position) => setSearchCenter({ lat: position.coords.latitude, lng: position.coords.longitude }), () => toast.error('Unable to get your location'), { enableHighAccuracy: true, timeout: 10_000, maximumAge: 60_000 }) : toast.error('Geolocation is not supported by this browser');

  return <div className="space-y-6">
    <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle className="flex items-center gap-2"><MapPin className="h-5 w-5" />Governed geospatial batch search</CardTitle><CardDescription>Search recorded parcel locations using the approved MapLibre basemap. Batch actions remain subject to the platform authorization and audit controls.</CardDescription></div><div className="flex items-center gap-2"><Checkbox id="batchMode" checked={batchMode} onCheckedChange={(checked) => { setBatchMode(Boolean(checked)); if (!checked) setSelectedParcels(new Set()); }} /><Label htmlFor="batchMode">Batch mode</Label></div></div></CardHeader><CardContent><div className="grid gap-4 md:grid-cols-3"><div><Label>Center latitude</Label><Input type="number" step="any" min="-90" max="90" value={searchCenter.lat} onChange={(event) => setSearchCenter((center) => ({ ...center, lat: Number(event.target.value) }))} /></div><div><Label>Center longitude</Label><Input type="number" step="any" min="-180" max="180" value={searchCenter.lng} onChange={(event) => setSearchCenter((center) => ({ ...center, lng: Number(event.target.value) }))} /></div><div><Label>Radius (km)</Label><Input type="number" min="0.1" max="100" step="0.5" value={radiusKm} onChange={(event) => setRadiusKm(Math.max(0.1, Math.min(100, Number(event.target.value) || 0.1)))} /></div></div><div className="mt-4 flex flex-wrap gap-2"><Button onClick={handleSearch} disabled={isSearching}><Search className="mr-2 h-4 w-4" />{isSearching ? 'Searching…' : 'Search'}</Button><Button variant="outline" onClick={useCurrentLocation}><Navigation2 className="mr-2 h-4 w-4" />Use my location</Button>{results.length ? <Button variant="outline" onClick={clearSearch}><X className="mr-2 h-4 w-4" />Clear results</Button> : null}</div></CardContent></Card>
    {batchMode && results.length ? <Card className="border-primary"><CardContent className="flex flex-wrap items-center justify-between gap-4 py-4"><div className="flex items-center gap-3"><span className="text-sm font-medium">{selectedParcels.size} of {results.length} selected</span><Button size="sm" variant="outline" onClick={() => setSelectedParcels(new Set(results.map((p) => p.id)))}>Select all</Button><Button size="sm" variant="outline" onClick={() => setSelectedParcels(new Set())}>Deselect all</Button></div><div className="flex flex-wrap items-center gap-2"><Input value={surveyorId} onChange={(event) => setSurveyorId(event.target.value)} className="h-8 w-32" /><Button size="sm" variant="outline" disabled={!selectedParcels.size || batchAssignMutation.isPending} onClick={() => batchAssignMutation.mutate({ parcelIds: [...selectedParcels], surveyorId })}><UserPlus className="mr-2 h-4 w-4" />Assign</Button><Button size="sm" variant="outline" disabled={!selectedParcels.size || batchVerifyMutation.isPending} onClick={() => batchVerifyMutation.mutate({ parcelIds: [...selectedParcels] })}><CheckCircle className="mr-2 h-4 w-4" />Verify</Button><Button size="sm" disabled={!selectedParcels.size} onClick={exportToCSV}><Download className="mr-2 h-4 w-4" />Export CSV</Button><Button size="sm" variant="outline" disabled={selectedParcels.size < 2} onClick={calculateRoute}><Route className="mr-2 h-4 w-4" />Approximate distance</Button></div></CardContent></Card> : null}
    <Card><CardContent className="p-0"><MapLibreSearchMap center={searchCenter} radiusKm={radiusKm} results={results} onCenterChange={setSearchCenter} className="h-[600px] rounded-lg" /></CardContent></Card>
    {hasSearched && results.length ? <Card><CardHeader><CardTitle>Search results</CardTitle><CardDescription>Found {searchResults?.total ?? results.length} parcel{(searchResults?.total ?? results.length) !== 1 ? 's' : ''} within {radiusKm} km.</CardDescription></CardHeader><CardContent><div className="space-y-3">{results.map((parcel) => <div key={parcel.id} className={`rounded-lg border p-4 ${selectedParcels.has(parcel.id) ? 'border-primary bg-primary/10' : 'hover:bg-accent'}`}><div className="flex items-start gap-3">{batchMode ? <Checkbox checked={selectedParcels.has(parcel.id)} onCheckedChange={() => toggleParcelSelection(parcel.id)} className="mt-1" /> : null}<Link href={`/parcels/${parcel.id}`} className="flex-1"><div className="mb-2 flex items-start justify-between"><div><h4 className="font-semibold">{parcel.parcelNumber}</h4><p className="text-sm text-muted-foreground">{parcel.streetAddress}</p></div><Badge variant={parcel.status === 'verified' ? 'default' : 'secondary'}>{parcel.status}</Badge></div><div className="grid grid-cols-3 gap-4 text-sm"><div><span className="text-muted-foreground">Distance:</span><p className="font-medium">{Number(parcel.distance ?? 0).toFixed(2)} km</p></div><div><span className="text-muted-foreground">Area:</span><p className="font-medium">{Number(parcel.areaSquareMeters ?? 0).toFixed(2)} m²</p></div><div><span className="text-muted-foreground">Type:</span><p className="font-medium capitalize">{parcel.landUseType ?? 'not classified'}</p></div></div></Link></div></div>)}</div></CardContent></Card> : null}
    {hasSearched && !isSearching && !results.length ? <Card><CardContent className="py-12 text-center text-muted-foreground"><MapPin className="mx-auto mb-4 h-12 w-12 opacity-50" /><p>No recorded parcels were found within {radiusKm} km of the search center.</p></CardContent></Card> : null}
  </div>;
}
