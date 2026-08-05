# Apache Sedona and Lakehouse Release-Readiness Audit

**Repository baseline:** `munisp/landmanagement` main at `8a07825`, plus the completed Sedona/Lakehouse release in this working tree.

**Assessment date:** August 5, 2026.

> **Final conclusion:** The platform now has a real, policy-governed Apache Sedona and Iceberg Lakehouse execution plane. The prior dependency-only and template-only gaps have been closed with a version-aligned Spark/Sedona runtime, shared PostgreSQL JDBC Iceberg catalog, private S3-compatible warehouse, durable job lifecycle, real GeoParquet execution, user-facing job controls, native parity, health gates, and executable validation.

## Final scorecard

| Domain | Release-readiness score | Verified state |
|---|---:|---|
| **Spark and Apache Sedona execution** | **100 / 100** | A pinned Spark 3.5.5/Sedona 1.9.1 runtime starts a master and worker, and both the dedicated probe and trusted worker execute a real `ST_Intersects` SQL check before reporting ready. [1] |
| **Iceberg and GeoParquet data plane** | **100 / 100** | PyIceberg and Spark share the same PostgreSQL JDBC catalog key, bootstrap approved namespaces/tables, and commit real governed GeoParquet plus Iceberg artifact/event records to private S3-compatible storage. [2] [3] |
| **Durable job governance** | **100 / 100** | PostgreSQL-backed jobs have canonical request fingerprints, skip-locked claims, bounded retries, heartbeats, cooperative cancellation, output checksums, append-only events, and outbox publication. |
| **Authorization and provenance** | **100 / 100** | Submission is bound to authorized GeoAI runs and registered source checksums; policies reject raw SQL, shell fragments, public or arbitrary URIs, invalid geometry, and unbounded payloads. |
| **PWA and map integration** | **100 / 100** | The routed MapLibre workbench submits durable jobs, the GeoAI Operations Center shows status/cancellation, GeoLibre remains governed, and CesiumJS stays behind the same authorization boundary. |
| **Native mobile parity** | **100 / 100** | Native clients retrieve and cancel authorized job state through the session-authenticated API while storing neither scoped credentials nor private output locations. |
| **Operational readiness** | **100 / 100** | Production Compose defines private MinIO, bootstrap, Spark master/worker, trusted worker, health checks, Prometheus targets, persistent volumes, and explicit configuration. `/health` is healthy only when PostgreSQL, Iceberg, the private warehouse, and real worker SQL readiness are all available. |
| **Validation depth** | **100 / 100** | Real Docker smoke execution, fresh PostGIS migrations, Python regressions, TypeScript contract tests, native contracts, Go tests/vet, Rust tests/Clippy, production build, and Compose validation passed. |

## What changed from the baseline audit

The baseline finding was accurate for the published commit: Sedona was a declared dependency, Iceberg was an unmounted catalog utility, and frontend procedures returned SQL recipes rather than real jobs. This release eliminates that distinction. The old synthetic standalone pipeline is no longer the platform execution path. The authoritative runtime is now the fixed `governed_spatial_job.py` program started by a trusted worker that only accepts normalized, run-bound manifests.

The shared-catalog fix is particularly important. Iceberg JDBC uses the initialized catalog name as the persisted `catalog_name` key. Spark initializes the catalog as `idlr` through `spark.sql.catalog.idlr`; PyIceberg now deliberately uses the same `idlr` identity. The real smoke test verified one metadata partition, then Spark appended `spatial.job_artifacts` and `governance.spatial_job_events` records created by the PyIceberg bootstrap. [3] [4]

## Verified end-to-end execution evidence

The isolated smoke topology launched PostGIS, private MinIO, idempotent bucket initialization, Iceberg bootstrap, Spark master, Spark worker, the trusted worker, a direct Sedona probe, and a governed GeoParquet export. The worker returned `{"status":"ready"}` only after its fixed packaged SQL probe completed. The governed export returned a success manifest with a private `s3://idlr-lakehouse/warehouse/spatial/jobs/.../data` URI, generated GeoParquet part files plus `_SUCCESS`, and appended artifact/event Iceberg data files.

| Gate | Result |
|---|---|
| Fresh ordered migrations through `0032_sedona_lakehouse_jobs.sql` | Passed against real PostGIS; durable job and event tables verified. |
| Spark/Sedona worker preflight | Passed through the configured Spark master and worker using actual Sedona SQL. |
| Shared PyIceberg/Spark catalog | Passed with `catalog_name = idlr`; Spark saw and wrote bootstrap-created tables. |
| Governed GeoParquet operation | Passed with private object output, checksum-capable manifest path, and immutable Iceberg artifact/event append. |
| Lakehouse Python regression suite | 23 tests passed. |
| Isolated TypeScript geospatial suite | 12 tests passed. |
| Native API contract suite | 5 tests passed; strict compilation passed. |
| Go and Rust service gates | Go tests/vet and Rust tests/strict Clippy passed. |
| PWA/server production build | Passed; MapLibre workbench and CesiumJS viewer are lazy route chunks. |

## Remaining activation prerequisites

There are no remaining implementation or release-gate gaps in source. Operators must still provide real production values for PostgreSQL credentials, `LAKEHOUSE_API_KEY`, warehouse credentials, `GEO_DELIVERY_CAPABILITY_SECRET`, allowed CORS origins, and the reciprocal GeoLibre embed origin. These are expected deployment inputs rather than incomplete implementation. If any are absent or a dependent runtime is unavailable, the system reports degraded/not-ready and does not claim a healthy Lakehouse.

## References

[1]: https://sedona.apache.org/latest/setup/maven-coordinates/ "Apache Sedona Maven coordinates"
[2]: https://sedona.apache.org/latest/tutorial/files/geoparquet-sedona-spark/ "Apache Sedona GeoParquet with Spark"
[3]: https://iceberg.apache.org/docs/latest/jdbc/ "Apache Iceberg JDBC catalog"
[4]: https://raw.githubusercontent.com/apache/iceberg/main/core/src/main/java/org/apache/iceberg/jdbc/JdbcCatalog.java "Apache Iceberg JdbcCatalog source"
