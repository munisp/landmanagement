# Sedona and Lakehouse Production Implementation Contract

**Repository baseline:** `munisp/landmanagement` main at `8a07825`.

> **Implementation objective:** Replace dependency-only Apache Sedona and recipe-only GeoParquet paths with a real, policy-governed Spark/Sedona execution plane backed by PostgreSQL, Iceberg metadata, S3-compatible object storage, and durable GeoAI evidence workflows.

## Version and deployment matrix

| Component | Locked implementation | Reason |
|---|---|---|
| Apache Spark | **3.5.5**, Scala 2.12, Java 17 | A stable standalone cluster line with a matching Sedona 1.9.1 shaded artifact. |
| Apache Sedona | **1.9.1** | Official Sedona 1.9.1 artifacts support Spark 3.5/Scala 2.12; the shaded JAR avoids application-level transitive dependency conflicts.[1] |
| Iceberg Spark runtime | **1.7.1** for Spark 3.5/Scala 2.12 | Open-table-format execution and catalog integration in the same Spark runtime. |
| Iceberg catalog | **JDBC catalog on PostgreSQL** | Keeps catalog metadata open source, on-premise/cloud agnostic, and consistent with the platform’s PostgreSQL preference. |
| Warehouse | **S3-compatible MinIO in Compose** | Provides a local, private, production-portable object-store implementation. Production may point the same S3A configuration at an approved object store. |
| Vector spatial outputs | **Sedona GeoParquet + Iceberg catalog records** | Preserves typed geometries, CRS, file metadata, and efficient spatial distribution.[2] |
| Raster and viewshed outputs | **Lakehouse worker job with authoritative Rasterio/DEM computation and registered artifacts** | Uses the existing verified authority logic where a raster-only computation is required; results remain submitted, tracked, and persisted through the same governed job plane. |

## Services and trust boundaries

| Service | Responsibility | Trust boundary |
|---|---|---|
| TypeScript application and tRPC | Enforces user authorization before starting a GeoAI/Sedona run, exposes job status, and renders only authorized outputs. | User/session and Permify boundary. |
| Lakehouse API | Validates internal service requests, submits normalized job payloads, exposes non-secret status, and never executes caller-provided shell/SQL text. | `X-Lakehouse-Api-Key` internal-service boundary. |
| Sedona job runner | Claims database-backed jobs with row locks, starts a fixed `spark-submit` command, heartbeats, cancels safely, parses a structured result, and persists lifecycle/audit records. | Internal database plus dedicated container network. |
| Sedona Spark master/workers | Run prepackaged, version-aligned spatial code only. | Internal-only Spark network; no published submission port. |
| PostgreSQL/PostGIS | Operational source records, durable job lifecycle, audit events, and Iceberg JDBC catalog metadata. | Existing database authentication and service network. |
| MinIO/S3-compatible warehouse | Stores GeoParquet, manifest, and derived output files. | Private service network; credentials only in service environment. |

## Durable job lifecycle

`queued → claimed → running → succeeded | failed | cancelled`

Every job has an immutable request fingerprint, requested user, optional GeoAI run and parcel scope, normalized operation, input manifest digest, attempt count, worker heartbeat, Spark application ID, result summary, output URI, checksum, and append-only event records. A worker may claim a job only with `FOR UPDATE SKIP LOCKED`; stale workers are recoverable after a bounded heartbeat timeout. Cancellation is cooperative: the worker detects a persisted cancellation request, terminates the `spark-submit` driver, and records a terminal cancellation event.

The job runner takes an operation enum and JSON payload stored in a local file. It **does not** execute arbitrary SQL, Python, file paths, Maven coordinates, or shell fragments supplied by a client. The Spark image contains the approved Sedona/Iceberg/Hadoop/JDBC runtime dependencies before deployment.

## Supported governed operations

| Operation | Engine | Input | Output |
|---|---|---|---|
| `geoparquet_export` | Spark + Sedona | Authorized parcel feature snapshot | Cataloged GeoParquet artifact and Iceberg artifact record |
| `topology_validation` | Spark + Sedona | Authorized polygon feature snapshot | Provenance-bearing violation rows, overlap geometry, and GeoParquet result |
| `spatial_workbench` | Spark + Sedona | Anchor and nearby parcel snapshot | Cluster, neighbour, and aggregate workbench result |
| `zonal_statistics` | Lakehouse authority in a submitted worker job | Registered raster and governed zone manifest | Statistics result and evidence metadata |
| `viewshed` | Lakehouse authority in a submitted worker job | Registered DEM and observer manifest | Visibility artifact and evidence metadata |

## Storage and provenance invariants

Spatial output rows must carry `job_id`, `analysis_run_id` when present, `parcel_id` when present, source asset identifiers/checksums, source CRS, output CRS, created timestamp, operation version, and an output checksum. No output is eligible for a verified evidence state without the existing independent review step.

The GeoParquet writer uses a geometry column with a declared CRS and the object-store URI is registered only after the job result validates. Official Sedona documentation identifies GeoParquet’s geometry metadata, CRS handling, and spatial filtering benefits; the implementation uses this format for large vector delivery rather than generating client-side JSON exports.[2]

## Acceptance criteria

1. A real containerized Spark master and at least one worker start with Sedona 1.9.1 and execute `ST_Intersects` in a readiness probe.
2. The Lakehouse health endpoint reports a real Spark probe, a real JDBC catalog probe, and a real warehouse probe—not package-import checks.
3. A submitted authorized GeoParquet job writes a valid artifact to private S3-compatible storage, registers it in PostgreSQL/Iceberg, and returns a durable status record.
4. A topology job reads real WKT/GeoJSON geometry snapshot inputs, produces actual overlap geometry, and never returns an invented coordinate or template-only SQL.
5. Job input validation rejects arbitrary SQL, external shell arguments, untrusted output URIs, invalid geometry, unauthorized parcel references, and expired/cancelled jobs.
6. Results appear through the existing GeoAI evidence lifecycle and user-facing status surfaces; no client calls the Spark or object-store services directly.
7. Unit, static, service-contract, and Docker Compose smoke tests demonstrate success, timeout/retry, cancellation, invalid payload, unavailable warehouse, and unavailable Spark behavior.

## References

[1]: https://sedona.apache.org/latest/setup/maven-coordinates/ "Apache Sedona Maven coordinates"
[2]: https://sedona.apache.org/latest/tutorial/files/geoparquet-sedona-spark/ "Apache Sedona GeoParquet with Spark"
[3]: https://iceberg.apache.org/spark-quickstart/ "Apache Iceberg Spark quickstart"

## Completed validation evidence

The implementation was validated as an executable distributed data plane, not a dependency or import check. An isolated PostGIS database accepted the complete ordered migration chain through `0032_sedona_lakehouse_jobs.sql`, including the `sedona_spatial_jobs` and append-only `sedona_spatial_job_events` tables. The same migration procedure was run from a clean database and confirmed both new tables after all predecessor schemas had applied successfully. In the final extended smoke run, the live Lakehouse API returned `status: healthy` only after PostgreSQL, all six approved Iceberg namespaces, the private MinIO warehouse, and the trusted worker's real Sedona SQL readiness endpoint were simultaneously available.

A real host-network Docker smoke topology then started PostgreSQL/PostGIS, private MinIO, idempotent private-bucket bootstrap, PyIceberg catalog bootstrap, Spark master, Spark worker, the trusted Sedona worker, a fixed Sedona SQL probe, and a governed GeoParquet operation. The worker’s `/ready` endpoint returned `{"status": "ready"}` only after it launched the fixed packaged `runtime_probe.py` through the configured Spark master and completed the Sedona `ST_Intersects` query. The governed job wrote two GeoParquet part files and `_SUCCESS` under the private `s3://idlr-lakehouse/warehouse/spatial/jobs/...` prefix, then appended immutable records to the shared `idlr.spatial.job_artifacts` and `idlr.governance.spatial_job_events` Iceberg tables.

> **Shared-catalog invariant:** Spark’s `JdbcCatalog` persists the initialized Spark catalog alias as its `catalog_name` key. PyIceberg therefore uses the same `idlr` identity as `spark.sql.catalog.idlr`; the live smoke test verified that both engines read and wrote the same PostgreSQL-backed metadata rows.[4] [5]

| Validation boundary | Verified outcome |
|---|---|
| Spark and Sedona runtime | The pinned image completed a real Sedona SQL spatial predicate through a Spark master and worker. |
| Iceberg and GeoParquet | PyIceberg bootstrap and Spark writes used a shared PostgreSQL JDBC catalog identity; a real governed operation committed private GeoParquet plus artifact and event Iceberg records. |
| Durable schema | All ordered SQL migrations through `0032` applied cleanly to a fresh PostGIS database. |
| Lakehouse Python services | 23 focused tests passed across health readiness, catalog, worker security, authority, and Geo Innovation safeguards. |
| TypeScript data plane | 12 isolated geometry, capability, and Sedona-job-policy tests passed; root strict TypeScript validation passed. |
| Native clients | The strict mobile check and five authenticated API contracts passed, including session-only Sedona status/cancellation behavior. |
| Go and Rust services | Go vector-tile tests and vet passed; Rust Cesium asset tests and strict Clippy passed. |
| PWA and server bundle | The production build passed with MapLibre workbench and CesiumJS viewer emitted as lazy route chunks. |

## Production activation gate

The source release is **100-percent engineering-ready** against its declared acceptance criteria. Deployment still requires normal operator-controlled activation: unique production PostgreSQL credentials, `LAKEHOUSE_API_KEY`, warehouse credentials, a shared `GEO_DELIVERY_CAPABILITY_SECRET`, exact CORS and GeoLibre origin allow-lists, and persistent volume or S3-compatible object-store backing. The API fails closed while any of PostgreSQL, the shared Iceberg catalog, private warehouse, or worker’s real Sedona SQL readiness probe is unavailable; it does not advertise a healthy Lakehouse from package imports alone.

## Additional references

[4]: https://iceberg.apache.org/docs/latest/jdbc/ "Apache Iceberg JDBC catalog"
[5]: https://raw.githubusercontent.com/apache/iceberg/main/core/src/main/java/org/apache/iceberg/jdbc/JdbcCatalog.java "Apache Iceberg JdbcCatalog source"
