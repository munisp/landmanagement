"""S3-compatible warehouse validation for the governed Iceberg Lakehouse."""

from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import urlparse

import pyarrow.fs as pafs

from catalog.iceberg_catalog import IcebergCatalogSettings


class WarehouseProbeError(RuntimeError):
    """Raised when the configured S3-compatible warehouse cannot be used safely."""


@dataclass(frozen=True)
class WarehouseStatus:
    ready: bool
    bucket: str
    prefix: str
    endpoint: str

    def as_dict(self) -> dict[str, str | bool]:
        return {
            "warehouse_ready": self.ready,
            "bucket": self.bucket,
            "prefix": self.prefix,
            "endpoint": self.endpoint,
        }


def _warehouse_parts(warehouse_path: str) -> tuple[str, str]:
    parsed = urlparse(warehouse_path)
    if parsed.scheme != "s3" or not parsed.netloc:
        raise WarehouseProbeError("The Iceberg warehouse must use a non-empty s3://bucket/prefix path")
    return parsed.netloc, parsed.path.strip("/")


def _endpoint_parts(endpoint: str) -> tuple[str, int | None, str]:
    parsed = urlparse(endpoint)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise WarehouseProbeError("S3 endpoint must be an absolute HTTP(S) URL")
    host = parsed.hostname if parsed.port is None else f"{parsed.hostname}:{parsed.port}"
    return host, parsed.port, parsed.scheme


def probe_warehouse(settings: IcebergCatalogSettings) -> WarehouseStatus:
    bucket, prefix = _warehouse_parts(settings.warehouse_path)
    endpoint_host, _, endpoint_scheme = _endpoint_parts(settings.s3_endpoint)
    filesystem = pafs.S3FileSystem(
        access_key=settings.s3_access_key,
        secret_key=settings.s3_secret_key,
        region=settings.s3_region,
        scheme=endpoint_scheme,
        endpoint_override=endpoint_host,
        force_virtual_addressing=not settings.s3_path_style_access,
    )
    info = filesystem.get_file_info(bucket)
    if info.type == pafs.FileType.NotFound:
        raise WarehouseProbeError(f"Configured warehouse bucket does not exist: {bucket}")
    return WarehouseStatus(ready=True, bucket=bucket, prefix=prefix, endpoint=settings.s3_endpoint)
