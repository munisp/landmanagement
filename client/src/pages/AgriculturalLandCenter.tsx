import { useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Sprout, CloudSun, BarChart3 } from 'lucide-react';

export default function AgriculturalLandCenter() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.agricultural.overview.useQuery();
  const [parcelId, setParcelId] = useState(1203);
  const [cropType, setCropType] = useState('rice');
  const [soilQuality, setSoilQuality] = useState('silty loam with moderate organic matter');
  const [irrigationSystem, setIrrigationSystem] = useState('pivot irrigation');
  const [subsidyProgram, setSubsidyProgram] = useState('Seed and Input Support Scheme');
  const [extensionOfficer, setExtensionOfficer] = useState('Officer Grace Yusuf');
  const [productivityIndex, setProductivityIndex] = useState(74);
  const [weatherOutlook, setWeatherOutlook] = useState('Moderate rainfall expected; maintain irrigation backup for week two.');

  const refresh = async () => {
    await utils.agricultural.overview.invalidate();
  };

  const createParcel = trpc.agricultural.createParcel.useMutation({
    onSuccess: async () => {
      toast.success('Agricultural parcel workflow created');
      await refresh();
    },
    onError: (e) => toast.error(e.message || 'Unable to create agricultural parcel'),
  });

  if (isLoading) {
    return <div className="container py-8 text-sm text-muted-foreground">Loading agricultural workflows...</div>;
  }

  return (
    <div className="container py-8 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agricultural Land Center</h1>
        <p className="text-muted-foreground mt-2">Track crop types, soil quality, irrigation systems, subsidy programs, extension support, productivity analytics, and weather guidance for agricultural parcels.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Tracked parcels</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.trackedParcels ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Average productivity</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.averageProductivity ?? 0}</p></CardContent></Card>
        <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Subsidy coverage</p><p className="mt-2 text-2xl font-semibold">{data?.metrics?.subsidyCoverage ?? 0}</p></CardContent></Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        <Card>
          <CardHeader><CardTitle><Sprout className="inline mr-2 h-4 w-4" />Agricultural parcel workflow</CardTitle><CardDescription>Create agricultural parcel records with crop, soil, irrigation, subsidy, extension, productivity, and weather data.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2"><Label>Parcel ID</Label><Input type="number" value={parcelId} onChange={(e) => setParcelId(Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>Crop type</Label><Input value={cropType} onChange={(e) => setCropType(e.target.value)} /></div>
              <div className="space-y-2"><Label>Soil quality</Label><Input value={soilQuality} onChange={(e) => setSoilQuality(e.target.value)} /></div>
              <div className="space-y-2"><Label>Irrigation system</Label><Input value={irrigationSystem} onChange={(e) => setIrrigationSystem(e.target.value)} /></div>
              <div className="space-y-2"><Label>Subsidy program</Label><Input value={subsidyProgram} onChange={(e) => setSubsidyProgram(e.target.value)} /></div>
              <div className="space-y-2"><Label>Extension officer</Label><Input value={extensionOfficer} onChange={(e) => setExtensionOfficer(e.target.value)} /></div>
              <div className="space-y-2"><Label>Productivity index</Label><Input type="number" value={productivityIndex} onChange={(e) => setProductivityIndex(Number(e.target.value))} /></div>
              <div className="space-y-2"><Label>Weather outlook</Label><Input value={weatherOutlook} onChange={(e) => setWeatherOutlook(e.target.value)} /></div>
            </div>
            <Button onClick={() => createParcel.mutate({ parcelId, cropType, soilQuality, irrigationSystem, subsidyProgram, extensionOfficer, productivityIndex, weatherOutlook })} disabled={createParcel.isPending}>Create Agricultural Workflow</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle><BarChart3 className="inline mr-2 h-4 w-4" />Productivity analytics and weather</CardTitle><CardDescription>Review tracked agricultural parcels with productivity, subsidy, and weather posture.</CardDescription></CardHeader>
          <CardContent className="space-y-3">
            {(data?.parcels || []).map((item: any) => (
              <div key={item.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">Parcel {item.parcelId} • {item.cropType}</p>
                    <p className="text-sm text-muted-foreground">{item.soilQuality} • {item.irrigationSystem}</p>
                  </div>
                  <Badge variant="outline">{item.productivityIndex}</Badge>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">Subsidy: {item.subsidyProgram} • Extension: {item.extensionOfficer}</p>
                <p className="mt-1 text-sm text-muted-foreground"><CloudSun className="inline mr-1 h-4 w-4" />{item.weatherOutlook}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
