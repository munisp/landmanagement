import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { trpc } from '@/lib/trpc';
import { PullToRefresh } from '@/components/PullToRefresh';
import { ConnectedSavedSearches } from '@/components/ConnectedSavedSearches';
import { SavedSearch } from '@/components/SavedSearches';
import { AlertTriangle, FileText, Loader2, MapPin, Search, Shield, Sliders } from 'lucide-react';
import { Link } from 'wouter';

export default function SearchParcels() {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [state, setState] = useState('');
  const [lga, setLga] = useState('');
  const [status, setStatus] = useState('');
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [areaMin, setAreaMin] = useState('');
  const [areaMax, setAreaMax] = useState('');
  const [landUseType, setLandUseType] = useState('');
  const [challengeToken, setChallengeToken] = useState('');

  const searchInput = {
    query,
    challengeToken: challengeToken || undefined,
    filters: {
      city: lga || undefined,
      state: state && state !== 'all' ? state : undefined,
      landUse: landUseType && landUseType !== 'all' ? landUseType : undefined,
      status: status && status !== 'all' ? status : undefined,
      minArea: areaMin ? parseFloat(areaMin) : undefined,
      maxArea: areaMax ? parseFloat(areaMax) : undefined,
    },
    page: 1,
    pageSize: 20,
  };

  const { data, isLoading, refetch } = trpc.search.searchParcels.useQuery(searchInput, {
    enabled: false,
  });

  const { data: challengeConfig } = trpc.publicSecurity.challengeConfig.useQuery();
  const { data: searchInsights } = trpc.search.searchInsights.useQuery();

  const handleSearch = () => {
    refetch();
  };

  const handleClearFilters = () => {
    setQuery('');
    setState('');
    setLga('');
    setStatus('');
    setPriceMin('');
    setPriceMax('');
    setAreaMin('');
    setAreaMax('');
    setLandUseType('');
    setChallengeToken('');
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              {t('searchParcels.header.backToHome')}
            </Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="mb-2 text-3xl font-bold">{t('searchParcels.title')}</h1>
              <p className="text-muted-foreground">{t('searchParcels.subtitle')}</p>
            </div>
            <ConnectedSavedSearches
              currentQuery={{
                query,
                state: state && state !== 'all' ? state : undefined,
                lga: lga || undefined,
                status: status && status !== 'all' ? status : undefined,
                priceMin: priceMin ? parseFloat(priceMin) : undefined,
                priceMax: priceMax ? parseFloat(priceMax) : undefined,
                areaMin: areaMin ? parseFloat(areaMin) : undefined,
                areaMax: areaMax ? parseFloat(areaMax) : undefined,
                landUseType: landUseType && landUseType !== 'all' ? landUseType : undefined,
              }}
              onLoadSearch={(search: SavedSearch) => {
                const q = search.query;
                setQuery(q.query || '');
                setState(q.state || '');
                setLga(q.lga || '');
                setStatus(q.status || '');
                setPriceMin(q.priceMin?.toString() || '');
                setPriceMax(q.priceMax?.toString() || '');
                setAreaMin(q.areaMin?.toString() || '');
                setAreaMax(q.areaMax?.toString() || '');
                setLandUseType(q.landUseType || '');
                refetch();
              }}
            />
          </div>

          <div className="mb-8 grid gap-4 md:grid-cols-3">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{searchInsights?.saved_search_count ?? 0}</div>
                <p className="text-xs text-muted-foreground">Saved Search Patterns</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{searchInsights?.diversity_score ?? 0}</div>
                <p className="text-xs text-muted-foreground">Search Diversity Score</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-sm font-semibold">
                  {Array.isArray(searchInsights?.popular_locations) && searchInsights?.popular_locations.length > 0
                    ? searchInsights.popular_locations.slice(0, 2).join(', ')
                    : 'No hotspots yet'}
                </div>
                <p className="text-xs text-muted-foreground">Popular Search Locations</p>
              </CardContent>
            </Card>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sliders className="h-5 w-5" />
                {t('searchParcels.searchCriteria.title')}
              </CardTitle>
              <CardDescription>{t('searchParcels.searchCriteria.description')}</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="basic" className="w-full">
                <TabsList className="mb-4 grid w-full grid-cols-2">
                  <TabsTrigger value="basic">{t('searchParcels.tabs.basicSearch')}</TabsTrigger>
                  <TabsTrigger value="advanced">{t('searchParcels.tabs.advancedFilters')}</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label htmlFor="query">{t('searchParcels.basicSearch.parcelNumberLabel')}</Label>
                      <Input
                        id="query"
                        placeholder={t('searchParcels.basicSearch.parcelNumberPlaceholder')}
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="state">{t('searchParcels.basicSearch.stateLabel')}</Label>
                      <Select value={state} onValueChange={setState}>
                        <SelectTrigger id="state">
                          <SelectValue placeholder={t('searchParcels.basicSearch.statePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('searchParcels.basicSearch.allStates')}</SelectItem>
                          <SelectItem value="Lagos">Lagos</SelectItem>
                          <SelectItem value="Abuja">Abuja</SelectItem>
                          <SelectItem value="Kano">Kano</SelectItem>
                          <SelectItem value="Rivers">Rivers</SelectItem>
                          <SelectItem value="Oyo">Oyo</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <Label htmlFor="lga">{t('searchParcels.basicSearch.lgaLabel')}</Label>
                      <Input
                        id="lga"
                        placeholder={t('searchParcels.basicSearch.lgaPlaceholder')}
                        value={lga}
                        onChange={(e) => setLga(e.target.value)}
                      />
                    </div>

                    <div>
                      <Label htmlFor="status">{t('searchParcels.basicSearch.statusLabel')}</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger id="status">
                          <SelectValue placeholder={t('searchParcels.basicSearch.statusPlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('searchParcels.basicSearch.allStatuses')}</SelectItem>
                          <SelectItem value="verified">{t('searchParcels.basicSearch.verified')}</SelectItem>
                          <SelectItem value="pending_verification">{t('searchParcels.basicSearch.pendingVerification')}</SelectItem>
                          <SelectItem value="registered">{t('searchParcels.basicSearch.registered')}</SelectItem>
                          <SelectItem value="disputed">{t('searchParcels.basicSearch.disputed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="advanced" className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <Label>{t('searchParcels.advancedFilters.priceRange')}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="number" placeholder={t('searchParcels.advancedFilters.minPrice')} value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
                        <Input type="number" placeholder={t('searchParcels.advancedFilters.maxPrice')} value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
                      </div>
                    </div>

                    <div>
                      <Label>{t('searchParcels.advancedFilters.areaRange')}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="number" placeholder={t('searchParcels.advancedFilters.minArea')} value={areaMin} onChange={(e) => setAreaMin(e.target.value)} />
                        <Input type="number" placeholder={t('searchParcels.advancedFilters.maxArea')} value={areaMax} onChange={(e) => setAreaMax(e.target.value)} />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="landUseType">{t('searchParcels.advancedFilters.landUseType')}</Label>
                      <Select value={landUseType} onValueChange={setLandUseType}>
                        <SelectTrigger id="landUseType">
                          <SelectValue placeholder={t('searchParcels.advancedFilters.landUsePlaceholder')} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{t('searchParcels.advancedFilters.allTypes')}</SelectItem>
                          <SelectItem value="residential">{t('searchParcels.advancedFilters.residential')}</SelectItem>
                          <SelectItem value="commercial">{t('searchParcels.advancedFilters.commercial')}</SelectItem>
                          <SelectItem value="industrial">{t('searchParcels.advancedFilters.industrial')}</SelectItem>
                          <SelectItem value="agricultural">{t('searchParcels.advancedFilters.agricultural')}</SelectItem>
                          <SelectItem value="mixed">{t('searchParcels.advancedFilters.mixed')}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="rounded-lg bg-muted/50 p-4">
                    <h4 className="mb-2 text-sm font-semibold">{t('searchParcels.advancedFilters.activeFilters')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {priceMin && <span className="rounded bg-primary/10 px-2 py-1 text-xs">Min Price: ₦{parseFloat(priceMin).toLocaleString()}</span>}
                      {priceMax && <span className="rounded bg-primary/10 px-2 py-1 text-xs">Max Price: ₦{parseFloat(priceMax).toLocaleString()}</span>}
                      {areaMin && <span className="rounded bg-primary/10 px-2 py-1 text-xs">Min Area: {areaMin}m²</span>}
                      {areaMax && <span className="rounded bg-primary/10 px-2 py-1 text-xs">Max Area: {areaMax}m²</span>}
                      {landUseType && landUseType !== 'all' && <span className="rounded bg-primary/10 px-2 py-1 text-xs capitalize">Land Use: {landUseType}</span>}
                      {!priceMin && !priceMax && !areaMin && !areaMax && (!landUseType || landUseType === 'all') && (
                        <span className="text-xs text-muted-foreground">{t('searchParcels.advancedFilters.noFilters')}</span>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

              {challengeConfig?.publicSearchRequired && (
                <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <Shield className="h-4 w-4 text-amber-700" />
                    <p className="font-medium text-amber-900">Protected public search</p>
                  </div>
                  <p className="mb-3 text-sm text-amber-800">
                    Search protection is enabled for this endpoint. Provide a valid challenge token before submitting high-volume or public search traffic.
                  </p>
                  <Label htmlFor="challenge-token">Challenge token</Label>
                  <Input
                    id="challenge-token"
                    value={challengeToken}
                    onChange={(e) => setChallengeToken(e.target.value)}
                    placeholder={challengeConfig.siteKeyConfigured ? `Enter ${challengeConfig.provider} token` : 'Challenge provider is not fully configured in this environment'}
                  />
                </div>
              )}

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Button onClick={handleSearch} className="gap-2 sm:w-auto" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      {t('searchParcels.buttons.searching')}
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4" />
                      {t('searchParcels.buttons.searchParcels')}
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={handleClearFilters} className="sm:w-auto">
                  {t('searchParcels.buttons.clearFilters')}
                </Button>
              </div>
            </CardContent>
          </Card>

          <PullToRefresh onRefresh={async () => { await refetch(); }} disabled={isLoading}>
            {data && (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 rounded-lg border bg-muted/20 p-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">
                      {t('searchParcels.results.title')} ({data.total || 0} {t('searchParcels.results.parcelsFound')})
                    </h2>
                    <p className="text-sm text-muted-foreground">{data.meta?.querySummary || 'Parcel search results are ready.'}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{data.meta?.took ?? 0}ms</Badge>
                    <Badge variant={data.meta?.challengeEnforced ? 'secondary' : 'outline'}>
                      {data.meta?.challengeEnforced ? 'Challenge enforced' : 'Standard search'}
                    </Badge>
                  </div>
                </div>

                {data.results && data.results.length > 0 ? (
                  <div className="grid gap-4">
                    {data.results.map((result: any) => {
                      const parcel = result.data;
                      return (
                        <Card key={result.id} className="transition-shadow hover:shadow-md">
                          <CardHeader>
                            <div className="flex items-start justify-between gap-4">
                              <div>
                                <CardTitle className="text-lg">{parcel.parcelId || parcel.parcelNumber || result.id}</CardTitle>
                                <CardDescription className="mt-1 flex items-center gap-2">
                                  <MapPin className="h-4 w-4" />
                                  {parcel.address || `${parcel.city || lga || 'Unknown city'}, ${parcel.state || state || 'Unknown state'}`}
                                </CardDescription>
                              </div>
                              <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                                parcel.status === 'verified'
                                  ? 'bg-green-100 text-green-800'
                                  : parcel.status === 'registered'
                                    ? 'bg-blue-100 text-blue-800'
                                    : parcel.status === 'pending_verification'
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-gray-100 text-gray-800'
                              }`}>
                                {String(parcel.status || 'unknown').replace('_', ' ')}
                              </span>
                            </div>
                          </CardHeader>
                          <CardContent className="space-y-4">
                            <div className="grid gap-4 text-sm md:grid-cols-3">
                              <div>
                                <span className="text-muted-foreground">{t('searchParcels.results.area')}</span>
                                <p className="font-medium">{parcel.area?.toLocaleString?.() ?? parcel.areaSquareMeters?.toFixed?.(2) ?? 'N/A'} m²</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t('searchParcels.results.landUse')}</span>
                                <p className="font-medium capitalize">{parcel.landUse || parcel.landUseType || 'N/A'}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">{t('searchParcels.results.surveyPlan')}</span>
                                <p className="font-medium">{parcel.ownerName || parcel.surveyPlanNumber || 'N/A'}</p>
                              </div>
                            </div>

                            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                              <p className="mb-2 font-medium">Why this result ranked here</p>
                              <div className="mb-2 flex flex-wrap gap-2">
                                <Badge variant="outline">Score {result.explanation?.score?.toFixed?.(2) ?? result.score?.toFixed?.(2) ?? 'N/A'}</Badge>
                              </div>
                              <div className="space-y-1 text-muted-foreground">
                                {(result.explanation?.reasons || []).map((reason: string) => (
                                  <p key={reason}>{reason}</p>
                                ))}
                              </div>
                            </div>

                            <div className="flex gap-2">
                              <Link href={`/parcels/${result.id}`}>
                                <Button variant="outline" size="sm" className="gap-2">
                                  <FileText className="h-4 w-4" />
                                  {t('searchParcels.results.viewDetails')}
                                </Button>
                              </Link>
                              <Link href={`/parcels/${result.id}/map`}>
                                <Button variant="outline" size="sm" className="gap-2">
                                  <MapPin className="h-4 w-4" />
                                  {t('searchParcels.results.viewOnMap')}
                                </Button>
                              </Link>
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                      <p className="text-muted-foreground">{data.meta?.querySummary || t('searchParcels.results.noResults')}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {!data && !isLoading && (
              <Card>
                <CardContent className="py-12 text-center">
                  <Search className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
                  <p className="text-muted-foreground">{t('searchParcels.results.enterCriteria')}</p>
                </CardContent>
              </Card>
            )}
          </PullToRefresh>
        </div>
      </div>
    </div>
  );
}
