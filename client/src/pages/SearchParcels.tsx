import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { trpc } from "@/lib/trpc";
import { PullToRefresh } from "@/components/PullToRefresh";
import { ConnectedSavedSearches } from "@/components/ConnectedSavedSearches";
import { SavedSearch } from "@/components/SavedSearches";
import { Search, MapPin, FileText, Loader2, Sliders } from "lucide-react";
import { Link } from "wouter";

export default function SearchParcels() {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [state, setState] = useState("");
  const [lga, setLga] = useState("");
  const [status, setStatus] = useState("");
  
  // Advanced filters
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [areaMin, setAreaMin] = useState("");
  const [areaMax, setAreaMax] = useState("");
  const [landUseType, setLandUseType] = useState("");

  const { data, isLoading, refetch } = trpc.parcels.search.useQuery({
    query,
    state: state && state !== 'all' ? state : undefined,
    lga: lga || undefined,
    status: status && status !== 'all' ? status : undefined,
    priceMin: priceMin ? parseFloat(priceMin) : undefined,
    priceMax: priceMax ? parseFloat(priceMax) : undefined,
    areaMin: areaMin ? parseFloat(areaMin) : undefined,
    areaMax: areaMax ? parseFloat(areaMax) : undefined,
    landUseType: landUseType && landUseType !== 'all' ? landUseType : undefined,
    page: 1,
    limit: 20,
  }, {
    enabled: false,
  });

  const handleSearch = () => {
    refetch();
  };

  const handleClearFilters = () => {
    setQuery("");
    setState("");
    setLga("");
    setStatus("");
    setPriceMin("");
    setPriceMax("");
    setAreaMin("");
    setAreaMax("");
    setLandUseType("");
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
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
        <div className="max-w-6xl mx-auto">
          <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{t('searchParcels.title')}</h1>
              <p className="text-muted-foreground">
                {t('searchParcels.subtitle')}
              </p>
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

          {/* Search Form */}
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
                <TabsList className="grid w-full grid-cols-2 mb-4">
                  <TabsTrigger value="basic">{t('searchParcels.tabs.basicSearch')}</TabsTrigger>
                  <TabsTrigger value="advanced">{t('searchParcels.tabs.advancedFilters')}</TabsTrigger>
                </TabsList>

                <TabsContent value="basic" className="space-y-4">
                  <div className="grid md:grid-cols-2 gap-4">
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
                  <div className="grid md:grid-cols-2 gap-4">
                    <div>
                      <Label>{t('searchParcels.advancedFilters.priceRange')}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          placeholder={t('searchParcels.advancedFilters.minPrice')}
                          value={priceMin}
                          onChange={(e) => setPriceMin(e.target.value)}
                        />
                        <Input
                          type="number"
                          placeholder={t('searchParcels.advancedFilters.maxPrice')}
                          value={priceMax}
                          onChange={(e) => setPriceMax(e.target.value)}
                        />
                      </div>
                    </div>

                    <div>
                      <Label>{t('searchParcels.advancedFilters.areaRange')}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          type="number"
                          placeholder={t('searchParcels.advancedFilters.minArea')}
                          value={areaMin}
                          onChange={(e) => setAreaMin(e.target.value)}
                        />
                        <Input
                          type="number"
                          placeholder={t('searchParcels.advancedFilters.maxArea')}
                          value={areaMax}
                          onChange={(e) => setAreaMax(e.target.value)}
                        />
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

                  <div className="bg-muted/50 p-4 rounded-lg">
                    <h4 className="font-semibold text-sm mb-2">{t('searchParcels.advancedFilters.activeFilters')}</h4>
                    <div className="flex flex-wrap gap-2">
                      {priceMin && <span className="text-xs bg-primary/10 px-2 py-1 rounded">Min Price: ₦{parseFloat(priceMin).toLocaleString()}</span>}
                      {priceMax && <span className="text-xs bg-primary/10 px-2 py-1 rounded">Max Price: ₦{parseFloat(priceMax).toLocaleString()}</span>}
                      {areaMin && <span className="text-xs bg-primary/10 px-2 py-1 rounded">Min Area: {areaMin}m²</span>}
                      {areaMax && <span className="text-xs bg-primary/10 px-2 py-1 rounded">Max Area: {areaMax}m²</span>}
                      {landUseType && landUseType !== 'all' && <span className="text-xs bg-primary/10 px-2 py-1 rounded capitalize">Land Use: {landUseType}</span>}
                      {!priceMin && !priceMax && !areaMin && !areaMax && (!landUseType || landUseType === 'all') && (
                        <span className="text-xs text-muted-foreground">{t('searchParcels.advancedFilters.noFilters')}</span>
                      )}
                    </div>
                  </div>
                </TabsContent>
              </Tabs>

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

          {/* Results */}
          <PullToRefresh 
            onRefresh={async () => {
              await refetch();
            }}
            disabled={isLoading}
          >
          {data && (
            <div>
              <h2 className="text-xl font-semibold mb-4">
                {t('searchParcels.results.title')} ({data.total || 0} {t('searchParcels.results.parcelsFound')})
              </h2>

              {data.parcels && data.parcels.length > 0 ? (
                <div className="grid gap-4">
                  {data.parcels.map((parcel: any) => (
                    <Card key={parcel.id} className="hover:shadow-md transition-shadow">
                      <CardHeader>
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-lg">{parcel.parcelNumber}</CardTitle>
                            <CardDescription className="flex items-center gap-2 mt-1">
                              <MapPin className="h-4 w-4" />
                              {parcel.streetAddress || `${parcel.lga}, ${parcel.state}`}
                            </CardDescription>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                            parcel.status === 'verified' ? 'bg-green-100 text-green-800' :
                            parcel.status === 'registered' ? 'bg-blue-100 text-blue-800' :
                            parcel.status === 'pending_verification' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {parcel.status?.replace('_', ' ')}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent>
                        <div className="grid md:grid-cols-3 gap-4 text-sm">
                          <div>
                            <span className="text-muted-foreground">{t('searchParcels.results.area')}</span>
                            <p className="font-medium">{parcel.areaSquareMeters?.toFixed(2)} m²</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('searchParcels.results.landUse')}</span>
                            <p className="font-medium capitalize">{parcel.landUseType || 'N/A'}</p>
                          </div>
                          <div>
                            <span className="text-muted-foreground">{t('searchParcels.results.surveyPlan')}</span>
                            <p className="font-medium">{parcel.surveyPlanNumber || 'N/A'}</p>
                          </div>
                        </div>
                        <div className="mt-4 flex gap-2">
                          <Link href={`/parcels/${parcel.id}`}>
                            <Button variant="outline" size="sm" className="gap-2">
                              <FileText className="h-4 w-4" />
                              {t('searchParcels.results.viewDetails')}
                            </Button>
                          </Link>
                          <Link href={`/parcels/${parcel.id}/map`}>
                            <Button variant="outline" size="sm" className="gap-2">
                              <MapPin className="h-4 w-4" />
                              {t('searchParcels.results.viewOnMap')}
                            </Button>
                          </Link>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                    <p className="text-muted-foreground">{t('searchParcels.results.noResults')}</p>
                  </CardContent>
                </Card>
              )}
            </div>
          )}

          {!data && !isLoading && (
            <Card>
              <CardContent className="py-12 text-center">
                <Search className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
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
