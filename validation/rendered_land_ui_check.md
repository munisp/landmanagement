# Rendered Land UI Check

## Context Globe

Rendered production-preview route: `/context-globe`.

The screen displayed the read-only public-context layout, time-window controls, contextual decision boundary, Cesium globe canvas, operational navigation help, refresh affordance, current-observation panel, attribution area, and online-only/situational-awareness guidance. The preview had no signed-in layer policy, so no event layers or observations were requested. This correctly surfaced a policy-unavailable state rather than fabricated map data.

## Advanced Geospatial Center

Rendered production-preview route: `/advanced-geospatial-center`.

The screen displayed the geospatial workbench with MapLibre map canvas, basemap selector, terrain control, layer panel, tool tabs, governed-workbench summary, parcel ID launcher, and links into 3D visualization, geo analytics, drone processing, parcel map, GeoLibre, GeoAI, and Context Globe. The preview environment had no loaded parcel or spatial worker context, so map indicators showed loading/zero state and the Cesium panel showed asset discovery unavailable. These are truthful live-preview states, not mocked data.

## Scope

The checked routes demonstrate land and map UI integration in the production bundle. Authoritative geospatial content requires a signed-in user, permitted parcel context, and active spatial/Lakehouse delivery services.
