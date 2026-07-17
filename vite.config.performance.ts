import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { visualizer } from 'rollup-plugin-visualizer';
import { compression } from 'vite-plugin-compression2';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Performance-optimized Vite configuration
 * Implements code splitting, lazy loading, compression, and PWA features
 */
export default defineConfig({
  plugins: [
    react(),
    
    // Bundle size visualization
    visualizer({
      filename: './dist/stats.html',
      open: false,
      gzipSize: true,
      brotliSize: true,
    }),
    
    // Brotli and Gzip compression
    compression({
      algorithm: 'brotliCompress',
      exclude: [/\.(br)$/, /\.(gz)$/],
      threshold: 1024, // Only compress files > 1KB
      deleteOriginalAssets: false,
    }),
    compression({
      algorithm: 'gzip',
      exclude: [/\.(br)$/, /\.(gz)$/],
      threshold: 1024,
      deleteOriginalAssets: false,
    }),
    
    // Progressive Web App
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'robots.txt', 'apple-touch-icon.png'],
      manifest: {
        name: 'IDLR Property Title System',
        short_name: 'IDLR PTS',
        description: 'Integrated Digital Land Registry & Property Title System',
        theme_color: '#1e40af',
        background_color: '#ffffff',
        display: 'standalone',
        orientation: 'portrait',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cache strategies
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.idlr\.gov\.ng\/.*$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60, // 1 hour
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: /^https:\/\/.*\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
            },
          },
        ],
        // Precache critical assets
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api/],
      },
    }),
  ],
  
  build: {
    // Target modern browsers for smaller bundles
    target: 'es2020',
    
    // Optimize chunk size
    chunkSizeWarningLimit: 1000,
    
    rollupOptions: {
      output: {
        // Manual chunk splitting for optimal caching
        manualChunks: {
          // Vendor chunks
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-select'],
          'vendor-forms': ['react-hook-form', 'zod'],
          'vendor-query': ['@tanstack/react-query'],
          'vendor-utils': ['clsx', 'tailwind-merge', 'date-fns'],
          
          // Feature chunks
          'feature-maps': ['./client/src/components/Map.tsx'],
          'feature-charts': ['recharts'],
          'feature-blockchain': ['./client/src/pages/Blockchain.tsx'],
          'feature-analytics': ['./client/src/pages/Analytics.tsx'],
        },
        
        // Asset file naming with content hash
        assetFileNames: (assetInfo) => {
          const info = assetInfo.name.split('.');
          const ext = info[info.length - 1];
          
          if (/png|jpe?g|svg|gif|tiff|bmp|ico/i.test(ext)) {
            return `assets/images/[name]-[hash][extname]`;
          } else if (/woff|woff2|eot|ttf|otf/i.test(ext)) {
            return `assets/fonts/[name]-[hash][extname]`;
          }
          
          return `assets/[name]-[hash][extname]`;
        },
        
        // Chunk file naming
        chunkFileNames: 'assets/js/[name]-[hash].js',
        entryFileNames: 'assets/js/[name]-[hash].js',
      },
    },
    
    // Minification
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true, // Remove console.log in production
        drop_debugger: true,
        pure_funcs: ['console.log', 'console.info', 'console.debug'],
      },
      format: {
        comments: false, // Remove comments
      },
    },
    
    // Source maps for production debugging
    sourcemap: 'hidden',
    
    // CSS code splitting
    cssCodeSplit: true,
    
    // Optimize dependencies
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  
  // Optimize dependencies
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tanstack/react-query',
    ],
    exclude: ['@vite/client', '@vite/env'],
  },
  
  // Server configuration
  server: {
    // Enable HTTP/2
    https: false, // Set to true in production with SSL certs
    
    // Compression
    compress: true,
    
    // CORS
    cors: true,
    
    // Preload
    preTransformRequests: true,
  },
  
  // Preview server (production build testing)
  preview: {
    port: 4173,
    strictPort: true,
    host: true,
  },
  
  // Performance budgets
  esbuild: {
    logOverride: {
      'this-is-undefined-in-esm': 'silent',
    },
    // Tree shaking
    treeShaking: true,
    // Minify identifiers
    minifyIdentifiers: true,
    // Minify syntax
    minifySyntax: true,
    // Minify whitespace
    minifyWhitespace: true,
  },
});
