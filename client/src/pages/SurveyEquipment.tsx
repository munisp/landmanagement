import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Link } from "wouter";
import { Satellite, Upload, MapPin, Ruler, Plane, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

export default function SurveyEquipment() {
  const { data, isLoading } = trpc.surveyEquipment.state.useQuery();

  if (isLoading || !data) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex items-center gap-2 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading survey equipment state...
        </div>
      </div>
    );
  }

  const handleFileUpload = (fileType: string) => {
    toast.info(`${fileType} ingestion is coordinated through the live field and imagery workflows`);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link href="/admin">
            <Button variant="ghost" className="gap-2">
              ← Back to Admin
            </Button>
          </Link>
          <h1 className="text-xl font-semibold">Survey Equipment Integration</h1>
          <Button className="gap-2" onClick={() => toast.info("Use the live field sync and drone processing workflows to ingest new survey assets") }>
            <Upload className="h-4 w-4" />
            Import Data
          </Button>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-4 flex items-center gap-3">
              <Satellite className="h-10 w-10" />
              Survey Equipment Integration
            </h1>
            <p className="text-lg text-muted-foreground">
              Review deterministic device status, recent survey imports, and calibration readiness across field collection workflows.
            </p>
          </div>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle>Connected Survey Devices</CardTitle>
              <CardDescription>
                Current availability and synchronization state of connected survey equipment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.connectedDevices.map((device) => (
                  <div key={device.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center gap-4">
                      <div className={`w-3 h-3 rounded-full ${device.status === 'connected' ? 'bg-green-500' : 'bg-gray-400'}`} />
                      <div>
                        <p className="font-semibold">{device.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {device.type} • Accuracy: {device.accuracy} • Last sync: {new Date(device.lastSync).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <Badge variant={device.status === 'connected' ? 'outline' : 'secondary'}>
                      {device.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="gps" className="space-y-6">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="gps">GPS Data</TabsTrigger>
              <TabsTrigger value="drone">Drone Imagery</TabsTrigger>
              <TabsTrigger value="lidar">LiDAR Data</TabsTrigger>
            </TabsList>

            <TabsContent value="gps">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    GPS Data Import
                  </CardTitle>
                  <CardDescription>
                    Import GPS coordinates from professional survey devices through the live ingestion workflow
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="font-medium mb-2">Prepare GPS Data File</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Supported formats: CSV, GPX, KML, RINEX
                    </p>
                    <Button onClick={() => handleFileUpload("GPS")}>Open Ingestion Workflow</Button>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-4">Coordinate Transformation Settings</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label>Source Coordinate System</Label>
                        <Input value="WGS84 (EPSG:4326)" disabled />
                      </div>
                      <div className="space-y-2">
                        <Label>Target Coordinate System</Label>
                        <Input value="UTM Zone 31N (EPSG:32631)" disabled />
                      </div>
                    </div>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <h3 className="font-semibold text-blue-900 mb-2">Data Validation</h3>
                    <ul className="text-sm text-blue-800 space-y-1">
                      <li>• Minimum accuracy threshold: ±5cm</li>
                      <li>• Outlier detection: Enabled</li>
                      <li>• Duplicate point removal: Enabled</li>
                      <li>• Coordinate bounds check: Nigeria extent</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="drone">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Plane className="h-5 w-5" />
                    Drone Imagery Import
                  </CardTitle>
                  <CardDescription>
                    Coordinate drone imagery processing through the live photogrammetry workflow
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Plane className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="font-medium mb-2">Prepare Drone Imagery</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Supported formats: GeoTIFF, JPEG2000, LAS, LAZ, OBJ
                    </p>
                    <Button onClick={() => handleFileUpload("Drone Imagery")}>Open Imagery Workflow</Button>
                  </div>

                  <div className="p-4 border rounded-lg">
                    <h3 className="font-semibold mb-4">Processing Options</h3>
                    <div className="space-y-3">
                      {['Generate Orthomosaic', 'Create 3D Point Cloud', 'Extract Building Footprints (AI)', 'Detect Boundary Changes'].map((label) => (
                        <div key={label} className="flex items-center justify-between">
                          <span className="text-sm">{label}</span>
                          <Badge variant="outline">Enabled</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="lidar">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Ruler className="h-5 w-5" />
                    LiDAR Data Import
                  </CardTitle>
                  <CardDescription>
                    Prepare LiDAR point clouds for precision terrain and asset modeling
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="border-2 border-dashed rounded-lg p-8 text-center">
                    <Ruler className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="font-medium mb-2">Prepare LiDAR Point Cloud</p>
                    <p className="text-sm text-muted-foreground mb-4">
                      Supported formats: LAS, LAZ, E57, XYZ
                    </p>
                    <Button onClick={() => handleFileUpload("LiDAR")}>Open LiDAR Workflow</Button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Total Points</p>
                      <p className="text-xl font-bold">15.2M</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Point Density</p>
                      <p className="text-xl font-bold">25 pts/m²</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">File Size</p>
                      <p className="text-xl font-bold">1.8 GB</p>
                    </div>
                    <div className="p-4 border rounded-lg">
                      <p className="text-sm text-muted-foreground mb-1">Accuracy</p>
                      <p className="text-xl font-bold">±3cm</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Recent Imports</CardTitle>
              <CardDescription>
                Survey data import history from the deterministic operational store
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.recentImports.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{item.filename}</p>
                      <p className="text-sm text-muted-foreground">
                        {item.type} • {item.points ? `${item.points.toLocaleString()} points` : item.size} • {new Date(item.timestamp).toLocaleString()}
                      </p>
                    </div>
                    <Badge variant={item.status === 'completed' ? 'outline' : 'secondary'}>
                      {item.status === 'completed' && <CheckCircle2 className="h-3 w-3 mr-1" />}
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>Equipment Calibration</CardTitle>
              <CardDescription>
                Calibration tracking for connected survey devices
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {data.calibrationRecords.map((record) => (
                  <div key={record.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div>
                      <p className="font-medium">{record.device}</p>
                      <p className="text-sm text-muted-foreground">
                        Calibrated by {record.calibratedBy} on {new Date(record.date).toLocaleDateString()} • Next due: {new Date(record.nextDue).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={record.status === 'valid' ? 'outline' : 'secondary'}
                      className={record.status === 'due_soon' ? 'bg-yellow-50 text-yellow-700 border-yellow-200' : ''}
                    >
                      {record.status === 'valid' ? 'Valid' : 'Due Soon'}
                    </Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
