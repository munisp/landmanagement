# Geo/AI Integration Working Notes — 2026-07-19

## Current Geospatial Stack Baseline

- The current shared frontend map component at `client/src/components/Map.tsx` is **Google Maps-specific**.
- The backend helper at `server/_core/map.ts` is also **Google Maps proxy-specific**.
- The heaviest current Google Maps consumers are:
  - `client/src/pages/ParcelMap.tsx`
  - `client/src/components/GeospatialSearchWithBatch.tsx`
  - plus smaller consumers such as `ParcelMapView.tsx` and `GeospatialSearch.tsx`.
- The existing geospatial analytics backend includes:
  - `server/api/routers/geo-analytics.ts`
  - `server/parcelDigitalTwinService.ts`
  - the new `server/geospatialIntelligenceService.ts` already added earlier.

## Current AI / ML Baseline

- The codebase already contains LLM-backed AI features through `server/_core/llm.ts` and `invokeLLM` usage.
- Existing AI-adjacent services include:
  - `server/documentVerificationService.ts`
  - `server/documentAIService.ts`
  - `server/propertyPhotoAIService.ts`
- `propertyPhotoAIService.ts` is a real LLM-vision integration pattern, but GPS EXIF extraction is still a placeholder.
- `documentVerificationService.ts` includes OCR and VLM-oriented flows, but some paths are explicitly simulated.

## Current Python Analytics Baseline

- The lakehouse service at `lakehouse/api/main.py` is the right place to add **Sedona-aligned spatial analytics endpoints**.
- Existing Python dependencies already include:
  - `geopandas`
  - `shapely`
  - `scikit-learn`
  - `xgboost`
- The repo does **not** currently include Apache Sedona in `lakehouse/requirements.txt`.

## External Technology Findings

- MapLibre GL JS is a TypeScript/WebGL mapping library for rendering interactive maps from vector tiles and supports markers, popups, GeoJSON layers, raster/vector tile sources, terrain, clustering, and draw-oriented integrations.
- Apache Sedona is a large-scale spatial data processing framework with Spatial SQL, range queries, KNN, joins, CRS transformation, DBSCAN, LOF, hotspot analysis, and both local and distributed runtime patterns.

## Practical Integration Direction

- Implement a **dual-stack or adapter-based map layer** that introduces MapLibre-compatible rendering without immediately breaking all Google Maps consumers.
- Add **Sedona-aligned spatial analytics endpoints** in Python, with optional local compatibility using current GeoPandas/Shapely dependencies when a full Sedona runtime is unavailable.
- Strengthen AI geospatial capabilities by adding geospatially aware photo analysis, structured geospatial insight extraction, and ML-backed spatial scoring on top of the current LLM and Python analytics foundations.
