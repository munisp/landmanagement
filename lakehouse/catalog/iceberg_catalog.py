"""
Apache Iceberg Catalog Configuration

This module provides the Iceberg catalog configuration using PostgreSQL
as the metadata store and S3/MinIO for data storage.
"""

import os
from pyiceberg.catalog import load_catalog
from pyiceberg.catalog.sql import SqlCatalog
from typing import Optional

class IcebergCatalogManager:
    """
    Manages the Apache Iceberg catalog for the IDLR-PTS lakehouse.
    
    The catalog uses PostgreSQL for metadata storage and S3-compatible
    storage (MinIO or AWS S3) for data files.
    """
    
    def __init__(self):
        self.catalog: Optional[SqlCatalog] = None
        self._initialize_catalog()
    
    def _initialize_catalog(self):
        """Initialize the Iceberg catalog with PostgreSQL backend."""
        
        # Catalog configuration
        catalog_config = {
            "type": "sql",
            "uri": os.getenv(
                "ICEBERG_CATALOG_URI",
                "postgresql://temporal:temporal@localhost:5432/iceberg_catalog"
            ),
            "warehouse": os.getenv(
                "ICEBERG_WAREHOUSE_PATH",
                "s3://idlr-lakehouse/warehouse"
            ),
            # S3 configuration
            "s3.endpoint": os.getenv("S3_ENDPOINT", "http://localhost:9000"),
            "s3.access-key-id": os.getenv("S3_ACCESS_KEY", "minioadmin"),
            "s3.secret-access-key": os.getenv("S3_SECRET_KEY", "minioadmin"),
            "s3.path-style-access": "true",
            # Additional configuration
            "py-io-impl": "pyiceberg.io.pyarrow.PyArrowFileIO",
        }
        
        try:
            self.catalog = load_catalog("idlr_lakehouse", **catalog_config)
            print("✅ Iceberg catalog initialized successfully")
        except Exception as e:
            print(f"❌ Failed to initialize Iceberg catalog: {e}")
            raise
    
    def get_catalog(self) -> SqlCatalog:
        """Get the initialized catalog instance."""
        if self.catalog is None:
            raise RuntimeError("Catalog not initialized")
        return self.catalog
    
    def create_namespace(self, namespace: str) -> None:
        """
        Create a namespace (database) in the catalog.
        
        Args:
            namespace: Name of the namespace to create
        """
        try:
            self.catalog.create_namespace(namespace)
            print(f"✅ Created namespace: {namespace}")
        except Exception as e:
            if "already exists" in str(e).lower():
                print(f"ℹ️  Namespace already exists: {namespace}")
            else:
                print(f"❌ Failed to create namespace {namespace}: {e}")
                raise
    
    def list_namespaces(self) -> list[str]:
        """List all namespaces in the catalog."""
        return list(self.catalog.list_namespaces())
    
    def list_tables(self, namespace: str) -> list[str]:
        """
        List all tables in a namespace.
        
        Args:
            namespace: Name of the namespace
            
        Returns:
            List of table names
        """
        return [
            table[1] for table in self.catalog.list_tables(namespace)
        ]
    
    def drop_table(self, namespace: str, table_name: str) -> None:
        """
        Drop a table from the catalog.
        
        Args:
            namespace: Name of the namespace
            table_name: Name of the table to drop
        """
        identifier = f"{namespace}.{table_name}"
        self.catalog.drop_table(identifier)
        print(f"✅ Dropped table: {identifier}")
    
    def get_table(self, namespace: str, table_name: str):
        """
        Get a table reference.
        
        Args:
            namespace: Name of the namespace
            table_name: Name of the table
            
        Returns:
            Iceberg table object
        """
        identifier = f"{namespace}.{table_name}"
        return self.catalog.load_table(identifier)


# Global catalog instance
_catalog_manager: Optional[IcebergCatalogManager] = None


def get_catalog_manager() -> IcebergCatalogManager:
    """Get or create the global catalog manager instance."""
    global _catalog_manager
    if _catalog_manager is None:
        _catalog_manager = IcebergCatalogManager()
    return _catalog_manager


def initialize_lakehouse_namespaces():
    """Initialize all required namespaces for the lakehouse."""
    manager = get_catalog_manager()
    
    namespaces = [
        "events",        # Real-time event streams
        "snapshots",     # Point-in-time snapshots
        "analytics",     # Aggregated analytics tables
        "ml_features",   # ML feature store
    ]
    
    for namespace in namespaces:
        manager.create_namespace(namespace)
    
    print("✅ All lakehouse namespaces initialized")


if __name__ == "__main__":
    # Initialize catalog and namespaces
    initialize_lakehouse_namespaces()
    
    # List all namespaces
    manager = get_catalog_manager()
    print("\nAvailable namespaces:")
    for ns in manager.list_namespaces():
        print(f"  - {ns}")
