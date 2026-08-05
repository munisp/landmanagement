"""Idempotently initialize the governed Lakehouse catalog and spatial tables."""

from __future__ import annotations

import json
from datetime import datetime, timezone

from catalog.iceberg_catalog import get_catalog_manager
from schemas.spatial_schemas import initialize_spatial_tables
from schemas.table_schemas import create_all_tables


def main() -> None:
    manager = get_catalog_manager()
    namespaces = manager.initialize_namespaces()
    create_all_tables()
    spatial_tables = initialize_spatial_tables(manager)
    print(
        json.dumps(
            {
                "status": "ready",
                "initialized_at": datetime.now(timezone.utc).isoformat(),
                "namespaces": namespaces,
                "spatial_tables": spatial_tables,
                "catalog": manager.readiness(),
            },
            sort_keys=True,
        )
    )


if __name__ == "__main__":
    main()
