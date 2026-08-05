"""Iceberg schemas for governed Sedona spatial inputs, outputs, and job provenance."""

from __future__ import annotations

from pyiceberg.partitioning import PartitionField, PartitionSpec
from pyiceberg.schema import Schema
from pyiceberg.transforms import DayTransform, IdentityTransform
from pyiceberg.types import DoubleType, LongType, NestedField, StringType, TimestampType

from catalog.iceberg_catalog import IcebergCatalogManager, get_catalog_manager


SPATIAL_FEATURE_SNAPSHOT_SCHEMA = Schema(
    NestedField(1, "snapshot_id", StringType(), required=True),
    NestedField(2, "job_id", StringType(), required=False),
    NestedField(3, "analysis_run_id", LongType(), required=False),
    NestedField(4, "parcel_id", LongType(), required=False),
    NestedField(5, "feature_id", StringType(), required=True),
    NestedField(6, "geometry_wkt", StringType(), required=True),
    NestedField(7, "source_crs", StringType(), required=True),
    NestedField(8, "properties_json", StringType(), required=False),
    NestedField(9, "source_asset_id", StringType(), required=False),
    NestedField(10, "source_checksum_sha256", StringType(), required=False),
    NestedField(11, "captured_at", TimestampType(), required=True),
)

SPATIAL_JOB_ARTIFACT_SCHEMA = Schema(
    NestedField(1, "artifact_id", StringType(), required=True),
    NestedField(2, "job_id", StringType(), required=True),
    NestedField(3, "analysis_run_id", LongType(), required=False),
    NestedField(4, "parcel_id", LongType(), required=False),
    NestedField(5, "operation", StringType(), required=True),
    NestedField(6, "artifact_uri", StringType(), required=True),
    NestedField(7, "media_type", StringType(), required=True),
    NestedField(8, "checksum_sha256", StringType(), required=True),
    NestedField(9, "geometry_column", StringType(), required=False),
    NestedField(10, "output_crs", StringType(), required=False),
    NestedField(11, "feature_count", LongType(), required=False),
    NestedField(12, "area_square_meters", DoubleType(), required=False),
    NestedField(13, "metadata_json", StringType(), required=False),
    NestedField(14, "created_at", TimestampType(), required=True),
)

SPATIAL_JOB_EVENT_SCHEMA = Schema(
    NestedField(1, "event_id", StringType(), required=True),
    NestedField(2, "job_id", StringType(), required=True),
    NestedField(3, "event_type", StringType(), required=True),
    NestedField(4, "attempt", LongType(), required=True),
    NestedField(5, "spark_application_id", StringType(), required=False),
    NestedField(6, "payload_json", StringType(), required=False),
    NestedField(7, "occurred_at", TimestampType(), required=True),
)


def _daily_partition(source_id: int, name: str) -> PartitionSpec:
    return PartitionSpec(
        PartitionField(source_id=source_id, field_id=1000, transform=DayTransform(), name=name)
    )


def _parcel_partition(source_id: int) -> PartitionSpec:
    return PartitionSpec(
        PartitionField(source_id=source_id, field_id=1000, transform=IdentityTransform(), name="parcel_id")
    )


def _create_if_absent(manager: IcebergCatalogManager, identifier: str, schema: Schema, partition_spec: PartitionSpec) -> None:
    catalog = manager.get_catalog()
    try:
        catalog.create_table(
            identifier=identifier,
            schema=schema,
            partition_spec=partition_spec,
            properties={
                "format-version": "2",
                "write.parquet.compression-codec": "zstd",
                "write.metadata.delete-after-commit.enabled": "true",
            },
        )
    except Exception as exc:
        if "already exists" not in str(exc).lower():
            raise


def initialize_spatial_tables(manager: IcebergCatalogManager | None = None) -> list[str]:
    catalog_manager = manager or get_catalog_manager()
    catalog_manager.initialize_namespaces(("spatial", "governance"))
    tables = [
        ("spatial.feature_snapshots", SPATIAL_FEATURE_SNAPSHOT_SCHEMA, _daily_partition(11, "captured_date")),
        ("spatial.job_artifacts", SPATIAL_JOB_ARTIFACT_SCHEMA, _daily_partition(14, "created_date")),
        ("governance.spatial_job_events", SPATIAL_JOB_EVENT_SCHEMA, _daily_partition(7, "occurred_date")),
    ]
    initialized: list[str] = []
    for identifier, schema, partition_spec in tables:
        _create_if_absent(catalog_manager, identifier, schema, partition_spec)
        initialized.append(identifier)
    return initialized
