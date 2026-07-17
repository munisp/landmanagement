import { useRoute, Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { ParcelDetailsSkeleton } from "@/components/SkeletonLoaders";
import { ConnectedCommentThread } from "@/components/ConnectedCommentThread";
import { ParcelMapView } from "@/components/ParcelMapView";
import { PresenceIndicator } from "@/components/PresenceIndicator";
import { 
  ArrowLeft, 
  MapPin, 
  FileText, 
  History, 
  Shield, 
  Loader2,
  Map as MapIcon,
  Calendar,
  User,
  Building
} from "lucide-react";

export default function ParcelDetails() {
  const [, params] = useRoute("/parcels/:id");
  const parcelId = params?.id ? parseInt(params.id) : null;

  const { data: parcel, isLoading } = trpc.parcels.getById.useQuery(
    { id: parcelId! },
    { enabled: !!parcelId }
  );

  if (isLoading) {
    return (
      <div className="container mx-auto py-8">
        <ParcelDetailsSkeleton />
      </div>
    );
  }

  if (!parcel) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-muted-foreground">Parcel not found</p>
            <Link href="/search">
              <Button className="mt-4">Back to Search</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-white">
        <div className="container mx-auto px-4 py-4">
          <Link href="/search">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Search
            </Button>
          </Link>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Title Section */}
          <div className="mb-6">
            {/* Presence Indicator */}
            <div className="mb-4">
              <PresenceIndicator pageId={`parcel-${parcelId}`} />
            </div>
            
            <div className="flex items-start justify-between mb-2">
              <div>
                <h1 className="text-3xl font-bold">{parcel.parcelNumber}</h1>
                <p className="text-muted-foreground flex items-center gap-2 mt-2">
                  <MapPin className="h-4 w-4" />
                  {parcel.streetAddress || `${parcel.lga}, ${parcel.state}`}
                </p>
              </div>
              <Badge variant={
                parcel.status === 'verified' ? 'default' :
                parcel.status === 'registered' ? 'secondary' :
                'outline'
              } className="text-sm px-4 py-2">
                {parcel.status?.replace('_', ' ')}
              </Badge>
            </div>
            
            <div className="flex gap-2 mt-4">
              <Link href={`/parcels/${parcelId}/map`}>
                <Button className="gap-2">
                  <MapIcon className="h-4 w-4" />
                  View on Map
                </Button>
              </Link>
              <Link href={`/transactions/initiate/${parcelId}`}>
                <Button variant="default" className="gap-2">
                  <FileText className="h-4 w-4" />
                  Initiate Transaction
                </Button>
              </Link>
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                Download Certificate
              </Button>
              <Button variant="outline" className="gap-2">
                <Shield className="h-4 w-4" />
                Verify on Blockchain
              </Button>
            </div>
          </div>

          {/* Main Content */}
          <Tabs defaultValue="details" className="space-y-6">
            <TabsList>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="map">Map</TabsTrigger>
              <TabsTrigger value="ownership">Ownership</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
              <TabsTrigger value="history">History</TabsTrigger>
              <TabsTrigger value="comments">Comments</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-6">
              {/* Basic Information */}
              <Card>
                <CardHeader>
                  <CardTitle>Basic Information</CardTitle>
                  <CardDescription>Core parcel details and measurements</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Parcel Number</h4>
                      <p className="font-medium">{parcel.parcelNumber}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Survey Plan Number</h4>
                      <p className="font-medium">{parcel.surveyPlanNumber}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Area</h4>
                      <p className="font-medium">{parcel.areaSquareMeters?.toFixed(2)} m²</p>
                      <p className="text-sm text-muted-foreground">({(parcel.areaSquareMeters! / 10000).toFixed(4)} hectares)</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Land Use Type</h4>
                      <p className="font-medium capitalize">{parcel.landUseType || 'N/A'}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Status</h4>
                      <Badge variant={
                        parcel.status === 'verified' ? 'default' :
                        parcel.status === 'registered' ? 'secondary' :
                        'outline'
                      }>
                        {parcel.status?.replace('_', ' ')}
                      </Badge>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Registration Date</h4>
                      <p className="font-medium flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        {new Date(parcel.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Location Information */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapPin className="h-5 w-5" />
                    Location Information
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">State</h4>
                      <p className="font-medium">{parcel.state}</p>
                    </div>
                    <div>
                      <h4 className="text-sm font-medium text-muted-foreground mb-1">Local Government Area</h4>
                      <p className="font-medium">{parcel.lga}</p>
                    </div>
                    {parcel.ward && (
                      <div>
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Ward</h4>
                        <p className="font-medium">{parcel.ward}</p>
                      </div>
                    )}
                    {parcel.streetAddress && (
                      <div className="md:col-span-2">
                        <h4 className="text-sm font-medium text-muted-foreground mb-1">Street Address</h4>
                        <p className="font-medium">{parcel.streetAddress}</p>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Additional Notes */}
              {parcel.notes && (
                <Card>
                  <CardHeader>
                    <CardTitle>Additional Notes</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm">{parcel.notes}</p>
                  </CardContent>
                </Card>
              )}
            </TabsContent>

            <TabsContent value="map" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MapIcon className="h-5 w-5" />
                    Parcel Location & Boundaries
                  </CardTitle>
                  <CardDescription>Interactive map showing parcel boundaries and nearby properties</CardDescription>
                </CardHeader>
                <CardContent>
                  <ParcelMapView parcel={parcel} />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="ownership" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <User className="h-5 w-5" />
                    Current Ownership
                  </CardTitle>
                  <CardDescription>Property title and ownership information</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-4">
                        <div>
                          <h4 className="font-semibold">Title Number: TL-2024-001</h4>
                          <p className="text-sm text-muted-foreground">Freehold Title</p>
                        </div>
                        <Badge>Active</Badge>
                      </div>
                      <div className="grid md:grid-cols-2 gap-4 text-sm">
                        <div>
                          <span className="text-muted-foreground">Owner Name:</span>
                          <p className="font-medium">John Doe</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ownership Type:</span>
                          <p className="font-medium">Individual</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Acquisition Date:</span>
                          <p className="font-medium">January 15, 2024</p>
                        </div>
                        <div>
                          <span className="text-muted-foreground">Ownership %:</span>
                          <p className="font-medium">100%</p>
                        </div>
                      </div>
                    </div>

                    <div className="text-center py-8 text-muted-foreground">
                      <Building className="h-12 w-12 mx-auto mb-2 opacity-50" />
                      <p>No encumbrances or liens registered</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="documents" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5" />
                    Associated Documents
                  </CardTitle>
                  <CardDescription>Survey plans, certificates, and supporting documents</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { name: 'Survey Plan', type: 'PDF', size: '2.4 MB', date: '2024-01-15' },
                      { name: 'Certificate of Occupancy', type: 'PDF', size: '1.2 MB', date: '2024-01-20' },
                      { name: 'Deed of Assignment', type: 'PDF', size: '890 KB', date: '2024-01-15' },
                    ].map((doc, idx) => (
                      <div key={idx} className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent transition-colors">
                        <div className="flex items-center gap-3">
                          <FileText className="h-8 w-8 text-primary" />
                          <div>
                            <p className="font-medium">{doc.name}</p>
                            <p className="text-sm text-muted-foreground">{doc.type} • {doc.size} • {doc.date}</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm">Download</Button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Transaction History
                  </CardTitle>
                  <CardDescription>Complete history of all transactions and changes</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {[
                      { 
                        type: 'Verification', 
                        date: '2024-01-20', 
                        user: 'Surveyor John Smith',
                        status: 'Completed',
                        description: 'Parcel verified and approved'
                      },
                      { 
                        type: 'Registration', 
                        date: '2024-01-15', 
                        user: 'Registrar Jane Doe',
                        status: 'Completed',
                        description: 'Initial parcel registration'
                      },
                      { 
                        type: 'Survey', 
                        date: '2024-01-10', 
                        user: 'Survey Team Alpha',
                        status: 'Completed',
                        description: 'Field survey conducted'
                      },
                    ].map((event, idx) => (
                      <div key={idx} className="flex gap-4 pb-4 border-b last:border-0">
                        <div className="flex-shrink-0 w-2 h-2 rounded-full bg-primary mt-2"></div>
                        <div className="flex-1">
                          <div className="flex items-start justify-between mb-1">
                            <h4 className="font-semibold">{event.type}</h4>
                            <Badge variant="outline">{event.status}</Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-1">{event.description}</p>
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {event.date}
                            </span>
                            <span className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {event.user}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="comments" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Comments & Discussion</CardTitle>
                  <CardDescription>Collaborate with team members on this parcel</CardDescription>
                </CardHeader>
                <CardContent>
                  <ConnectedCommentThread entityType="parcel" entityId={parcelId!.toString()} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
