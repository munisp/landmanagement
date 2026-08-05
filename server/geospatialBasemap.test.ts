import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { geospatialDeliveryHttpRouter } from './geospatialDeliveryHttp';

const originalEnvironment = { ...process.env };

function app() {
  const server = express();
  server.use('/api/geospatial-delivery', geospatialDeliveryHttpRouter);
  return server;
}

describe('approved basemap delivery', () => {
  beforeEach(() => {
    process.env.NODE_ENV = 'test';
    process.env.GEO_BASEMAP_PRIMARY_URL = 'https://primary.example.test/{z}/{x}/{y}.png';
    process.env.GEO_BASEMAP_FALLBACK_URL = 'https://fallback.example.test/{z}/{x}/{y}.png';
    process.env.GEO_BASEMAP_PUBLIC_ORIGIN = 'https://platform.example.test';
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const key of Object.keys(process.env)) if (!(key in originalEnvironment)) delete process.env[key];
    Object.assign(process.env, originalEnvironment);
  });

  it('publishes a same-origin style with no provider URL disclosure', async () => {
    const response = await request(app()).get('/api/geospatial-delivery/basemap/style.json');
    expect(response.status).toBe(200);
    expect(response.body.sources.platformBasemap.tiles).toEqual(['https://platform.example.test/api/geospatial-delivery/basemap/{z}/{x}/{y}.png']);
    expect(JSON.stringify(response.body)).not.toContain('primary.example.test');
  });

  it('uses the approved fallback only when the primary fails', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503, headers: { 'content-type': 'text/plain' } }));
    fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([137, 80, 78, 71]), { status: 200, headers: { 'content-type': 'image/png', etag: 'fallback-etag' } }));
    const response = await request(app()).get('/api/geospatial-delivery/basemap/4/3/2.png');
    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('image/png');
    expect(response.headers['cache-control']).toContain('stale-while-revalidate');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('primary.example.test/4/3/2.png');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('fallback.example.test/4/3/2.png');
  });

  it('rejects coordinates outside the tile matrix before fetching', async () => {
    const response = await request(app()).get('/api/geospatial-delivery/basemap/2/4/0.png');
    expect(response.status).toBe(400);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('fails closed when production basemap configuration is absent', async () => {
    delete process.env.GEO_BASEMAP_PRIMARY_URL;
    process.env.NODE_ENV = 'production';
    const response = await request(app()).get('/api/geospatial-delivery/basemap/style.json');
    expect(response.status).toBe(503);
  });
});
