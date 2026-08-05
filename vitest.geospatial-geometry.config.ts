import { defineConfig } from 'vitest/config';
import path from 'node:path';

const projectRoot = path.resolve(import.meta.dirname);

export default defineConfig({
  root: projectRoot,
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'client', 'src'),
      '@shared': path.resolve(projectRoot, 'shared'),
      '@assets': path.resolve(projectRoot, 'attached_assets'),
    },
  },
  test: {
    environment: 'node',
    include: ['server/geolibreEmbedBridge.test.ts', 'server/geospatialDeliveryCapability.test.ts', 'server/geospatialBasemap.test.ts', 'server/sedonaJobPolicy.test.ts'],
    setupFiles: ['server/geospatialDeliveryCapability.test.setup.ts'],
    testTimeout: 10_000,
    hookTimeout: 10_000,
  },
});
