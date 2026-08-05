#!/bin/sh
set -eu

mode="${1:-master}"
if [ "$#" -gt 0 ]; then
  shift
fi

SPARK_HOME="${SPARK_HOME:-/opt/spark}"
SPARK_MASTER_HOST="${SPARK_MASTER_HOST:-sedona-spark-master}"
SPARK_MASTER_PORT="${SPARK_MASTER_PORT:-7077}"
SPARK_MASTER_URL="${SPARK_MASTER_URL:-spark://${SPARK_MASTER_HOST}:${SPARK_MASTER_PORT}}"

case "$mode" in
  master)
    exec "${SPARK_HOME}/bin/spark-class" org.apache.spark.deploy.master.Master \
      --host "${SPARK_MASTER_HOST}" \
      --port "${SPARK_MASTER_PORT}" \
      --webui-port "${SPARK_MASTER_WEBUI_PORT:-8080}"
    ;;
  worker)
    exec "${SPARK_HOME}/bin/spark-class" org.apache.spark.deploy.worker.Worker \
      --webui-port "${SPARK_WORKER_WEBUI_PORT:-8081}" \
      --cores "${SPARK_WORKER_CORES:-2}" \
      --memory "${SPARK_WORKER_MEMORY:-2g}" \
      "${SPARK_MASTER_URL}"
    ;;
  probe)
    exec "${SPARK_HOME}/bin/spark-submit" \
      --master "${SPARK_MASTER_URL}" \
      --deploy-mode client \
      --conf "spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,org.apache.sedona.sql.SedonaSqlExtensions" \
      --conf "spark.serializer=org.apache.spark.serializer.KryoSerializer" \
      --conf "spark.kryo.registrator=org.apache.sedona.core.serde.SedonaKryoRegistrator" \
      /opt/idlr-sedona/jobs/runtime_probe.py
    ;;
  submit)
    if [ "$#" -ne 1 ] || [ "$1" != "/opt/idlr-sedona/jobs/governed_spatial_job.py" ]; then
      echo "submit mode accepts only the packaged governed spatial job entry point" >&2
      exit 64
    fi
    exec "${SPARK_HOME}/bin/spark-submit" \
      --master "${SPARK_MASTER_URL}" \
      --deploy-mode client \
      --conf "spark.sql.extensions=org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,org.apache.sedona.sql.SedonaSqlExtensions" \
      --conf "spark.serializer=org.apache.spark.serializer.KryoSerializer" \
      --conf "spark.kryo.registrator=org.apache.sedona.core.serde.SedonaKryoRegistrator" \
      /opt/idlr-sedona/jobs/governed_spatial_job.py
    ;;
  job-worker)
    if [ "$#" -ne 0 ]; then
      echo "job-worker mode does not accept additional arguments" >&2
      exit 64
    fi
    exec python3 /opt/idlr-sedona/worker.py
    ;;
  *)
    echo "unsupported Sedona runtime mode: ${mode}" >&2
    exit 64
    ;;
esac
