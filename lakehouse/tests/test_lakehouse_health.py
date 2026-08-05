from __future__ import annotations

import asyncio
from unittest import TestCase
from unittest.mock import MagicMock, patch

from api import main


class _Cursor:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def execute(self, *_args, **_kwargs):
        return None

    def fetchone(self):
        return {"ok": 1}


class _Connection:
    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False

    def cursor(self):
        return _Cursor()


class LakehouseHealthTests(TestCase):
    def test_health_requires_all_real_data_plane_probes(self):
        manager = MagicMock()
        manager.readiness.return_value = {"catalog_ready": True, "namespaces": ["spatial"]}
        warehouse = MagicMock()
        warehouse.as_dict.return_value = {"warehouse_ready": True, "bucket": "idlr-lakehouse"}

        with (
            patch.object(main, "get_connection", return_value=_Connection()),
            patch.object(main, "get_catalog_manager", return_value=manager),
            patch.object(main, "probe_warehouse", return_value=warehouse),
            patch.object(main, "_probe_sedona_worker", return_value={"ready": True}),
        ):
            result = asyncio.run(main.health_check())

        self.assertEqual(result["status"], "healthy")
        self.assertTrue(result["postgres_available"])
        self.assertTrue(result["iceberg"]["catalog_ready"])
        self.assertTrue(result["warehouse"]["warehouse_ready"])
        self.assertTrue(result["sedona_worker"]["ready"])

    def test_health_fails_closed_when_worker_sql_probe_is_not_ready(self):
        manager = MagicMock()
        manager.readiness.return_value = {"catalog_ready": True}
        warehouse = MagicMock()
        warehouse.as_dict.return_value = {"warehouse_ready": True}

        with (
            patch.object(main, "get_connection", return_value=_Connection()),
            patch.object(main, "get_catalog_manager", return_value=manager),
            patch.object(main, "probe_warehouse", return_value=warehouse),
            patch.object(main, "_probe_sedona_worker", return_value={"ready": False, "detail": "probe failed"}),
        ):
            result = asyncio.run(main.health_check())

        self.assertEqual(result["status"], "degraded")
        self.assertFalse(result["sedona_worker"]["ready"])

    def test_runtime_status_requires_real_worker_catalog_and_warehouse_readiness(self):
        manager = MagicMock()
        manager.readiness.return_value = {"catalog_ready": True}
        warehouse = MagicMock()
        warehouse.as_dict.return_value = {"warehouse_ready": True}

        with (
            patch.object(main, "get_catalog_manager", return_value=manager),
            patch.object(main, "probe_warehouse", return_value=warehouse),
            patch.object(main, "_probe_sedona_worker", return_value={"ready": True}),
        ):
            ready = main._sedona_runtime_status()

        self.assertTrue(ready["ready"])
        self.assertEqual(ready["execution_mode"], "apache_sedona_distributed")
        self.assertTrue(ready["sedona_worker_ready"])
        self.assertTrue(ready["lakehouse_ready"])

        with (
            patch.object(main, "get_catalog_manager", return_value=manager),
            patch.object(main, "probe_warehouse", return_value=warehouse),
            patch.object(main, "_probe_sedona_worker", return_value={"ready": False}),
        ):
            unavailable = main._sedona_runtime_status()

        self.assertFalse(unavailable["ready"])
        self.assertEqual(unavailable["execution_mode"], "distributed_sedona_not_ready")

    def test_invalid_worker_health_url_is_rejected_without_a_network_request(self):
        with patch.dict(main.os.environ, {"SEDONA_WORKER_HEALTH_URL": "file:///etc/passwd"}, clear=False):
            result = main._probe_sedona_worker()
        self.assertFalse(result["ready"])
        self.assertEqual(result["detail"], "SEDONA_WORKER_HEALTH_URL is invalid")
