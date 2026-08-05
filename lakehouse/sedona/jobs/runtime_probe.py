from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone


def main() -> int:
    from sedona.spark import SedonaContext

    spark = (
        SedonaContext.builder()
        .appName("idlr-sedona-runtime-readiness")
        .config(
            "spark.sql.extensions",
            "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions,"
            "org.apache.sedona.sql.SedonaSqlExtensions",
        )
        .config("spark.serializer", "org.apache.spark.serializer.KryoSerializer")
        .config("spark.kryo.registrator", "org.apache.sedona.core.serde.SedonaKryoRegistrator")
        .config("spark.sql.session.timeZone", "UTC")
        .getOrCreate()
    )
    try:
        sedona = SedonaContext.create(spark)
        row = sedona.sql(
            """
            SELECT
              ST_Intersects(
                ST_GeomFromWKT('POLYGON((0 0,0 2,2 2,2 0,0 0))'),
                ST_GeomFromWKT('POINT(1 1)')
              ) AS intersects,
              ST_AsText(ST_Intersection(
                ST_GeomFromWKT('POLYGON((0 0,0 2,2 2,2 0,0 0))'),
                ST_GeomFromWKT('POINT(1 1)')
              )) AS intersection_wkt
            """
        ).first()
        if row is None or row["intersects"] is not True or row["intersection_wkt"] != "POINT (1 1)":
            raise RuntimeError("Sedona spatial SQL readiness query returned an unexpected result")
        print(
            json.dumps(
                {
                    "status": "ready",
                    "spark_version": spark.version,
                    "sedona_version": os.environ.get("SEDONA_VERSION", "unknown"),
                    "checked_at": datetime.now(timezone.utc).isoformat(),
                },
                separators=(",", ":"),
            )
        )
        return 0
    finally:
        spark.stop()


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(json.dumps({"status": "not_ready", "error": str(exc)}), file=sys.stderr)
        raise
