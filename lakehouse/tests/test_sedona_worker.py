import hashlib
import io
import json
import os
import tempfile
import unittest
from types import SimpleNamespace
from pathlib import Path
from unittest.mock import patch

from sedona import worker


class StubSettings:
    warehouse_path = "s3://idlr-lakehouse/warehouse"
    warehouse_bucket = "idlr-lakehouse"
    warehouse_prefix = "warehouse"
    s3_endpoint = "http://minio:9000"
    s3_access_key = "lakehouse-access"
    s3_secret_key = "lakehouse-secret"
    s3_region = "us-east-1"
    spark_master_url = "spark://spark-master:7077"
    startup_probe_timeout_seconds = 45

    def __init__(self, work_dir: str):
        self.work_dir = Path(work_dir)

    def output_prefix(self, job_key: str) -> str:
        return f"warehouse/jobs/{job_key}"


class Body(io.BytesIO):
    def close(self):
        # boto3 stream close is a no-op for test bytes.
        pass


class FakePaginator:
    def __init__(self, keys):
        self.keys = keys

    def paginate(self, **_kwargs):
        return [{"Contents": [{"Key": key} for key in self.keys]}]


class FakeS3:
    def __init__(self, objects):
        self.objects = objects
        self.puts = []

    def get_paginator(self, _name):
        return FakePaginator(self.objects.keys())

    def get_object(self, *, Bucket, Key):
        payload = self.objects[Key]
        return {"Body": Body(payload), "ContentLength": len(payload)}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)


class SedonaWorkerSafetyTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.settings = StubSettings(self.temp_dir.name)
        self.job = {
            "id": 7,
            "job_key": "sedona-00000000-0000-0000-0000-000000000007",
            "operation": "geoparquet_export",
            "analysis_run_id": 42,
            "parcel_id": 8,
            "input_manifest": {"operation": "geoparquet_export", "features": []},
            "input_checksum_sha256": "a" * 64,
        }

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_manifest_is_private_and_bound_to_configured_warehouse(self):
        manifest, result = worker.write_manifest(self.settings, self.job)
        self.assertEqual(manifest.parent, Path(self.temp_dir.name))
        self.assertEqual(manifest.stat().st_mode & 0o777, 0o600)
        payload = json.loads(manifest.read_text(encoding="utf-8"))
        self.assertEqual(payload["jobId"], 7)
        self.assertEqual(payload["outputPrefix"], "warehouse/jobs/sedona-00000000-0000-0000-0000-000000000007")
        self.assertEqual(result, manifest.with_suffix(".result.json"))

    def test_worker_environment_excludes_database_connection_strings(self):
        with patch.dict(os.environ, {"POSTGRES_URL": "postgresql://secret", "DATABASE_URL": "postgresql://backup", "UNRELATED": "retained"}, clear=True):
            environment = worker.job_environment(self.settings)
        self.assertNotIn("POSTGRES_URL", environment)
        self.assertNotIn("DATABASE_URL", environment)
        self.assertEqual(environment["SPARK_MASTER_URL"], self.settings.spark_master_url)
        self.assertEqual(environment["S3_SECRET_KEY"], self.settings.s3_secret_key)
        self.assertEqual(environment["UNRELATED"], "retained")

    def test_startup_probe_uses_only_the_fixed_packaged_sedona_command(self):
        successful_probe = SimpleNamespace(returncode=0, stdout='{"status":"ready"}')
        with patch("sedona.worker.subprocess.run", return_value=successful_probe) as run:
            worker.run_startup_sedona_probe(self.settings)

        command = run.call_args.args[0]
        self.assertEqual(command[:5], [
            "/opt/spark/bin/spark-submit",
            "--master",
            self.settings.spark_master_url,
            "--conf",
            "spark.ui.enabled=false",
        ])
        self.assertEqual(command[-1], "/opt/idlr-sedona/jobs/runtime_probe.py")
        self.assertFalse(run.call_args.kwargs["check"])
        self.assertEqual(run.call_args.kwargs["timeout"], self.settings.startup_probe_timeout_seconds)

    def test_startup_probe_fails_closed_when_spatial_readiness_fails(self):
        failed_probe = SimpleNamespace(returncode=1, stdout="Sedona error")
        with patch("sedona.worker.subprocess.run", return_value=failed_probe):
            with self.assertRaisesRegex(RuntimeError, "startup SQL probe failed"):
                worker.run_startup_sedona_probe(self.settings)

    def test_artifact_manifest_hashes_each_persisted_output_and_registers_private_uri(self):
        prefix = f"warehouse/jobs/{self.job['job_key']}/data/"
        objects = {f"{prefix}part-00000.parquet": b"real geospatial output"}
        client = FakeS3(objects)
        with patch("sedona.worker.object_store_client", return_value=client):
            uri, checksum = worker.write_artifact_manifest(self.settings, self.job, {"status": "succeeded", "featureCount": 1})

        self.assertTrue(uri.startswith(f"s3://idlr-lakehouse/warehouse/jobs/{self.job['job_key']}/"))
        self.assertRegex(checksum, r"^[a-f0-9]{64}$")
        self.assertEqual(len(client.puts), 1)
        persisted = client.puts[0]
        payload = json.loads(persisted["Body"].decode("utf-8"))
        self.assertEqual(payload["objects"][0]["checksumSha256"], hashlib.sha256(objects[f"{prefix}part-00000.parquet"]).hexdigest())
        self.assertEqual(persisted["Metadata"]["checksum-sha256"], checksum)

    def test_artifact_registration_fails_when_spark_persists_no_output(self):
        with patch("sedona.worker.object_store_client", return_value=FakeS3({})):
            with self.assertRaisesRegex(RuntimeError, "did not produce"):
                worker.write_artifact_manifest(self.settings, self.job, {"status": "succeeded"})


if __name__ == "__main__":
    unittest.main()
