import os
import unittest
from unittest.mock import MagicMock, patch

from catalog.iceberg_catalog import CatalogConfigurationError, IcebergCatalogManager, IcebergCatalogSettings, SPARK_ICEBERG_CATALOG_NAME
from warehouse.warehouse import WarehouseProbeError, _warehouse_parts, probe_warehouse
from schemas.table_schemas import BLOCKCHAIN_EVENTS_SCHEMA, LEDGER_EVENTS_SCHEMA, PAYMENT_EVENTS_SCHEMA


class LakehouseCatalogConfigurationTests(unittest.TestCase):
    def setUp(self):
        self.previous = {key: os.environ.get(key) for key in (
            "ICEBERG_CATALOG_URI",
            "ICEBERG_WAREHOUSE_PATH",
            "S3_ENDPOINT",
            "S3_ACCESS_KEY",
            "S3_SECRET_KEY",
            "S3_REGION",
            "S3_PATH_STYLE_ACCESS",
        )}
        os.environ.update({
            "ICEBERG_CATALOG_URI": "postgresql://catalog:secret@postgres:5432/iceberg",
            "ICEBERG_WAREHOUSE_PATH": "s3://idlr-lakehouse/warehouse",
            "S3_ENDPOINT": "http://minio:9000",
            "S3_ACCESS_KEY": "access-key",
            "S3_SECRET_KEY": "secret-key",
            "S3_REGION": "us-east-1",
            "S3_PATH_STYLE_ACCESS": "true",
        })

    def tearDown(self):
        for key, value in self.previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_settings_validate_and_do_not_expose_credentials(self):
        settings = IcebergCatalogSettings.from_environment()
        self.assertEqual(settings.warehouse_path, "s3://idlr-lakehouse/warehouse")
        status = settings.safe_status()
        self.assertNotIn("secret-key", str(status))
        self.assertNotIn("access-key", str(status))
        self.assertTrue(settings.s3_path_style_access)

    @patch("catalog.iceberg_catalog.load_catalog")
    def test_pyiceberg_uses_the_same_catalog_identity_as_spark(self, load_catalog):
        IcebergCatalogManager(IcebergCatalogSettings.from_environment())
        load_catalog.assert_called_once()
        self.assertEqual(load_catalog.call_args.args[0], SPARK_ICEBERG_CATALOG_NAME)
        self.assertEqual(SPARK_ICEBERG_CATALOG_NAME, "idlr")

    def test_settings_reject_unsupported_catalog_and_boolean(self):
        os.environ["ICEBERG_CATALOG_URI"] = "mysql://catalog:secret@db/iceberg"
        with self.assertRaises(CatalogConfigurationError):
            IcebergCatalogSettings.from_environment()
        os.environ["ICEBERG_CATALOG_URI"] = "postgresql://catalog:secret@postgres:5432/iceberg"
        os.environ["S3_PATH_STYLE_ACCESS"] = "sometimes"
        with self.assertRaises(CatalogConfigurationError):
            IcebergCatalogSettings.from_environment()

    def test_metadata_map_schemas_follow_current_pyiceberg_field_id_contract(self):
        for schema, expected_key_id, expected_value_id in (
            (PAYMENT_EVENTS_SCHEMA, 141, 142),
            (BLOCKCHAIN_EVENTS_SCHEMA, 141, 142),
            (LEDGER_EVENTS_SCHEMA, 131, 132),
        ):
            metadata = schema.find_field("metadata")
            self.assertEqual(metadata.field_type.key_id, expected_key_id)
            self.assertEqual(metadata.field_type.value_id, expected_value_id)

    def test_warehouse_path_rejects_missing_bucket(self):
        with self.assertRaises(WarehouseProbeError):
            _warehouse_parts("s3:///warehouse")

    @patch("warehouse.warehouse.pafs.S3FileSystem")
    def test_warehouse_probe_uses_configured_private_endpoint(self, filesystem_factory):
        settings = IcebergCatalogSettings.from_environment()
        filesystem = MagicMock()
        filesystem.get_file_info.return_value.type = 3
        filesystem_factory.return_value = filesystem
        result = probe_warehouse(settings)
        self.assertTrue(result.ready)
        self.assertEqual(result.bucket, "idlr-lakehouse")
        self.assertEqual(result.prefix, "warehouse")
        filesystem_factory.assert_called_once()
        filesystem.get_file_info.assert_called_once_with("idlr-lakehouse")


if __name__ == "__main__":
    unittest.main()
