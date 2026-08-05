"""Iceberg schemas for Context Globe public-source provenance and normalized snapshots."""

from __future__ import annotations

from pyiceberg.partitioning import PartitionField, PartitionSpec
from pyiceberg.schema import Schema
from pyiceberg.transforms import DayTransform
from pyiceberg.types import IntegerType, LongType, NestedField, StringType, TimestampType

from catalog.iceberg_catalog import IcebergCatalogManager, get_catalog_manager

CONTEXT_EVENT_SNAPSHOT_SCHEMA = Schema(
    NestedField(1, "snapshot_id", StringType(), required=True),
    NestedField(2, "layer_key", StringType(), required=True),
    NestedField(3, "source_event_key", StringType(), required=True),
    NestedField(4, "source_url", StringType(), required=False),
    NestedField(5, "source_observed_at", TimestampType(), required=True),
    NestedField(6, "source_updated_at", TimestampType(), required=False),
    NestedField(7, "expires_at", TimestampType(), required=False),
    NestedField(8, "quality_state", StringType(), required=True),
    NestedField(9, "severity", StringType(), required=False),
    NestedField(10, "urgency", StringType(), required=False),
    NestedField(11, "geometry_geojson", StringType(), required=True),
    NestedField(12, "properties_json", StringType(), required=True),
    NestedField(13, "source_checksum_sha256", StringType(), required=True),
    NestedField(14, "ingested_at", TimestampType(), required=True),
)

CONTEXT_INGESTION_RUN_SCHEMA = Schema(
    NestedField(1, "run_key", StringType(), required=True),
    NestedField(2, "layer_key", StringType(), required=True),
    NestedField(3, "http_status", IntegerType(), required=True),
    NestedField(4, "source_etag", StringType(), required=False),
    NestedField(5, "source_last_modified", StringType(), required=False),
    NestedField(6, "source_checksum_sha256", StringType(), required=False),
    NestedField(7, "received_count", LongType(), required=True),
    NestedField(8, "accepted_count", LongType(), required=True),
    NestedField(9, "rejected_count", LongType(), required=True),
    NestedField(10, "quality_state", StringType(), required=True),
    NestedField(11, "failure_reason", StringType(), required=False),
    NestedField(12, "started_at", TimestampType(), required=True),
    NestedField(13, "completed_at", TimestampType(), required=False),
)


def _daily(source_id: int, name: str) -> PartitionSpec:
    return PartitionSpec(PartitionField(source_id=source_id, field_id=1000, transform=DayTransform(), name=name))


def _create_if_absent(manager: IcebergCatalogManager, identifier: str, schema: Schema, partition_spec: PartitionSpec) -> None:
    try:
        manager.get_catalog().create_table(
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


def initialize_context_globe_tables(manager: IcebergCatalogManager | None = None) -> list[str]:
    catalog_manager = manager or get_catalog_manager()
    catalog_manager.initialize_namespaces(("events", "governance"))
    table_definitions = (
        ("events.context_globe_snapshots", CONTEXT_EVENT_SNAPSHOT_SCHEMA, _daily(14, "ingested_date")),
        ("governance.context_globe_ingestion_runs", CONTEXT_INGESTION_RUN_SCHEMA, _daily(12, "started_date")),
    )
    initialized: list[str] = []
    for identifier, schema, partition_spec in table_definitions:
        _create_if_absent(catalog_manager, identifier, schema, partition_spec)
        initialized.append(identifier)
    return initialized
