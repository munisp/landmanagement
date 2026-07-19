# Geo/AI Integration Architecture — 2026-07-19

This integration tranche will introduce a **dual geospatial and AI enhancement path** that is repository-feasible within the current platform architecture.

| Integration area | Implementation approach | Primary code targets |
|---|---|---|
| **MapLibre-compatible mapping** | Add a dedicated MapLibre-based parcel workbench component instead of breaking all existing Google Maps consumers at once. This creates a real MapLibre integration while preserving current Google-based workflows that still depend on drawing-manager and other provider-specific APIs. | `package.json`, new client map component, `client/src/pages/AdvancedGeospatialCenter.tsx` |
| **Apache Sedona-aligned spatial analytics** | Add Python lakehouse endpoints that expose Sedona-style spatial operations and runtime status. The implementation will prefer Sedona when installed, but remain operational with GeoPandas/Shapely/scikit-learn fallback so the repository stays runnable in local environments. | `lakehouse/requirements.txt`, `lakehouse/api/main.py`, `server/lakehouseClient.ts`, `server/geospatialIntelligenceService.ts`, `server/api/routers/geospatial-intelligence.ts` |
| **Geospatial AI / CV / NLP** | Extend the existing AI photo-analysis service with EXIF-aware geospatial enrichment, richer structured outputs, and survey-oriented recommendations. Surface these capabilities through the geospatial intelligence backend contract. | `package.json`, `server/propertyPhotoAIService.ts`, `server/api/routers/geospatial-intelligence.ts`, `client/src/pages/AdvancedGeospatialCenter.tsx` |

The implementation will therefore deliver three concrete outcomes. First, the platform will gain a **real MapLibre rendering surface** for parcel intelligence. Second, the lakehouse will gain **Sedona-ready spatial analytics patterns** for runtime status, clustering, nearest-neighbor reasoning, and hotspot/outlier insights. Third, the platform will gain a stronger **AI-assisted geospatial analysis layer** connected to photo analysis and operator-facing geospatial workflows.
