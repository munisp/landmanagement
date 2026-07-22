import { getParcelById, searchParcels, type ParcelRecord } from './parcelRepository';

function geoLibreBaseUrl(): string {
  const baseUrl = process.env.GEOLIBRE_BASE_URL?.trim();
  if (!baseUrl) throw new Error('GEOLIBRE_BASE_URL must be configured for GeoLibre integration');
  return baseUrl;
}

function distanceKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x)));
}

function buildPolygonCoordinates(parcel: ParcelRecord): number[][][] {
  if (parcel.geometryGeoJSON) {
    try {
      const parsed = JSON.parse(parcel.geometryGeoJSON) as GeoJSON.Geometry;
      if (parsed.type === 'Polygon' && parsed.coordinates?.[0]?.length >= 4) {
        return parsed.coordinates as number[][][];
      }
      if (parsed.type === 'MultiPolygon' && parsed.coordinates?.[0]?.[0]?.length >= 4) {
        return parsed.coordinates[0] as number[][][];
      }
    } catch {
      // Fall back to boundary or centroid construction.
    }
  }

  if (parcel.boundaryCoordinates) {
    const ring = String(parcel.boundaryCoordinates)
      .split(';')
      .map((pair) => pair.trim())
      .filter(Boolean)
      .map((pair) => {
        const [lat, lng] = pair.split(',').map(Number);
        return Number.isFinite(lat) && Number.isFinite(lng) ? [lng, lat] : null;
      })
      .filter((point): point is number[] => Array.isArray(point));

    if (ring.length >= 3) {
      const first = ring[0];
      const last = ring[ring.length - 1];
      const closed = first[0] === last[0] && first[1] === last[1] ? ring : [...ring, first];
      return [closed];
    }
  }

  throw new Error(`Parcel ${parcel.id} lacks a valid persisted polygon or boundary coordinate set`);
}

function toFeature(parcel: ParcelRecord, role: 'anchor' | 'nearby'): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {
      id: parcel.id,
      parcelNumber: parcel.parcelNumber,
      surveyPlanNumber: parcel.surveyPlanNumber,
      state: parcel.state,
      lga: parcel.lga,
      streetAddress: parcel.streetAddress,
      areaSquareMeters: parcel.areaSquareMeters,
      landUseType: parcel.landUseType,
      status: parcel.status,
      estimatedValue: parcel.estimatedValue,
      role,
    },
    geometry: {
      type: 'Polygon',
      coordinates: buildPolygonCoordinates(parcel),
    },
  };
}

function buildLaunchUrl() {
  const url = new URL(geoLibreBaseUrl());
  url.searchParams.set('maponly', '1');
  url.searchParams.set('welcome', '0');
  return url.toString();
}

export async function getGeoLibreLaunchContext(parcelId: number) {
  const parcel = await getParcelById(parcelId);
  if (!parcel) {
    throw new Error(`Parcel ${parcelId} not found`);
  }

  const anchorCoordinates = parcel.coordinates;
  if (!anchorCoordinates) {
    throw new Error(`Parcel ${parcelId} lacks persisted centroid coordinates required for proximity analysis`);
  }
  const allParcels = (await searchParcels({ page: 1, limit: 1000 })).parcels;
  const nearbyParcels = allParcels
    .filter((candidate): candidate is ParcelRecord & { coordinates: { lat: number; lng: number } } => candidate.id !== parcel.id && candidate.coordinates !== null)
    .map((candidate) => ({
      parcel: candidate,
      distanceKm: Number(distanceKm(anchorCoordinates, candidate.coordinates).toFixed(2)),
    }))
    .filter((candidate) => candidate.distanceKm <= 25)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 12);

  const featureCollection: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
    type: 'FeatureCollection',
    features: [
      toFeature(parcel, 'anchor'),
      ...nearbyParcels.map((candidate) => toFeature(candidate.parcel, 'nearby')),
    ],
  };

  return {
    provider: 'GeoLibre',
      baseUrl: geoLibreBaseUrl(),
    launchUrl: buildLaunchUrl(),
    embedMode: 'iframe-maponly',
    parcel: {
      id: parcel.id,
      parcelNumber: parcel.parcelNumber,
      state: parcel.state,
      lga: parcel.lga,
      coordinates: parcel.coordinates,
      landUseType: parcel.landUseType,
      areaSquareMeters: parcel.areaSquareMeters,
      estimatedValue: parcel.estimatedValue,
      status: parcel.status,
    },
    nearbyParcels: nearbyParcels.map((candidate) => ({
      id: candidate.parcel.id,
      parcelNumber: candidate.parcel.parcelNumber,
      distanceKm: candidate.distanceKm,
      landUseType: candidate.parcel.landUseType,
      estimatedValue: candidate.parcel.estimatedValue,
      status: candidate.parcel.status,
    })),
    exportBundle: {
      fileName: `${parcel.parcelNumber}-geolibre-context.geojson`,
      mimeType: 'application/geo+json',
      featureCount: featureCollection.features.length,
      geojson: featureCollection,
    },
    guidance: {
      summary: 'Open GeoLibre in the embedded workspace or a new tab, then load the exported GeoJSON context bundle for advanced GIS review.',
      nextSteps: [
        'Use the embedded GeoLibre studio for focused map exploration.',
        'Download the prepared GeoJSON context bundle for direct loading in GeoLibre.',
        'Review the anchor parcel together with nearby parcels for advanced geospatial comparison.',
      ],
    },
    generatedAt: new Date().toISOString(),
  };
}
