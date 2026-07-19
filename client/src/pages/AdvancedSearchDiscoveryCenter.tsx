import { useMemo, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Search, Sparkles, Filter, Bookmark } from 'lucide-react';

export default function AdvancedSearchDiscoveryCenter() {
  const [query, setQuery] = useState('high-value residential parcels near verified titles');
  const [persona, setPersona] = useState('registrar');
  const [stateFilter, setStateFilter] = useState('Lagos');
  const [landUseFilter, setLandUseFilter] = useState('residential');

  const { data: suggestions } = trpc.search.autocomplete.useQuery({ query: query.length >= 2 ? query : 'la', type: 'all' });
  const { data: parcelResults } = trpc.search.searchParcels.useQuery({ query, filters: { state: stateFilter, landUse: landUseFilter }, page: 1, pageSize: 10 });

  const semanticPrompt = useMemo(() => {
    if (persona === 'registrar') return 'Prioritize verified parcels, recent transaction history, and clear title context.';
    if (persona === 'surveyor') return 'Prioritize boundary relevance, parcel proximity, and geospatial context.';
    return 'Prioritize operational relevance, clear owner context, and workflow urgency.';
  }, [persona]);

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Advanced Search & Discovery Center</h1>
        <p className="text-muted-foreground mt-2">Coordinate autocomplete, fuzzy search, faceted filtering, saved-search style recovery, search analytics cues, and persona-guided discovery from one search workspace.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Suggestions</p><p className="mt-2 text-2xl font-semibold">{suggestions?.length ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Matched parcels</p><p className="mt-2 text-2xl font-semibold">{parcelResults?.total ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Discovery persona</p><p className="mt-2 text-2xl font-semibold capitalize">{persona}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle><Search className="inline mr-2 h-4 w-4" />Search controls</CardTitle><CardDescription>Adjust the query, persona framing, and facet selections for discovery.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2"><Label>Semantic-style query prompt</Label><Input value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2"><Label>Persona</Label><Input value={persona} onChange={(e) => setPersona(e.target.value)} /></div>
              <div className="space-y-2"><Label>State facet</Label><Input value={stateFilter} onChange={(e) => setStateFilter(e.target.value)} /></div>
              <div className="space-y-2"><Label>Land-use facet</Label><Input value={landUseFilter} onChange={(e) => setLandUseFilter(e.target.value)} /></div>
            </div>
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              <p className="font-medium text-foreground mb-1"><Sparkles className="inline mr-2 h-4 w-4" />Persona-guided discovery note</p>
              <p>{semanticPrompt}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><Filter className="inline mr-2 h-4 w-4" />Discovery results</CardTitle><CardDescription>View autocomplete suggestions, fuzzy parcel matches, and saved-search style cues.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg border p-4">
              <p className="font-medium mb-2">Autocomplete suggestions</p>
              <div className="flex flex-wrap gap-2">{(suggestions || []).slice(0, 8).map((item: any) => <Badge key={`${item.type}-${item.id}`} variant="outline">{item.text}</Badge>)}</div>
            </div>
            <div className="rounded-lg border p-4">
              <p className="font-medium mb-2">Saved-search style recovery</p>
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Bookmark className="h-4 w-4" />Reuse your preferred facets, query phrasing, and result context for repeated discovery tasks.</div>
            </div>
            <div className="space-y-3">
              {(parcelResults?.results || []).slice(0, 5).map((result: any) => (
                <div key={result.id} className="rounded-lg border p-4">
                  <p className="font-medium">{result.data?.parcelId || result.data?.address || result.id}</p>
                  <p className="text-sm text-muted-foreground">{result.data?.address || 'Registry parcel result'} • {result.data?.state || stateFilter}</p>
                </div>
              ))}
            </div>
            <Button variant="outline" disabled>Search analytics are derived from the live autocomplete and Elasticsearch-backed query layer.</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
