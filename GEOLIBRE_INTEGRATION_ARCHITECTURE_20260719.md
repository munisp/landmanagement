# GeoLibre Integration Architecture — 2026-07-19

**Author:** Manus AI  
**Repository:** `munisp/landmanagement`

After inspecting the upstream `opengeos/GeoLibre` repository, the most practical repository-feasible integration path is to integrate the **actual GeoLibre application as an embeddable workspace** rather than attempting to inline its entire private monorepo into the current platform.

| Decision area | Architecture decision | Rationale |
|---|---|---|
| **Integration target** | Integrate the actual **GeoLibre app** through its browser embed and map-only modes | The upstream project is a large private-workspace monorepo with its own app shell, workers, desktop packaging, Python package, and plugin/runtime assumptions. |
| **Frontend integration mode** | Add a dedicated **GeoLibre workspace page** inside the platform, rendered through an iframe with deep-link parameters | GeoLibre’s README and app conventions explicitly support embed-friendly URL parameters, direct deep links, onboarding suppression, and a map-only mode. |
| **Backend integration mode** | Add a **GeoLibre integration service and API contract** that generate launch URLs, parcel GeoJSON payloads, and readiness metadata | This lets the current platform pass parcel context into GeoLibre cleanly and consistently. |
| **Deployment boundary** | Treat GeoLibre as a **companion geospatial runtime** that can be self-hosted separately from the core platform | This avoids destabilizing the main land-management app while still integrating the exact upstream project. |
| **Current MapLibre workbench relationship** | Preserve the already-implemented internal MapLibre workbench, and position GeoLibre as the **advanced external geospatial studio** | The internal workbench remains useful for native operator workflows; GeoLibre becomes the high-capability exploration and GIS-authoring surface. |

This approach therefore implements **the specific GeoLibre project** in a realistic manner: the land-management platform will gain a native route, backend contract, and launch flow for the exact GeoLibre application, while keeping the current platform maintainable and production-safe.
