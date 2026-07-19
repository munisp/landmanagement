import { useEffect, useMemo, useRef, useState } from 'react';
import { trpc } from '@/lib/trpc';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, Camera, CheckCircle, ClipboardList, Loader2, MapPin, Save, Trash2, Wifi, WifiOff } from 'lucide-react';
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
type SyncRiskLevel = 'low' | 'moderate' | 'high';

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

function getSyncRisk(queueDepth: number, isOnline: boolean, hasLocation: boolean, hasPhotos: boolean): { score: number; level: SyncRiskLevel; message: string } {
  let score = 92;
  if (!isOnline) score -= 28;
  if (queueDepth >= 10) score -= 25;
  else if (queueDepth >= 4) score -= 12;
  if (!hasLocation) score -= 10;
  if (!hasPhotos) score -= 6;

  const normalized = Math.max(12, Math.min(100, score));
  if (normalized >= 80) {
    return { score: normalized, level: 'low', message: 'Sync conditions are stable for routine field capture and recovery.' };
  }
  if (normalized >= 55) {
    return { score: normalized, level: 'moderate', message: 'The mission remains workable, but queue growth or missing evidence could delay clean synchronization.' };
  }
  return { score: normalized, level: 'high', message: 'Capture can continue, but operators should expect elevated sync risk and follow the offline checklist carefully.' };
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

  const missionControl = useMemo(() => {
    const risk = getSyncRisk(queuedRecords.length, isOnline, Boolean(location), photos.length > 0);
    const evidenceCompleteness = [
      formData.parcelNumber.trim() ? 1 : 0,
      location ? 1 : 0,
      photos.length > 0 ? 1 : 0,
      formData.boundaries.trim() ? 1 : 0,
      formData.notes.trim() ? 1 : 0,
    ].reduce((total, current) => total + current, 0);

    return {
      ...risk,
      evidenceCompleteness,
      readinessLabel: isOnline ? 'Live sync available' : 'Offline capture mode',
      nextAction: !location
        ? 'Capture GPS coordinates before filing a final survey record.'
        : photos.length === 0
          ? 'Add at least one parcel photo to strengthen evidence quality.'
          : queuedRecords.length > 0
            ? 'Keep the app open when signal returns so the sync queue can flush safely.'
            : 'Mission package is in good shape for the next field record.',
    };
  }, [formData.boundaries, formData.notes, formData.parcelNumber, isOnline, location, photos.length, queuedRecords.length]);

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
    }
    setCameraActive(false);
  };

  const analyzePhoto = async (photoUrl: string) => {
    setAnalyzing(true);
    try {
      const result = await analyzePhotoMutation.mutateAsync({ imageUrl: photoUrl });
      setAnalysisResult(result);
      if (!formData.notes.trim() && result.notes) {
        setFormData((current) => ({ ...current, notes: result.notes }));
      }
    } catch (error) {
      toast.error((error as Error).message || 'Failed to analyze captured photo');
    } finally {
      setAnalyzing(false);
    }
  };

  const capturePhoto = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext('2d');
    if (!context) return;

    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.92);

    try {
      const uploadResult = await uploadMutation.mutateAsync({
        key: `field-surveys/${Date.now()}.jpg`,
        data: dataUrl.split(',')[1],
        contentType: 'image/jpeg',
      });
      setPhotos((current) => [...current, dataUrl]);
      setFormData((current) => ({ ...current, photos: [...current.photos, uploadResult.url] }));
      triggerHaptic(10);
      void analyzePhoto(uploadResult.url);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to upload photo');
    }
  };

  const saveRecord = async () => {
    if (!formData.parcelNumber.trim()) {
      toast.error('Parcel number is required');
      return;
    }

    if (!isOnline) {
      const queuedRecord: OfflineQueuedRecord = {
        ...formData,
        location,
        photos: formData.photos,
        queuedAt: new Date().toISOString(),
      };
      setQueuedRecords((current) => [queuedRecord, ...current]);
      triggerHaptic([20, 40, 20]);
      toast.success('Offline record queued for sync when connectivity returns');
      setFormData({ parcelNumber: '', location: null, area: '', boundaries: '', notes: '', photos: [] });
      setLocation(null);
      setPhotos([]);
      setAnalysisResult(null);
      return;
    }

    await syncFieldData.mutateAsync({
      parcelNumber: formData.parcelNumber.trim(),
      location,
      area: formData.area,
      boundaries: formData.boundaries,
      notes: formData.notes,
      photos: formData.photos,
      timestamp: new Date().toISOString(),
    });
  };

  return (
    <div className="container max-w-5xl space-y-4 py-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Field Surveyor</h1>
          <p className="text-sm text-muted-foreground">Capture and sync parcel verification data with resilient mobile mission control.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
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

      <div className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <Card>
          <CardHeader>
            <CardTitle>Mobile Mission Control</CardTitle>
            <CardDescription>{missionControl.message}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{missionControl.score}</div>
                <p className="text-xs text-muted-foreground">Sync Safety Score</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{queuedRecords.length}</div>
                <p className="text-xs text-muted-foreground">Queued Records</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-2xl font-bold">{missionControl.evidenceCompleteness}/5</div>
                <p className="text-xs text-muted-foreground">Evidence Completeness</p>
              </div>
              <div className="rounded-lg border p-3">
                <div className="text-sm font-semibold">{missionControl.readinessLabel}</div>
                <p className="text-xs text-muted-foreground">Capture Mode</p>
              </div>
            </div>

            <div className="rounded-lg border bg-muted/30 p-4 text-sm">
              <div className="flex items-start gap-3">
                <ClipboardList className="mt-0.5 h-4 w-4 text-primary" />
                <div>
                  <p className="font-medium">Next best action</p>
                  <p className="text-muted-foreground">{missionControl.nextAction}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Offline Execution Checklist</CardTitle>
            <CardDescription>Use this checklist to reduce sync conflicts and incomplete field submissions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-start gap-2 rounded-lg border p-3">
              {formData.parcelNumber.trim() ? <CheckCircle className="mt-0.5 h-4 w-4 text-green-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-600" />}
              <div>
                <p className="font-medium">Parcel reference</p>
                <p className="text-muted-foreground">Confirm a parcel identifier before leaving the site.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border p-3">
              {location ? <CheckCircle className="mt-0.5 h-4 w-4 text-green-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-600" />}
              <div>
                <p className="font-medium">GPS capture</p>
                <p className="text-muted-foreground">Collect device coordinates to reduce later validation disputes.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border p-3">
              {photos.length > 0 ? <CheckCircle className="mt-0.5 h-4 w-4 text-green-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-600" />}
              <div>
                <p className="font-medium">Visual evidence</p>
                <p className="text-muted-foreground">Attach at least one parcel image before syncing a final record.</p>
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border p-3">
              {queuedRecords.length < 10 ? <CheckCircle className="mt-0.5 h-4 w-4 text-green-600" /> : <AlertCircle className="mt-0.5 h-4 w-4 text-yellow-600" />}
              <div>
                <p className="font-medium">Queue depth</p>
                <p className="text-muted-foreground">Keep the queue manageable and allow it to flush when reliable signal returns.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {queuedRecords.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Queued for Synchronization</CardTitle>
            <CardDescription>These records are stored locally and will sync automatically when connectivity returns.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {queuedRecords.map((record, index) => (
              <div key={`${record.parcelNumber}-${record.queuedAt}-${index}`} className="rounded-lg border p-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-medium">{record.parcelNumber || 'Unlabelled parcel record'}</p>
                    <p className="text-muted-foreground">Queued {new Date(record.queuedAt).toLocaleString()}</p>
                    <p className="text-muted-foreground">{record.photos.length} photo(s) • {record.location ? 'GPS captured' : 'GPS pending'}</p>
                  </div>
                  <Badge variant="secondary">Pending sync</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
              <Button type="button" variant="outline" onClick={getCurrentLocation} className="min-h-11 flex-1">
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
                <Button type="button" variant="outline" onClick={startCamera} className="min-h-11 w-full">
                  <Camera className="mr-2 h-4 w-4" />
                  Open Camera
                </Button>
              ) : (
                <div className="space-y-2">
                  <video ref={videoRef} autoPlay playsInline className="w-full rounded-lg border" />
                  <canvas ref={canvasRef} className="hidden" />
                  <div className="flex gap-2">
                    <Button type="button" onClick={capturePhoto} className="min-h-11 flex-1" disabled={analyzing}>
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
                      loading="lazy"
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          <Button onClick={saveRecord} className="min-h-11 w-full" disabled={syncFieldData.isPending || isFlushingQueue}>
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
                      <div className="text-xs text-muted-foreground">Captured {new Date(record.timestamp).toLocaleString()}</div>
                      {record.locationLat !== null && record.locationLng !== null && (
                        <div className="text-xs text-muted-foreground">
                          GPS: {record.locationLat.toFixed(4)}, {record.locationLng.toFixed(4)}
                        </div>
                      )}
                      {record.notes && <div className="max-w-2xl text-sm text-muted-foreground">{record.notes}</div>}
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
