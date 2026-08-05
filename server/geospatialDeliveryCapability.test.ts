import { beforeEach, describe, expect, it } from 'vitest';
import {
  GEO_DELIVERY_MAX_TTL_SECONDS,
  readBearerCapability,
  signGeospatialCapability,
  verifyGeospatialCapability,
} from './geospatialDeliveryCapability';

const secret = '0123456789abcdef0123456789abcdef';

beforeEach(() => {
  process.env.GEO_DELIVERY_CAPABILITY_SECRET = secret;
});

describe('geospatial delivery capability', () => {
  it('canonicalizes parcel scope and verifies the intended audience', () => {
    const token = signGeospatialCapability({
      aud: 'vector_tiles',
      sub: '42',
      parcels: [9, 3, 9],
      purpose: 'maplibre.parcel-review',
    });
    const capability = verifyGeospatialCapability(token, 'vector_tiles');
    expect(capability.parcels).toEqual([3, 9]);
    expect(capability.sub).toBe('42');
    expect(() => verifyGeospatialCapability(token, 'cesium_assets')).toThrow(/audience/i);
  });

  it('rejects tampered, expired, and malformed authorization capability values', () => {
    const token = signGeospatialCapability({
      aud: 'mobile_evidence',
      sub: '42',
      parcels: [7],
      purpose: 'mobile.evidence-view',
    }, 30);
    const [payload, signature] = token.split('.');
    expect(() => verifyGeospatialCapability(`${payload}.${signature.slice(0, -1)}A`, 'mobile_evidence')).toThrow(/signature/i);
    expect(() => verifyGeospatialCapability(token, 'mobile_evidence', Math.floor(Date.now() / 1000) + 31)).toThrow(/expired/i);
    expect(() => readBearerCapability('Capability token')).toThrow(/required/i);
    expect(readBearerCapability(`Bearer ${token}`)).toBe(token);
  });

  it('requires a bound asset key for Cesium and rejects invalid token construction', () => {
    expect(() => signGeospatialCapability({
      aud: 'cesium_assets', sub: '42', parcels: [7], purpose: 'cesium.parcel-review',
    })).toThrow(/asset key/i);
    expect(() => signGeospatialCapability({
      aud: 'vector_tiles', sub: 'not-a-user', parcels: [7], purpose: 'maplibre.parcel-review',
    })).toThrow(/subject/i);
    expect(() => signGeospatialCapability({
      aud: 'vector_tiles', sub: '42', parcels: [0], purpose: 'maplibre.parcel-review',
    })).toThrow(/scope/i);
    expect(() => signGeospatialCapability({
      aud: 'vector_tiles', sub: '42', parcels: [7], purpose: 'bad purpose', assetKey: 'asset-1',
    })).toThrow(/purpose/i);
    expect(() => signGeospatialCapability({
      aud: 'vector_tiles', sub: '42', parcels: [7], purpose: 'maplibre.parcel-review',
    }, GEO_DELIVERY_MAX_TTL_SECONDS + 1)).toThrow(/TTL/i);
  });

  it('preserves a valid Cesium asset binding in the verified claim', () => {
    const token = signGeospatialCapability({
      aud: 'cesium_assets', sub: '42', parcels: [7], purpose: 'cesium.parcel-review', assetKey: 'parcel-7-buildings',
    });
    expect(verifyGeospatialCapability(token, 'cesium_assets').assetKey).toBe('parcel-7-buildings');
  });
});
