import { describe, expect, it } from 'vitest';
import { parsePersistedWktGeometry } from './geospatialGeometry';

describe('GeoLibre bridge geometry conversion', () => {
  it('preserves both polygons in a persisted multipolygon overlap footprint', () => {
    const geometry = parsePersistedWktGeometry(
      'MULTIPOLYGON (((3.300 6.500, 3.310 6.500, 3.310 6.510, 3.300 6.510, 3.300 6.500)), ((3.320 6.520, 3.330 6.520, 3.330 6.530, 3.320 6.530, 3.320 6.520)))'
    );

    expect(geometry).toMatchObject({ type: 'MultiPolygon' });
    expect((geometry as GeoJSON.MultiPolygon).coordinates).toHaveLength(2);
  });

  it('preserves polygon holes instead of flattening the persisted boundary', () => {
    const geometry = parsePersistedWktGeometry(
      'POLYGON ((3.300 6.500, 3.340 6.500, 3.340 6.540, 3.300 6.540, 3.300 6.500), (3.310 6.510, 3.330 6.510, 3.330 6.530, 3.310 6.530, 3.310 6.510))'
    );

    expect(geometry).toMatchObject({ type: 'Polygon' });
    expect((geometry as GeoJSON.Polygon).coordinates).toHaveLength(2);
  });

  it('omits malformed WKT instead of manufacturing a point at an unrelated coordinate', () => {
    expect(parsePersistedWktGeometry('MULTIPOLYGON (not valid)')).toBeNull();
    expect(parsePersistedWktGeometry('')).toBeNull();
  });
});
