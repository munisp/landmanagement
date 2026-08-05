import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import * as MapLibre from '@maplibre/maplibre-react-native';
import { AppScreen } from '../../components/AppScreen';
import { useMobileSession } from '../../providers/MobileSessionProvider';
import { trpcQuery } from '../../services/api';
import { getApiBaseUrl } from '../../lib/runtimeConfig';

type ParcelMapRecord = { id: number; parcelNumber: string; coordinates?: string | null; boundaryCoordinates?: string | null; geometryGeoJSON?: string | null; streetAddress?: string | null; state?: string | null; lga?: string | null; areaSquareMeters?: number | null };

type Position = [number, number];

function parcelIdFrom(value: string | string[] | undefined): number | null { const parsed = Number(Array.isArray(value) ? value[0] : value); return Number.isInteger(parsed) && parsed > 0 ? parsed : null; }
function parseCenter(value?: string | null): Position | null { if (!value) return null; const [lat, lng] = value.split(',').map(Number); return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lng, lat] : null; }
function parseBoundary(value?: string | null): Position[] | null { if (!value) return null; const points = value.split(';').map((item) => item.split(',').map(Number)).filter(([lat, lng]) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180).map(([lat, lng]) => [lng, lat] as Position); return points.length >= 3 ? [...points, points[0]!] : null; }
function parcelFeature(parcel: ParcelMapRecord, center: Position): GeoJSON.FeatureCollection { const boundary = parseBoundary(parcel.boundaryCoordinates); return { type: 'FeatureCollection', features: boundary ? [{ type: 'Feature', properties: { evidence: 'persisted_boundary' }, geometry: { type: 'Polygon', coordinates: [boundary] } }] : [{ type: 'Feature', properties: { evidence: 'recorded_center_only' }, geometry: { type: 'Point', coordinates: center } }] }; }
function styleUrl(): string { return `${getApiBaseUrl()}/geospatial-delivery/basemap/style.json`; }
function packBounds(center: Position): [Position, Position] { const delta = 0.025; return [[center[0] - delta, center[1] - delta], [center[0] + delta, center[1] + delta]]; }

export function MobileMapLibreParcelScreen() {
  const { parcelId: rawParcelId } = useLocalSearchParams<{ parcelId: string }>();
  const parcelId = parcelIdFrom(rawParcelId);
  const session = useMobileSession();
  const [offlineState, setOfflineState] = useState<'idle' | 'downloading' | 'ready' | 'error'>('idle');
  const [offlineProgress, setOfflineProgress] = useState<string>('');
  const query = useQuery({ queryKey: ['mobile-map-parcel', parcelId], queryFn: () => trpcQuery<ParcelMapRecord>('parcels.getById', { id: parcelId }, session.accessToken), enabled: Boolean(parcelId && session.accessToken), staleTime: 5 * 60 * 1000 });

  if (!parcelId) return <View style={styles.center}><Text style={styles.error}>The requested parcel identifier is invalid.</Text></View>;
  if (query.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#2563eb" /><Text style={styles.muted}>Loading governed parcel map…</Text></View>;
  if (query.error || !query.data) return <View style={styles.center}><Text style={styles.error}>{query.error?.message ?? 'This parcel is unavailable.'}</Text><Pressable onPress={() => void query.refetch()} style={styles.secondary}><Text style={styles.secondaryText}>Retry securely</Text></Pressable></View>;

  const parcel = query.data;
  const center = parseCenter(parcel.coordinates);
  if (!center) return <AppScreen scroll><View style={styles.card}><Text style={styles.title}>No persisted survey location</Text><Text style={styles.muted}>A MapLibre field review cannot be rendered until the platform records valid parcel coordinates. The application will not create an inferred map location or boundary.</Text></View></AppScreen>;
  const featureCollection = parcelFeature(parcel, center);
  const downloadApprovedBasemap = async () => {
    const packName = `idlr-approved-basemap-parcel-${parcelId}-v1`;
    try {
      setOfflineState('downloading'); setOfflineProgress('Preparing the approved basemap package…');
      MapLibre.OfflineManager.setTileCountLimit(2_000);
      await MapLibre.OfflineManager.setMaximumAmbientCacheSize(25 * 1024 * 1024);
      const existing = await MapLibre.OfflineManager.getPack(packName);
      const expiresAt = typeof existing?.metadata?.expiresAt === 'string' ? Date.parse(existing.metadata.expiresAt) : Number.NaN;
      if (existing && Number.isFinite(expiresAt) && expiresAt > Date.now()) { setOfflineState('ready'); setOfflineProgress('The approved basemap package is already available on this device.'); return; }
      if (existing) await MapLibre.OfflineManager.deletePack(packName);
      await MapLibre.OfflineManager.createPack({ name: packName, styleURL: styleUrl(), bounds: packBounds(center), minZoom: 12, maxZoom: 16, metadata: { parcelId, kind: 'approved_basemap_only', expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() } }, (_pack: unknown, status: { percentage: number }) => { setOfflineProgress(`Downloading approved basemap: ${Math.round(status.percentage)}%`); if (status.percentage >= 100) setOfflineState('ready'); }, (_pack: unknown, error: unknown) => { setOfflineState('error'); setOfflineProgress(error instanceof Error ? error.message : 'The approved basemap package could not be downloaded.'); });
    } catch (error) { setOfflineState('error'); setOfflineProgress(error instanceof Error ? error.message : 'The approved basemap package could not be created.'); }
  };

  return <AppScreen scroll={false}><View style={styles.header}><Text style={styles.title}>{parcel.parcelNumber || `Parcel ${parcelId}`}</Text><Text style={styles.subtitle}>{parcel.streetAddress || [parcel.lga, parcel.state].filter(Boolean).join(', ') || 'Recorded parcel location'}</Text></View><View style={styles.mapWrap}><MapLibre.MapView style={styles.map} mapStyle={styleUrl()} logoEnabled attributionEnabled compassEnabled rotateEnabled pitchEnabled><MapLibre.Camera centerCoordinate={center} zoomLevel={15} animationDuration={0} /><MapLibre.ShapeSource id="parcel-evidence" shape={featureCollection}>{parseBoundary(parcel.boundaryCoordinates) ? <><MapLibre.FillLayer id="parcel-fill" style={{ fillColor: '#2563eb', fillOpacity: 0.22 }} /><MapLibre.LineLayer id="parcel-line" style={{ lineColor: '#1d4ed8', lineWidth: 3 }} /></> : <MapLibre.CircleLayer id="parcel-center" style={{ circleColor: '#2563eb', circleRadius: 8, circleStrokeColor: '#ffffff', circleStrokeWidth: 2 }} />}</MapLibre.ShapeSource></MapLibre.MapView></View><View style={styles.card}><Text style={styles.section}>Governed field-map boundary</Text><Text style={styles.muted}>{parseBoundary(parcel.boundaryCoordinates) ? 'This overlay uses the parcel’s persisted boundary coordinate record. It is shown for review and does not allow device-side edits.' : 'Only the recorded parcel center is available. The app intentionally does not infer a boundary from area, address, or device location.'}</Text></View><View style={styles.card}><Text style={styles.section}>Approved offline basemap</Text><Text style={styles.muted}>The optional package contains only the approved public basemap around this parcel. It does not contain vector tiles, parcel geometry, evidence metadata, 3D assets, service capabilities, or private output locations.</Text><Pressable onPress={() => void downloadApprovedBasemap()} disabled={offlineState === 'downloading'} style={[styles.primary, offlineState === 'downloading' && styles.disabled]}><Text style={styles.primaryText}>{offlineState === 'downloading' ? 'Downloading…' : offlineState === 'ready' ? 'Approved basemap available' : 'Download approved offline basemap'}</Text></Pressable>{offlineProgress ? <Text style={[styles.progress, offlineState === 'error' && styles.error]}>{offlineProgress}</Text> : null}</View><View style={styles.notice}><Text style={styles.noticeText}>This map is not a title, legal survey, cadastral certification, engineering output, or regulatory decision. Reconnect to revalidate the authoritative platform record.</Text></View></AppScreen>;
}

const styles = StyleSheet.create({ center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc', padding: 24, gap: 12 }, header: { padding: 16, gap: 4 }, title: { color: '#0f172a', fontWeight: '800', fontSize: 22 }, subtitle: { color: '#64748b', fontSize: 13 }, mapWrap: { height: 440, marginHorizontal: 16, overflow: 'hidden', borderRadius: 14, borderColor: '#cbd5e1', borderWidth: 1 }, map: { flex: 1 }, card: { marginHorizontal: 16, marginTop: 12, padding: 15, gap: 9, borderRadius: 14, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' }, section: { color: '#0f172a', fontSize: 16, fontWeight: '800' }, muted: { color: '#475569', fontSize: 13, lineHeight: 19 }, primary: { backgroundColor: '#2563eb', borderRadius: 10, alignItems: 'center', padding: 13, marginTop: 4 }, primaryText: { color: '#fff', fontWeight: '800' }, secondary: { borderColor: '#cbd5e1', borderWidth: 1, borderRadius: 10, padding: 12 }, secondaryText: { color: '#334155', fontWeight: '800' }, disabled: { opacity: 0.6 }, progress: { color: '#1e40af', fontSize: 12, lineHeight: 17 }, error: { color: '#b91c1c', textAlign: 'center' }, notice: { margin: 16, padding: 13, borderRadius: 12, borderColor: '#fde68a', borderWidth: 1, backgroundColor: '#fffbeb' }, noticeText: { color: '#92400e', fontSize: 12, lineHeight: 18 } });
