"""Trusted worker for durable, governed Sedona spatial jobs.

The worker is internal-only. It reads queue rows directly from PostgreSQL, invokes a
fixed Spark job command without caller-controlled shell fragments, and records every
state transition in the durable job-event log.
"""

from __future__ import annotations

import hashlib
import json
import os
import threading
from pathlib import Path
import re
import signal
import subprocess
import time
from datetime import datetime, timezone
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Iterator
from urllib.parse import urlparse
from uuid import uuid4

import boto3
import psycopg2
from prometheus_client import Counter, Gauge, start_http_server
from psycopg2.extras import Json, RealDictCursor


ACTIVE_STATUSES = ("claimed", "running", "cancel_requested")
TERMINAL_STATUSES = ("succeeded", "failed", "cancelled")
WORKER_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{3,128}$")
JOB_KEY_PATTERN = re.compile(r"^sedona-[a-f0-9-]{36}$", re.IGNORECASE)

JOBS_CLAIMED = Counter("idlr_sedona_jobs_claimed_total", "Durable Sedona jobs claimed by the trusted worker")
JOBS_TERMINAL = Counter("idlr_sedona_jobs_terminal_total", "Durable Sedona jobs reaching a terminal state", ["status"])
WORKER_ALIVE = Gauge("idlr_sedona_worker_alive", "Whether the trusted Sedona worker event loop is alive")
WORKER_READY = Gauge("idlr_sedona_worker_ready", "Whether the worker has passed the real Spark/Sedona SQL startup probe")
_READY = threading.Event()


class WorkerConfigurationError(RuntimeError):
    pass


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise WorkerConfigurationError(f"{name} must be configured")
    return value


def integer_env(name: str, default: int, minimum: int, maximum: int) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except ValueError as exc:
        raise WorkerConfigurationError(f"{name} must be an integer") from exc
    if not minimum <= value <= maximum:
        raise WorkerConfigurationError(f"{name} must be between {minimum} and {maximum}")
    return value


class WorkerSettings:
    def __init__(self) -> None:
        self.database_url = os.getenv("POSTGRES_URL", os.getenv("DATABASE_URL", "")).strip()
        if not self.database_url:
            raise WorkerConfigurationError("POSTGRES_URL or DATABASE_URL must be configured")
        self.worker_id = required_env("SEDONA_JOB_WORKER_ID")
        if not WORKER_ID_PATTERN.match(self.worker_id):
            raise WorkerConfigurationError("SEDONA_JOB_WORKER_ID has an invalid format")
        self.spark_master_url = required_env("SPARK_MASTER_URL")
        self.warehouse_path = required_env("ICEBERG_WAREHOUSE_PATH").rstrip("/")
        self.s3_endpoint = required_env("S3_ENDPOINT").rstrip("/")
        self.s3_access_key = required_env("S3_ACCESS_KEY")
        self.s3_secret_key = required_env("S3_SECRET_KEY")
        self.s3_region = required_env("S3_REGION")
        self.poll_seconds = integer_env("SEDONA_JOB_POLL_SECONDS", 3, 1, 60)
        self.stale_after_seconds = integer_env("SEDONA_JOB_STALE_AFTER_SECONDS", 300, 60, 86_400)
        self.max_runtime_seconds = integer_env("SEDONA_JOB_MAX_RUNTIME_SECONDS", 3_600, 60, 86_400)
        self.startup_probe_timeout_seconds = integer_env("SEDONA_STARTUP_PROBE_TIMEOUT_SECONDS", 180, 30, 900)
        self.health_port = integer_env("SEDONA_WORKER_HEALTH_PORT", 8081, 1024, 65535)
        self.work_dir = Path(os.getenv("SEDONA_JOB_WORK_DIR", "/var/run/idlr-sedona-jobs"))
        self.work_dir.mkdir(parents=True, exist_ok=True)
        parsed = urlparse(self.warehouse_path)
        if parsed.scheme != "s3" or not parsed.netloc:
            raise WorkerConfigurationError("ICEBERG_WAREHOUSE_PATH must use s3://bucket/prefix")
        self.warehouse_bucket = parsed.netloc
        self.warehouse_prefix = parsed.path.strip("/")

    def output_prefix(self, job_key: str) -> str:
        if not JOB_KEY_PATTERN.match(job_key):
            raise WorkerConfigurationError("job key from database is invalid")
        return "/".join(part for part in (self.warehouse_prefix, "spatial", "jobs", job_key) if part)

    def output_uri(self, job_key: str) -> str:
        return f"s3://{self.warehouse_bucket}/{self.output_prefix(job_key)}/artifact-manifest.json"


def connect(settings: WorkerSettings):
    return psycopg2.connect(settings.database_url, cursor_factory=RealDictCursor, connect_timeout=5)


def append_event(cursor: RealDictCursor, *, job_id: int, event_type: str, status: str, attempt: int, actor_type: str, actor_id: str | None, payload: dict[str, Any]) -> None:
    cursor.execute(
        """
        INSERT INTO sedona_spatial_job_events (job_id, event_type, status, attempt, actor_type, actor_id, payload)
        VALUES (%s, %s, %s::sedona_spatial_job_status, %s, %s, %s, %s)
        """,
        (job_id, event_type, status, attempt, actor_type, actor_id, Json(payload)),
    )


def enqueue_outbox(cursor: RealDictCursor, job: dict[str, Any], event_type: str, payload: dict[str, Any]) -> None:
    cursor.execute(
        """
        INSERT INTO event_outbox (backend, topic, event_type, aggregate_type, aggregate_id, payload, partition_key, delivery_status, available_at)
        VALUES ('dapr_pubsub', 'lakehouse-sedona-jobs', %s, 'sedona_spatial_job', %s, %s, %s, 'pending', NOW())
        """,
        (event_type, str(job["id"]), Json({
            "jobId": job["id"],
            "jobKey": job["job_key"],
            "operation": job["operation"],
            "status": job["status"],
            "analysisRunId": job["analysis_run_id"],
            "parcelId": job["parcel_id"],
            **payload,
        }), str(job["parcel_id"] or job["id"])),
    )


def claim_next_job(settings: WorkerSettings) -> dict[str, Any] | None:
    with connect(settings) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                WITH candidate AS (
                  SELECT id
                  FROM sedona_spatial_jobs
                  WHERE attempt < max_attempts
                    AND (
                      status = 'queued'
                      OR (status IN ('claimed', 'running') AND heartbeat_at < NOW() - (%s * INTERVAL '1 second'))
                    )
                  ORDER BY created_at ASC
                  FOR UPDATE SKIP LOCKED
                  LIMIT 1
                )
                UPDATE sedona_spatial_jobs AS job
                SET status = 'claimed', worker_id = %s, attempt = job.attempt + 1,
                    heartbeat_at = NOW(), started_at = COALESCE(job.started_at, NOW()),
                    updated_at = NOW(), failure_code = NULL, failure_reason = NULL
                FROM candidate
                WHERE job.id = candidate.id
                RETURNING job.*
                """,
                (settings.stale_after_seconds, settings.worker_id),
            )
            job = cursor.fetchone()
            if not job:
                return None
            append_event(cursor, job_id=job["id"], event_type="sedona.job.claimed.v1", status="claimed", attempt=job["attempt"], actor_type="worker", actor_id=settings.worker_id, payload={"staleAfterSeconds": settings.stale_after_seconds})
            enqueue_outbox(cursor, job, "sedona.job.claimed.v1", {"workerId": settings.worker_id})
            JOBS_CLAIMED.inc()
            return dict(job)


def set_running(settings: WorkerSettings, job_id: int) -> dict[str, Any]:
    with connect(settings) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE sedona_spatial_jobs
                SET status = 'running', heartbeat_at = NOW(), updated_at = NOW()
                WHERE id = %s AND worker_id = %s AND status = 'claimed'
                RETURNING *
                """,
                (job_id, settings.worker_id),
            )
            job = cursor.fetchone()
            if not job:
                raise RuntimeError(f"job {job_id} could not transition to running")
            append_event(cursor, job_id=job_id, event_type="sedona.job.running.v1", status="running", attempt=job["attempt"], actor_type="worker", actor_id=settings.worker_id, payload={})
            enqueue_outbox(cursor, job, "sedona.job.running.v1", {"workerId": settings.worker_id})
            return dict(job)


def heartbeat_or_cancelled(settings: WorkerSettings, job_id: int) -> bool:
    with connect(settings) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                SELECT status FROM sedona_spatial_jobs
                WHERE id = %s AND worker_id = %s
                FOR UPDATE
                """,
                (job_id, settings.worker_id),
            )
            row = cursor.fetchone()
            if not row:
                raise RuntimeError(f"job {job_id} is no longer owned by worker {settings.worker_id}")
            if row["status"] == "cancel_requested":
                return True
            if row["status"] != "running":
                raise RuntimeError(f"job {job_id} is no longer running")
            cursor.execute(
                "UPDATE sedona_spatial_jobs SET heartbeat_at = NOW(), updated_at = NOW() WHERE id = %s",
                (job_id,),
            )
            return False


def complete_job(settings: WorkerSettings, job_id: int, result: dict[str, Any], output_uri: str, checksum: str) -> None:
    if not output_uri.startswith(f"s3://{settings.warehouse_bucket}/{settings.warehouse_prefix}/"):
        raise RuntimeError("job output URI escapes the configured Iceberg warehouse")
    if not re.fullmatch(r"[a-f0-9]{64}", checksum):
        raise RuntimeError("artifact checksum is invalid")
    with connect(settings) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE sedona_spatial_jobs
                SET status = 'succeeded', result_summary = %s, output_uri = %s, output_checksum_sha256 = %s,
                    spark_application_id = %s, heartbeat_at = NOW(), completed_at = NOW(), updated_at = NOW()
                WHERE id = %s AND worker_id = %s AND status = 'running'
                RETURNING *
                """,
                (Json(result), output_uri, checksum, result.get("sparkApplicationId"), job_id, settings.worker_id),
            )
            job = cursor.fetchone()
            if not job:
                raise RuntimeError(f"job {job_id} cannot complete from its current state")
            append_event(cursor, job_id=job_id, event_type="sedona.job.succeeded.v1", status="succeeded", attempt=job["attempt"], actor_type="worker", actor_id=settings.worker_id, payload={"outputUri": output_uri, "checksumSha256": checksum})
            enqueue_outbox(cursor, job, "sedona.job.succeeded.v1", {"outputUri": output_uri, "checksumSha256": checksum})
            JOBS_TERMINAL.labels(status="succeeded").inc()


def terminal_failure(settings: WorkerSettings, job_id: int, code: str, reason: str, cancelled: bool = False) -> None:
    status = "cancelled" if cancelled else "failed"
    with connect(settings) as connection:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                UPDATE sedona_spatial_jobs
                SET status = %s::sedona_spatial_job_status, failure_code = %s, failure_reason = %s,
                    heartbeat_at = NOW(), completed_at = NOW(), updated_at = NOW()
                WHERE id = %s AND worker_id = %s AND status = ANY(%s::sedona_spatial_job_status[])
                RETURNING *
                """,
                (status, code, reason[:4000], job_id, settings.worker_id, list(ACTIVE_STATUSES)),
            )
            job = cursor.fetchone()
            if not job:
                return
            event_type = "sedona.job.cancelled.v1" if cancelled else "sedona.job.failed.v1"
            append_event(cursor, job_id=job_id, event_type=event_type, status=status, attempt=job["attempt"], actor_type="worker", actor_id=settings.worker_id, payload={"failureCode": code, "failureReason": reason[:4000]})
            enqueue_outbox(cursor, job, event_type, {"failureCode": code, "failureReason": reason[:4000]})
            JOBS_TERMINAL.labels(status=status).inc()


def manifest_path(settings: WorkerSettings, job_key: str) -> Path:
    return settings.work_dir / f"{job_key}-{uuid4().hex}.json"


def write_manifest(settings: WorkerSettings, job: dict[str, Any]) -> tuple[Path, Path]:
    path = manifest_path(settings, job["job_key"])
    result_path = path.with_suffix(".result.json")
    payload = {
        "jobId": job["id"],
        "jobKey": job["job_key"],
        "operation": job["operation"],
        "analysisRunId": job.get("analysis_run_id"),
        "parcelId": job.get("parcel_id"),
        "input": job["input_manifest"],
        "inputChecksumSha256": job["input_checksum_sha256"],
        "warehousePath": settings.warehouse_path,
        "outputPrefix": settings.output_prefix(job["job_key"]),
    }
    path.write_text(json.dumps(payload, sort_keys=True, separators=(",", ":")), encoding="utf-8")
    os.chmod(path, 0o600)
    return path, result_path


def job_environment(settings: WorkerSettings) -> dict[str, str]:
    env = {
        key: value for key, value in os.environ.items()
        if key not in {"POSTGRES_URL", "DATABASE_URL", "S3_SECRET_KEY"}
    }
    endpoint = urlparse(settings.s3_endpoint)
    env.update({
        "SPARK_MASTER_URL": settings.spark_master_url,
        "ICEBERG_WAREHOUSE_PATH": settings.warehouse_path,
        "S3_ENDPOINT": settings.s3_endpoint,
        "S3_ACCESS_KEY": settings.s3_access_key,
        "S3_SECRET_KEY": settings.s3_secret_key,
        "S3_REGION": settings.s3_region,
        "AWS_ACCESS_KEY_ID": settings.s3_access_key,
        "AWS_SECRET_ACCESS_KEY": settings.s3_secret_key,
        "AWS_DEFAULT_REGION": settings.s3_region,
        "AWS_S3_ENDPOINT": settings.s3_endpoint,
        "AWS_S3_FORCE_PATH_STYLE": "YES",
        "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
        "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif,.tiff,.cog",
        "S3A_ENDPOINT_HOST": endpoint.netloc,
    })
    return env


def run_spark_job(settings: WorkerSettings, job: dict[str, Any]) -> dict[str, Any]:
    manifest, result_path = write_manifest(settings, job)
    command = [
        "/opt/spark/bin/spark-submit",
        "--master", settings.spark_master_url,
        "--conf", "spark.ui.enabled=false",
        "--conf", "spark.sql.session.timeZone=UTC",
        "/opt/idlr-sedona/jobs/governed_spatial_job.py",
        "--manifest", str(manifest),
        "--result", str(result_path),
    ]
    process = subprocess.Popen(command, env=job_environment(settings), stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
    started = time.monotonic()
    cancelled = False
    try:
        while process.poll() is None:
            time.sleep(min(5, settings.poll_seconds))
            if heartbeat_or_cancelled(settings, job["id"]):
                cancelled = True
                process.send_signal(signal.SIGTERM)
                try:
                    process.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    process.kill()
                break
            if time.monotonic() - started > settings.max_runtime_seconds:
                process.send_signal(signal.SIGTERM)
                try:
                    process.wait(timeout=30)
                except subprocess.TimeoutExpired:
                    process.kill()
                raise TimeoutError(f"Sedona job exceeded {settings.max_runtime_seconds} seconds")
        output = process.stdout.read() if process.stdout else ""
        if cancelled:
            raise InterruptedError("Sedona job cancellation was requested")
        if process.returncode != 0:
            raise RuntimeError(f"spark-submit exited {process.returncode}: {output[-3000:]}")
        if not result_path.is_file():
            raise RuntimeError("Spark job completed without a result manifest")
        result = json.loads(result_path.read_text(encoding="utf-8"))
        if not isinstance(result, dict) or result.get("status") != "succeeded":
            raise RuntimeError("Spark job returned an invalid result manifest")
        return result
    finally:
        manifest.unlink(missing_ok=True)
        result_path.unlink(missing_ok=True)
        if process.stdout:
            process.stdout.close()


def object_store_client(settings: WorkerSettings):
    return boto3.client(
        "s3",
        endpoint_url=settings.s3_endpoint,
        aws_access_key_id=settings.s3_access_key,
        aws_secret_access_key=settings.s3_secret_key,
        region_name=settings.s3_region,
    )


def iter_object_keys(client: Any, bucket: str, prefix: str) -> Iterator[str]:
    paginator = client.get_paginator("list_objects_v2")
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item.get("Key")
            if isinstance(key, str) and key and not key.endswith("/"):
                yield key


def write_artifact_manifest(settings: WorkerSettings, job: dict[str, Any], spark_result: dict[str, Any]) -> tuple[str, str]:
    client = object_store_client(settings)
    prefix = f"{settings.output_prefix(job['job_key'])}/data/"
    objects: list[dict[str, Any]] = []
    for key in sorted(iter_object_keys(client, settings.warehouse_bucket, prefix)):
        digest = hashlib.sha256()
        response = client.get_object(Bucket=settings.warehouse_bucket, Key=key)
        body = response["Body"]
        try:
            for block in iter(lambda: body.read(1024 * 1024), b""):
                digest.update(block)
        finally:
            body.close()
        objects.append({"key": key, "checksumSha256": digest.hexdigest(), "sizeBytes": int(response.get("ContentLength", 0))})
    if not objects:
        raise RuntimeError("Spark job did not produce a persisted output object")
    artifact = {
        "manifestVersion": 1,
        "jobId": job["id"],
        "jobKey": job["job_key"],
        "operation": job["operation"],
        "inputChecksumSha256": job["input_checksum_sha256"],
        "sparkResult": spark_result,
        "objects": objects,
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    payload = json.dumps(artifact, sort_keys=True, separators=(",", ":")).encode("utf-8")
    checksum = hashlib.sha256(payload).hexdigest()
    key = f"{settings.output_prefix(job['job_key'])}/artifact-manifest.json"
    client.put_object(Bucket=settings.warehouse_bucket, Key=key, Body=payload, ContentType="application/json", Metadata={"checksum-sha256": checksum, "job-key": job["job_key"]})
    return f"s3://{settings.warehouse_bucket}/{key}", checksum


def execute_one(settings: WorkerSettings, job: dict[str, Any]) -> None:
    set_running(settings, job["id"])
    try:
        result = run_spark_job(settings, job)
        output_uri, checksum = write_artifact_manifest(settings, job, result)
        complete_job(settings, job["id"], result, output_uri, checksum)
    except InterruptedError as exc:
        terminal_failure(settings, job["id"], "CANCELLED", str(exc), cancelled=True)
    except TimeoutError as exc:
        terminal_failure(settings, job["id"], "SPARK_TIMEOUT", str(exc))
    except Exception as exc:
        terminal_failure(settings, job["id"], "SPARK_EXECUTION_FAILED", str(exc))


def start_readiness_server(settings: WorkerSettings) -> None:
    class ReadinessHandler(BaseHTTPRequestHandler):
        def do_GET(self) -> None:  # noqa: N802 - required by BaseHTTPRequestHandler
            if self.path != "/ready":
                self.send_response(HTTPStatus.NOT_FOUND)
                self.end_headers()
                return
            payload = json.dumps({"status": "ready" if _READY.is_set() else "not_ready"}).encode("utf-8")
            self.send_response(HTTPStatus.OK if _READY.is_set() else HTTPStatus.SERVICE_UNAVAILABLE)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def log_message(self, _format: str, *_args: Any) -> None:
            # Health checks are frequent; structured worker events remain in the durable queue log.
            return

    server = ThreadingHTTPServer(("0.0.0.0", settings.health_port), ReadinessHandler)
    threading.Thread(target=server.serve_forever, name="sedona-worker-readiness", daemon=True).start()


def run_startup_sedona_probe(settings: WorkerSettings) -> None:
    command = [
        "/opt/spark/bin/spark-submit",
        "--master", settings.spark_master_url,
        "--conf", "spark.ui.enabled=false",
        "/opt/idlr-sedona/jobs/runtime_probe.py",
    ]
    completed = subprocess.run(
        command,
        env=job_environment(settings),
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=settings.startup_probe_timeout_seconds,
        check=False,
    )
    output = completed.stdout or ""
    if completed.returncode != 0 or '"status":"ready"' not in output:
        raise RuntimeError(f"Sedona startup SQL probe failed: {output[-3000:]}")


def main() -> None:
    settings = WorkerSettings()
    start_http_server(integer_env("SEDONA_WORKER_METRICS_PORT", 9108, 1024, 65535))
    start_readiness_server(settings)
    WORKER_ALIVE.set(0)
    WORKER_READY.set(0)
    run_startup_sedona_probe(settings)
    _READY.set()
    WORKER_READY.set(1)
    probe_only = os.getenv("SEDONA_WORKER_PROBE_ONLY", "false").lower() == "true"
    once = os.getenv("SEDONA_WORKER_ONCE", "false").lower() == "true"
    while True:
        if probe_only:
            WORKER_ALIVE.set(1)
            time.sleep(settings.poll_seconds)
            continue
        WORKER_ALIVE.set(1)
        job = claim_next_job(settings)
        if job:
            execute_one(settings, job)
        elif once:
            return
        else:
            time.sleep(settings.poll_seconds)


if __name__ == "__main__":
    main()
