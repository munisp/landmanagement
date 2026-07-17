"""
Iceberg Table Schemas

Defines all table schemas for the IDLR-PTS lakehouse including:
- Event streams (payments, blockchain, ledger, workflows)
- Snapshots (parcels, transactions, users)
- Analytics aggregations
- ML features
"""

from pyiceberg.schema import Schema
from pyiceberg.types import (
    NestedField,
    StringType,
    LongType,
    DoubleType,
    TimestampType,
    BooleanType,
    StructType,
    ListType,
    MapType,
)
from pyiceberg.partitioning import PartitionSpec, PartitionField
from pyiceberg.transforms import DayTransform, IdentityTransform
from pyiceberg.table.sorting import SortOrder, SortField
from pyiceberg.transforms import IdentityTransform as SortIdentityTransform
from catalog.iceberg_catalog import get_catalog_manager


# =============================================================================
# EVENT STREAM SCHEMAS
# =============================================================================

PAYMENT_EVENTS_SCHEMA = Schema(
    NestedField(1, "event_id", StringType(), required=True),
    NestedField(2, "event_time", TimestampType(), required=True),
    NestedField(3, "event_type", StringType(), required=True),  # initiated, completed, failed, cancelled
    NestedField(4, "payment_id", StringType(), required=True),
    NestedField(5, "transaction_id", StringType(), required=False),
    NestedField(6, "property_id", StringType(), required=False),
    NestedField(7, "payer_id", StringType(), required=False),
    NestedField(8, "payee_id", StringType(), required=False),
    NestedField(9, "amount", DoubleType(), required=False),
    NestedField(10, "currency", StringType(), required=False),
    NestedField(11, "payment_method", StringType(), required=False),
    NestedField(12, "status", StringType(), required=False),
    NestedField(13, "error_message", StringType(), required=False),
    NestedField(14, "metadata", MapType(1, StringType(), StringType(), value_required=False), required=False),
)

BLOCKCHAIN_EVENTS_SCHEMA = Schema(
    NestedField(1, "event_id", StringType(), required=True),
    NestedField(2, "event_time", TimestampType(), required=True),
    NestedField(3, "event_type", StringType(), required=True),  # escrow_created, escrow_released, escrow_refunded
    NestedField(4, "transaction_hash", StringType(), required=True),
    NestedField(5, "escrow_id", StringType(), required=False),
    NestedField(6, "payment_id", StringType(), required=False),
    NestedField(7, "property_id", StringType(), required=False),
    NestedField(8, "buyer", StringType(), required=False),
    NestedField(9, "seller", StringType(), required=False),
    NestedField(10, "amount", DoubleType(), required=False),
    NestedField(11, "block_number", LongType(), required=False),
    NestedField(12, "confirmed", BooleanType(), required=False),
    NestedField(13, "gas_used", LongType(), required=False),
    NestedField(14, "metadata", MapType(1, StringType(), StringType(), value_required=False), required=False),
)

LEDGER_EVENTS_SCHEMA = Schema(
    NestedField(1, "event_id", StringType(), required=True),
    NestedField(2, "event_time", TimestampType(), required=True),
    NestedField(3, "event_type", StringType(), required=True),  # transfer_created, transfer_posted, transfer_voided
    NestedField(4, "transfer_id", StringType(), required=True),
    NestedField(5, "payment_id", StringType(), required=False),
    NestedField(6, "transaction_hash", StringType(), required=False),
    NestedField(7, "property_id", StringType(), required=False),
    NestedField(8, "debit_account_id", StringType(), required=False),
    NestedField(9, "credit_account_id", StringType(), required=False),
    NestedField(10, "amount", DoubleType(), required=False),
    NestedField(11, "currency", StringType(), required=False),
    NestedField(12, "status", StringType(), required=False),
    NestedField(13, "metadata", MapType(1, StringType(), StringType(), value_required=False), required=False),
)

WORKFLOW_EVENTS_SCHEMA = Schema(
    NestedField(1, "event_id", StringType(), required=True),
    NestedField(2, "event_time", TimestampType(), required=True),
    NestedField(3, "event_type", StringType(), required=True),  # started, step_completed, completed, failed, cancelled
    NestedField(4, "workflow_id", StringType(), required=True),
    NestedField(5, "workflow_type", StringType(), required=True),
    NestedField(6, "property_id", StringType(), required=False),
    NestedField(7, "buyer_id", StringType(), required=False),
    NestedField(8, "seller_id", StringType(), required=False),
    NestedField(9, "status", StringType(), required=False),
    NestedField(10, "current_step", StringType(), required=False),
    NestedField(11, "completed_steps", ListType(1, StringType(), element_required=True), required=False),
    NestedField(12, "payment_id", StringType(), required=False),
    NestedField(13, "transaction_hash", StringType(), required=False),
    NestedField(14, "transfer_id", StringType(), required=False),
    NestedField(15, "error_message", StringType(), required=False),
)

RECONCILIATION_EVENTS_SCHEMA = Schema(
    NestedField(1, "event_id", StringType(), required=True),
    NestedField(2, "event_time", TimestampType(), required=True),
    NestedField(3, "payment_id", StringType(), required=True),
    NestedField(4, "transaction_hash", StringType(), required=True),
    NestedField(5, "transfer_id", StringType(), required=True),
    NestedField(6, "property_id", StringType(), required=False),
    NestedField(7, "reconciled", BooleanType(), required=True),
    NestedField(8, "discrepancies", ListType(1, StringType(), element_required=True), required=False),
)

# =============================================================================
# SNAPSHOT SCHEMAS
# =============================================================================

PARCELS_SNAPSHOT_SCHEMA = Schema(
    NestedField(1, "snapshot_time", TimestampType(), required=True),
    NestedField(2, "parcel_id", StringType(), required=True),
    NestedField(3, "parcel_number", StringType(), required=True),
    NestedField(4, "address", StringType(), required=False),
    NestedField(5, "city", StringType(), required=False),
    NestedField(6, "state", StringType(), required=False),
    NestedField(7, "postal_code", StringType(), required=False),
    NestedField(8, "country", StringType(), required=False),
    NestedField(9, "size_sqm", DoubleType(), required=False),
    NestedField(10, "land_use", StringType(), required=False),
    NestedField(11, "zoning", StringType(), required=False),
    NestedField(12, "owner_id", StringType(), required=False),
    NestedField(13, "owner_name", StringType(), required=False),
    NestedField(14, "assessed_value", DoubleType(), required=False),
    NestedField(15, "market_value", DoubleType(), required=False),
    NestedField(16, "tax_amount", DoubleType(), required=False),
    NestedField(17, "status", StringType(), required=False),
    # Geospatial fields (stored as WKT)
    NestedField(18, "geometry_wkt", StringType(), required=False),
    NestedField(19, "centroid_lat", DoubleType(), required=False),
    NestedField(20, "centroid_lon", DoubleType(), required=False),
    NestedField(21, "created_at", TimestampType(), required=False),
    NestedField(22, "updated_at", TimestampType(), required=False),
)

TRANSACTIONS_SNAPSHOT_SCHEMA = Schema(
    NestedField(1, "snapshot_time", TimestampType(), required=True),
    NestedField(2, "transaction_id", StringType(), required=True),
    NestedField(3, "parcel_id", StringType(), required=True),
    NestedField(4, "transaction_type", StringType(), required=True),
    NestedField(5, "from_owner_id", StringType(), required=False),
    NestedField(6, "to_owner_id", StringType(), required=False),
    NestedField(7, "transaction_date", TimestampType(), required=False),
    NestedField(8, "sale_price", DoubleType(), required=False),
    NestedField(9, "currency", StringType(), required=False),
    NestedField(10, "payment_id", StringType(), required=False),
    NestedField(11, "blockchain_tx_hash", StringType(), required=False),
    NestedField(12, "ledger_transfer_id", StringType(), required=False),
    NestedField(13, "workflow_id", StringType(), required=False),
    NestedField(14, "status", StringType(), required=False),
    NestedField(15, "created_at", TimestampType(), required=False),
    NestedField(16, "completed_at", TimestampType(), required=False),
)

# =============================================================================
# ANALYTICS SCHEMAS
# =============================================================================

PROPERTY_ANALYTICS_SCHEMA = Schema(
    NestedField(1, "date", TimestampType(), required=True),
    NestedField(2, "region", StringType(), required=True),
    NestedField(3, "total_transactions", LongType(), required=True),
    NestedField(4, "total_value", DoubleType(), required=True),
    NestedField(5, "avg_price_per_sqm", DoubleType(), required=False),
    NestedField(6, "median_sale_price", DoubleType(), required=False),
    NestedField(7, "total_parcels", LongType(), required=False),
    NestedField(8, "active_parcels", LongType(), required=False),
    NestedField(9, "pending_transactions", LongType(), required=False),
)

PAYMENT_ANALYTICS_SCHEMA = Schema(
    NestedField(1, "date", TimestampType(), required=True),
    NestedField(2, "payment_method", StringType(), required=True),
    NestedField(3, "total_payments", LongType(), required=True),
    NestedField(4, "successful_payments", LongType(), required=True),
    NestedField(5, "failed_payments", LongType(), required=True),
    NestedField(6, "total_amount", DoubleType(), required=True),
    NestedField(7, "avg_amount", DoubleType(), required=False),
    NestedField(8, "avg_processing_time_ms", DoubleType(), required=False),
)

# =============================================================================
# ML FEATURE SCHEMAS
# =============================================================================

PROPERTY_FEATURES_SCHEMA = Schema(
    NestedField(1, "feature_time", TimestampType(), required=True),
    NestedField(2, "parcel_id", StringType(), required=True),
    # Property characteristics
    NestedField(3, "size_sqm", DoubleType(), required=False),
    NestedField(4, "land_use_encoded", LongType(), required=False),
    NestedField(5, "zoning_encoded", LongType(), required=False),
    # Location features
    NestedField(6, "region_encoded", LongType(), required=False),
    NestedField(7, "distance_to_city_center_km", DoubleType(), required=False),
    NestedField(8, "nearby_amenities_count", LongType(), required=False),
    # Historical features
    NestedField(9, "days_since_last_transaction", LongType(), required=False),
    NestedField(10, "transaction_count_1y", LongType(), required=False),
    NestedField(11, "avg_sale_price_1y", DoubleType(), required=False),
    NestedField(12, "price_change_pct_1y", DoubleType(), required=False),
    # Market features
    NestedField(13, "regional_avg_price_sqm", DoubleType(), required=False),
    NestedField(14, "regional_transaction_volume_1m", LongType(), required=False),
    # Target variable
    NestedField(15, "target_price", DoubleType(), required=False),
)

# =============================================================================
# PARTITION SPECIFICATIONS
# =============================================================================

def get_partition_spec_daily(field_id: int) -> PartitionSpec:
    """Get partition spec for daily partitioning on a timestamp field."""
    return PartitionSpec(
        PartitionField(
            source_id=field_id,
            field_id=1000,
            transform=DayTransform(),
            name="event_date"
        )
    )

def get_partition_spec_by_id(field_id: int, field_name: str) -> PartitionSpec:
    """Get partition spec for identity partitioning on an ID field."""
    return PartitionSpec(
        PartitionField(
            source_id=field_id,
            field_id=1000,
            transform=IdentityTransform(),
            name=field_name
        )
    )

# =============================================================================
# SORT ORDERS
# =============================================================================

def get_sort_order_by_time() -> SortOrder:
    """Get sort order for timestamp-based sorting."""
    return SortOrder(
        SortField(source_id=2, transform=SortIdentityTransform())  # event_time field
    )

# =============================================================================
# TABLE CREATION FUNCTIONS
# =============================================================================

def create_all_tables():
    """Create all Iceberg tables in the lakehouse."""
    manager = get_catalog_manager()
    catalog = manager.get_catalog()
    
    tables_to_create = [
        # Event streams
        ("events", "payment_events", PAYMENT_EVENTS_SCHEMA, get_partition_spec_daily(2)),
        ("events", "blockchain_events", BLOCKCHAIN_EVENTS_SCHEMA, get_partition_spec_daily(2)),
        ("events", "ledger_events", LEDGER_EVENTS_SCHEMA, get_partition_spec_daily(2)),
        ("events", "workflow_events", WORKFLOW_EVENTS_SCHEMA, get_partition_spec_daily(2)),
        ("events", "reconciliation_events", RECONCILIATION_EVENTS_SCHEMA, get_partition_spec_daily(2)),
        
        # Snapshots
        ("snapshots", "parcels", PARCELS_SNAPSHOT_SCHEMA, get_partition_spec_daily(1)),
        ("snapshots", "transactions", TRANSACTIONS_SNAPSHOT_SCHEMA, get_partition_spec_daily(1)),
        
        # Analytics
        ("analytics", "property_analytics", PROPERTY_ANALYTICS_SCHEMA, get_partition_spec_daily(1)),
        ("analytics", "payment_analytics", PAYMENT_ANALYTICS_SCHEMA, get_partition_spec_daily(1)),
        
        # ML features
        ("ml_features", "property_features", PROPERTY_FEATURES_SCHEMA, get_partition_spec_daily(1)),
    ]
    
    for namespace, table_name, schema, partition_spec in tables_to_create:
        identifier = f"{namespace}.{table_name}"
        try:
            catalog.create_table(
                identifier=identifier,
                schema=schema,
                partition_spec=partition_spec,
                sort_order=get_sort_order_by_time(),
            )
            print(f"✅ Created table: {identifier}")
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"ℹ️  Table already exists: {identifier}")
            else:
                print(f"❌ Failed to create table {identifier}: {e}")
                raise


if __name__ == "__main__":
    create_all_tables()
