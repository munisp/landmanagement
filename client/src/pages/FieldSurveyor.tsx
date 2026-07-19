import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Camera, MapPin, Save, Trash2, Wifi, WifiOff, CheckCircle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

type DraftFieldData = {
  parcelNumber: string;
  location: { lat: number; lng: number } | null;
  area: string;
  boundaries: string;
  notes: string;
  photos: string[];
};

type SortBy = 'date' | 'parcel';
type FilterSync = 'all' | 'recent';
type OfflineQueuedRecord = DraftFieldData & { queuedAt: string };

const offlineQueueKey = 'idlr-field-sync-queue';

function readOfflineQueue(): OfflineQueuedRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(offlineQueueKey);
    return raw ? (JSON.parse(raw) as OfflineQueuedRecord[]) : [];
  } catch {
    return [];
  }
}

function writeOfflineQueue(records: OfflineQueuedRecord[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(offlineQueueKey, JSON.stringify(records));
}

export default function FieldSurveyor() {
  const utils = trpc.useUtils();

  const triggerHaptic = (pattern: number | number[]) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  };
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queuedRecords, setQueuedRecords] = useState<OfflineQueuedRecord[]>(() => readOfflineQueue());
  const [isFlushingQueue, setIsFlushingQueue] = useState(false);
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<string[]>([]);
  const [formData, setFormData] = useState<DraftFieldData>({
    parcelNumber: '',
    location: null,
    area: '',
    boundaries: '',
    notes: '',
    photos: [],
  });
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisResult, setAnalysisResult] = useState<any>(null);
  const [sortBy, setSortBy] = useState<SortBy>('date');
  const [filterSync, setFilterSync] = useState<FilterSync>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const analyzePhotoMutation = trpc.propertyPhotoAI.analyzePhoto.useMutation();
  const uploadMutation = trpc.storage.upload.useMutation();
  const syncFieldData = trpc.fieldData.sync.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.fieldData.getUserData.invalidate({ limit: 100 }),
        utils.fieldData.getStats.invalidate(),
      ]);
      triggerHaptic([30, 20, 30]);
      toast.success('Field record saved and synced successfully');
      setFormData({
        parcelNumber: '',
        location: null,
        area: '',
        boundaries: '',
        notes: '',
        photos: [],
      });
      setLocation(null);
      setPhotos([]);
      setAnalysisResult(null);
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to save field record');
    },
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    writeOfflineQueue(queuedRecords);
  }, [queuedRecords]);

  useEffect(() => {
    const flushQueue = async () => {
      if (!isOnline || isFlushingQueue || queuedRecords.length === 0) return;

      setIsFlushingQueue(true);
      let syncedCount = 0;

      for (const record of queuedRecords) {
        try {
          await syncFieldData.mutateAsync({
            parcelNumber: record.parcelNumber.trim(),
            location: record.location,
            area: record.area,
            boundaries: record.boundaries,
            notes: record.notes,
            photos: record.photos,
            timestamp: record.queuedAt,
          });
          syncedCount += 1;
        } catch {
          break;
        }
      }

      if (syncedCount > 0) {
        setQueuedRecords((current) => current.slice(syncedCount));
        toast.success(`Synchronized ${syncedCount} queued field record${syncedCount === 1 ? '' : 's'}`);
      }

      setIsFlushingQueue(false);
    };

    void flushQueue();
  }, [isFlushingQueue, isOnline, queuedRecords, syncFieldData]);

  const deleteFieldData = trpc.fieldData.delete.useMutation({
    onSuccess: async () => {
      await Promise.all([
        utils.fieldData.getUserData.invalidate({ limit: 100 }),
        utils.fieldData.getStats.invalidate(),
      ]);
      triggerHaptic(20);
      toast.success('Field record deleted');
    },
    onError: (error) => {
      toast.error(error.message || 'Failed to delete field record');
    },
  });

  const { data: savedRecords = [], isLoading: recordsLoading } = trpc.fieldData.getUserData.useQuery({ limit: 100 });
  const { data: stats } = trpc.fieldData.getStats.useQuery();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [stream, setStream] = useState<MediaStream | null>(null);

  const getCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    setLocationError(null);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const loc = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        triggerHaptic(15);
        setLocation(loc);
        setFormData((current) => ({ ...current, location: loc }));
      },
      (error) => {
        setLocationError(error.message);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      }
    );
  };

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        setStream(mediaStream);
        setCameraActive(true);
      }
    } catch (error) {
      toast.error('Error accessing camera: ' + (error as Error).message);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
      setCameraActive(false);
    }
  };

  const analyzePhoto = async (photoUrl: string) => {
    try {
      setAnalyzing(true);
      const blob = await (await fetch(photoUrl)).blob();
      const buffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < uint8Array.length; i++) {
        binary += String.fromCharCode(uint8Array[i]);
      }
      const base64 = btoa(binary);

      const uploadResult = await uploadMutation.mutateAsync({
        key: `field-survey-${Date.now()}.jpg`,
        data: base64,
        contentType: 'image/jpeg',
      });

      const result = await analyzePhotoMutation.mutateAsync({ imageUrl: uploadResult.url });
      triggerHaptic([12, 18, 12]);
      setAnalysisResult(result);

      setFormData((current) => ({
        ...current,
        area: result.estimatedArea || current.area,
        boundaries: result.boundaries || current.boundaries,
        notes: [
          current.notes,
          'AI Analysis:',
          `Property Type: ${result.propertyType}`,
          `Landmarks: ${result.landmarks.join(', ')}`,
          `Structures: ${result.structures.join(', ')}`,
          result.notes,
        ]
          .filter(Boolean)
          .join('\n')
          .trim(),
      }));

      if (result.gpsCoordinates) {
        setLocation(result.gpsCoordinates);
        setFormData((current) => ({ ...current, location: result.gpsCoordinates }));
      }

      toast.success(`Photo analyzed with ${result.confidence}% confidence`);
    } catch (error) {
      toast.error('Failed to analyze photo. You can continue manually.');
    } finally {
      setAnalyzing(false);
    }
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    triggerHaptic(25);
    const photoDataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const newPhotos = [...photos, photoDataUrl];
    setPhotos(newPhotos);
    setFormData((current) => ({ ...current, photos: newPhotos }));

    if (isOnline) {
      await analyzePhoto(photoDataUrl);
    }
  };

  const saveRecord = async () => {
    if (!formData.parcelNumber.trim()) {
      toast.error('Please enter a parcel number');
      return;
    }

    if (!isOnline) {
      const queuedRecord: OfflineQueuedRecord = {
        ...formData,
        parcelNumber: formData.parcelNumber.trim(),
        queuedAt: new Date().toISOString(),
      };
      setQueuedRecords((current) => [queuedRecord, ...current]);
      triggerHaptic([20, 20, 20]);
      toast.success('Offline record queued for sync when connectivity returns');
      setFormData({
        parcelNumber: '',
        location: null,
        area: '',
        boundaries: '',
        notes: '',
        photos: [],
      });
      setLocation(null);
      setPhotos([]);
      setAnalysisResult(null);
      return;
    }

    await syncFieldData.mutateAsync({
      parcelNumber: formData.parcelNumber.trim(),
      location: formData.location,
      area: formData.area,
      boundaries: formData.boundaries,
      notes: formData.notes,
      photos: formData.photos,
      timestamp: new Date().toISOString(),
    });
  };

  const filteredRecords = useMemo(() => {
    let filtered = [...savedRecords];

    if (filterSync === 'recent') {
      filtered = filtered.filter((record) => {
        const syncedAt = new Date(record.syncedAt).getTime();
        return syncedAt >= Date.now() - 7 * 24 * 60 * 60 * 1000;
      });
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((record) =>
        record.parcelNumber.toLowerCase().includes(query) ||
        String(record.notes || '').toLowerCase().includes(query)
      );
    }

    filtered.sort((a, b) => {
      if (sortBy === 'parcel') {
        return a.parcelNumber.localeCompare(b.parcelNumber);
      }
      return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    });

    return filtered;
  }, [filterSync, savedRecords, searchQuery, sortBy]);

  return (
    <div className="container max-w-4xl py-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Field Surveyor</h1>
          <p className="text-sm text-muted-foreground">Capture and sync parcel verification data</p>
        </div>
        <div className="flex items-center gap-2">
          {isOnline ? (
            <Badge variant="default" className="gap-1">
              <Wifi className="h-3 w-3" />
              Online
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1">
              <WifiOff className="h-3 w-3" />
              Offline
            </Badge>
          )}
          <Badge variant="outline">{stats?.totalRecords ?? 0} synced records</Badge>
          {queuedRecords.length > 0 && <Badge variant="secondary">{queuedRecords.length} pending sync</Badge>}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.totalRecords ?? 0}</div>
            <p className="text-xs text-muted-foreground">Total Records</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats?.totalParcels ?? 0}</div>
            <p className="text-xs text-muted-foreground">Unique Parcels</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-sm font-semibold">
              {isFlushingQueue ? 'Syncing queued records…' : stats?.lastSync ? new Date(stats.lastSync).toLocaleString() : 'No sync yet'}
            </div>
            <p className="text-xs text-muted-foreground">Last Sync</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>New Survey</CardTitle>
          <CardDescription>Collect field data for parcel verification and sync it to the registry workflow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="parcelNumber">Parcel Number *</Label>
            <Input
              id="parcelNumber"
              value={formData.parcelNumber}
              onChange={(e) => setFormData((current) => ({ ...current, parcelNumber: e.target.value }))}
              placeholder="Enter parcel number"
            />
          </div>

          <div>
            <Label>GPS Location</Label>
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={getCurrentLocation} className="flex-1 min-h-11">
                <MapPin className="mr-2 h-4 w-4" />
                Get Location
              </Button>
              {location && (
                <Badge variant="default" className="flex min-h-11 items-center gap-1 px-3">
                  <CheckCircle className="h-3 w-3" />
                  Located
                </Badge>
              )}
            </div>
            {location && (
              <div className="mt-1 text-xs text-muted-foreground">
                Lat: {location.lat.toFixed(6)}, Lng: {location.lng.toFixed(6)}
              </div>
            )}
            {locationError && <div className="mt-1 text-xs text-destructive">{locationError}</div>}
          </div>

          <div>
            <Label htmlFor="area">Area (sq meters)</Label>
            <Input
              id="area"
              type="number"
              value={formData.area}
              onChange={(e) => setFormData((current) => ({ ...current, area: e.target.value }))}
              placeholder="Enter area"
            />
          </div>

          <div>
            <Label htmlFor="boundaries">Boundaries</Label>
            <Textarea
              id="boundaries"
              value={formData.boundaries}
              onChange={(e) => setFormData((current) => ({ ...current, boundaries: e.target.value }))}
              placeholder="Describe boundaries"
              rows={3}
            />
          </div>

          <div>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              value={formData.notes}
              onChange={(e) => setFormData((current) => ({ ...current, notes: e.target.value }))}
              placeholder="Additional notes"
              rows={4}
            />
          </div>

          <div>
            <Label>Photos ({photos.length})</Label>
            <div className="space-y-2">
              {!cameraActive ? (
                <Button type="button" variant="outline" onClick={startCamera} className="w-full min-h-11">
                  <Camera className="mr-2 h-4 w-4" />
                  Open Camera
                </Button>
              ) : (
                <div className="space-y-2">
                  <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg border" />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="flex gap-2">
                    <Button type="button" onClick={capturePhoto} className="flex-1 min-h-11" disabled={analyzing}>
                      <Camera className="mr-2 h-4 w-4" />
                      Capture
                    </Button>
                    <Button type="button" variant="outline" onClick={stopCamera} className="min-h-11 px-4">
                      Close
                    </Button>
                  </div>
                </div>
              )}

              {analyzing && (
                <div className="flex items-center gap-2 rounded-lg border p-3 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Analyzing captured photo and enriching survey details...
                </div>
              )}

              {analysisResult && (
                <div className="rounded-lg border p-3 text-sm">
                  <p className="font-medium">Latest AI analysis</p>
                  <p className="text-muted-foreground">
                    {analysisResult.propertyType} • {analysisResult.confidence}% confidence
                  </p>
                </div>
              )}

              {photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photos.map((photo, index) => (
                    <img
                      key={index}
                      src={photo}
                      alt={`Photo ${index + 1}`}
                      className="h-24 w-full rounded border object-cover"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button onClick={saveRecord} className="w-full min-h-11" disabled={syncFieldData.isPending || isFlushingQueue}>
            <Save className="mr-2 h-4 w-4" />
            {isFlushingQueue ? 'Syncing queued records...' : syncFieldData.isPending ? 'Saving...' : isOnline ? 'Save and Sync Record' : 'Queue Record for Sync'}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Survey Records</CardTitle>
          <CardDescription>Records already synchronized through the field-data workflow.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Input
              placeholder="Search by parcel number or notes..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as SortBy)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
              >
                <option value="date">Sort by Date</option>
                <option value="parcel">Sort by Parcel</option>
              </select>
              <select
                value={filterSync}
                onChange={(e) => setFilterSync(e.target.value as FilterSync)}
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
              >
                <option value="all">All Records</option>
                <option value="recent">Last 7 Days</option>
              </select>
            </div>
          </div>

          {recordsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading synchronized field records...
            </div>
          ) : filteredRecords.length === 0 ? (
            <div className="rounded-lg border p-4 text-sm text-muted-foreground">
              No synchronized field records found for the current filters.
            </div>
          ) : (
            <div className="space-y-2">
              {filteredRecords.map((record) => (
                <div key={record.id} className="rounded-lg border p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="font-medium">{record.parcelNumber}</div>
                      <div className="text-xs text-muted-foreground">
                        Captured {new Date(record.timestamp).toLocaleString()}
                      </div>
                      {record.locationLat !== null && record.locationLng !== null && (
                        <div className="text-xs text-muted-foreground">
                          GPS: {record.locationLat.toFixed(4)}, {record.locationLng.toFixed(4)}
                        </div>
                      )}
                      {record.notes && (
                        <div className="max-w-2xl text-sm text-muted-foreground">{record.notes}</div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="default">Synced</Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="min-h-11 min-w-11"
                        onClick={() => {
                          triggerHaptic(10);
                          deleteFieldData.mutate({ id: record.id });
                        }}
                        disabled={deleteFieldData.isPending}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
