# Sedona and Lakehouse External Source Record

This release uses primary upstream documentation and source code to validate the production data-plane compatibility decisions.

| Source | Applied conclusion | URL |
|---|---|---|
| Apache Sedona Maven coordinates | The runtime pins Sedona `1.9.1` with the Spark `3.5` shaded artifact rather than combining an unsupported Sedona/Spark version set. | <https://sedona.apache.org/latest/setup/maven-coordinates/> |
| Apache Sedona Python installation guidance | A genuine Sedona runtime requires a configured Spark session and registered Sedona SQL support; Python import availability alone is not an execution readiness test. | <https://sedona.apache.org/latest/setup/install-python/> |
| Apache Iceberg JDBC catalog documentation | PostgreSQL provides atomic JDBC catalog metadata, while the warehouse uses S3-compatible storage. | <https://iceberg.apache.org/docs/latest/jdbc/> |
| Apache Iceberg Spark catalog configuration | Spark discovers named catalogs under `spark.sql.catalog.<name>` and resolves Iceberg objects through the configured catalog implementation. | <https://iceberg.apache.org/docs/latest/spark-configuration/> |
| Apache Iceberg `JdbcCatalog` source | `JdbcCatalog.initialize(String name, ...)` uses the initialized catalog name as the persisted `catalog_name` lookup key. The PyIceberg catalog is therefore intentionally named `idlr`, matching Spark's `spark.sql.catalog.idlr` alias. | <https://raw.githubusercontent.com/apache/iceberg/main/core/src/main/java/org/apache/iceberg/jdbc/JdbcCatalog.java> |
| Apache Iceberg `JdbcUtil` source | The JDBC catalog's table and namespace queries key metadata by `catalog_name`, `table_namespace`, and `table_name`, confirming why divergent PyIceberg and Spark catalog names produce separate metadata partitions. | <https://raw.githubusercontent.com/apache/iceberg/main/core/src/main/java/org/apache/iceberg/jdbc/JdbcUtil.java> |
| PyIceberg configuration documentation | PyIceberg SQL catalog and S3-compatible FileIO use the configured database URI, warehouse path, endpoint, access key, secret key, and region. | <https://py.iceberg.apache.org/configuration/> |

The release's real smoke topology proved the selected configuration by creating governed GeoParquet output and appending Spark-written artifact and event records through the shared PostgreSQL-backed `idlr` Iceberg catalog.
