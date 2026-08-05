"""Validated Apache Iceberg catalog access for the governed Lakehouse."""

from __future__ import annotations

from dataclasses import dataclass
import os
from typing import Iterable, Optional
from urllib.parse import urlparse

from pyiceberg.catalog import load_catalog
from pyiceberg.catalog.sql import SqlCatalog


# This is intentionally the same catalog name used by `spark.sql.catalog.idlr`.
# Iceberg JDBC stores it as the key in `iceberg_tables`; differing names create
# separate metadata rows even when PostgreSQL and the warehouse are shared.
SPARK_ICEBERG_CATALOG_NAME = "idlr"

LAKEHOUSE_NAMESPACES: tuple[str, ...] = (
    "events",
    "snapshots",
    "analytics",
    "ml_features",
    "spatial",
    "governance",
)


class CatalogConfigurationError(RuntimeError):
    """Raised when the deployed Lakehouse catalog configuration is unsafe or incomplete."""


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise CatalogConfigurationError(f"{name} must be configured for the Iceberg catalog")
    return value


def _bool_env(name: str) -> bool:
    raw = required_env(name).lower()
    if raw not in {"true", "false"}:
        raise CatalogConfigurationError(f"{name} must be either true or false")
    return raw == "true"


@dataclass(frozen=True)
class IcebergCatalogSettings:
    catalog_uri: str
    warehouse_path: str
    s3_endpoint: str
    s3_access_key: str
    s3_secret_key: str
    s3_region: str
    s3_path_style_access: bool

    @classmethod
    def from_environment(cls) -> "IcebergCatalogSettings":
        catalog_uri = required_env("ICEBERG_CATALOG_URI")
        warehouse_path = required_env("ICEBERG_WAREHOUSE_PATH")
        endpoint = required_env("S3_ENDPOINT")
        parsed_catalog = urlparse(catalog_uri)
        parsed_endpoint = urlparse(endpoint)
        if parsed_catalog.scheme not in {"postgres", "postgresql"} or not parsed_catalog.hostname:
            raise CatalogConfigurationError("ICEBERG_CATALOG_URI must be a PostgreSQL URI")
        if parsed_endpoint.scheme not in {"http", "https"} or not parsed_endpoint.hostname:
            raise CatalogConfigurationError("S3_ENDPOINT must be an absolute http(s) URL")
        if not warehouse_path.startswith("s3://"):
            raise CatalogConfigurationError("ICEBERG_WAREHOUSE_PATH must use the s3:// scheme")
        return cls(
            catalog_uri=catalog_uri,
            warehouse_path=warehouse_path.rstrip("/"),
            s3_endpoint=endpoint.rstrip("/"),
            s3_access_key=required_env("S3_ACCESS_KEY"),
            s3_secret_key=required_env("S3_SECRET_KEY"),
            s3_region=required_env("S3_REGION"),
            s3_path_style_access=_bool_env("S3_PATH_STYLE_ACCESS"),
        )

    def pyiceberg_config(self) -> dict[str, str]:
        return {
            "type": "sql",
            "uri": self.catalog_uri,
            "warehouse": self.warehouse_path,
            "s3.endpoint": self.s3_endpoint,
            "s3.access-key-id": self.s3_access_key,
            "s3.secret-access-key": self.s3_secret_key,
            "s3.region": self.s3_region,
            "s3.path-style-access": str(self.s3_path_style_access).lower(),
            "py-io-impl": "pyiceberg.io.pyarrow.PyArrowFileIO",
        }

    def safe_status(self) -> dict[str, str | bool]:
        return {
            "catalog_scheme": "postgresql",
            "warehouse_path": self.warehouse_path,
            "s3_endpoint": self.s3_endpoint,
            "s3_region": self.s3_region,
            "s3_path_style_access": self.s3_path_style_access,
        }


class IcebergCatalogManager:
    """Manages an Iceberg SQL catalog without exposing object-store credentials."""

    def __init__(self, settings: IcebergCatalogSettings | None = None):
        self.settings = settings or IcebergCatalogSettings.from_environment()
        self.catalog: SqlCatalog = load_catalog(SPARK_ICEBERG_CATALOG_NAME, **self.settings.pyiceberg_config())

    def get_catalog(self) -> SqlCatalog:
        return self.catalog

    def create_namespace(self, namespace: str) -> None:
        if namespace not in LAKEHOUSE_NAMESPACES:
            raise CatalogConfigurationError(f"Unsupported Lakehouse namespace: {namespace}")
        try:
            self.catalog.create_namespace(namespace)
        except Exception as exc:
            if "already exists" not in str(exc).lower():
                raise

    def initialize_namespaces(self, namespaces: Iterable[str] = LAKEHOUSE_NAMESPACES) -> list[str]:
        initialized: list[str] = []
        for namespace in namespaces:
            self.create_namespace(namespace)
            initialized.append(namespace)
        return initialized

    def list_namespaces(self) -> list[str]:
        return [str(namespace[0] if isinstance(namespace, tuple) else namespace) for namespace in self.catalog.list_namespaces()]

    def list_tables(self, namespace: str) -> list[str]:
        return [str(table[1] if isinstance(table, tuple) else table) for table in self.catalog.list_tables(namespace)]

    def get_table(self, namespace: str, table_name: str):
        return self.catalog.load_table(f"{namespace}.{table_name}")

    def readiness(self) -> dict[str, object]:
        namespaces = sorted(self.list_namespaces())
        missing = [namespace for namespace in LAKEHOUSE_NAMESPACES if namespace not in namespaces]
        return {
            "catalog_ready": not missing,
            "missing_namespaces": missing,
            "namespaces": namespaces,
            "configuration": self.settings.safe_status(),
        }


_catalog_manager: Optional[IcebergCatalogManager] = None


def get_catalog_manager() -> IcebergCatalogManager:
    global _catalog_manager
    if _catalog_manager is None:
        _catalog_manager = IcebergCatalogManager()
    return _catalog_manager


def reset_catalog_manager_for_tests() -> None:
    global _catalog_manager
    _catalog_manager = None


def initialize_lakehouse_namespaces() -> list[str]:
    return get_catalog_manager().initialize_namespaces()


if __name__ == "__main__":
    manager = get_catalog_manager()
    manager.initialize_namespaces()
    print(manager.readiness())
