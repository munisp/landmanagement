FROM apache/spark:3.5.5

USER root

ARG SEDONA_VERSION=1.9.1
ARG ICEBERG_VERSION=1.7.1
ARG HADOOP_AWS_VERSION=3.3.4
ARG AWS_SDK_VERSION=1.12.262
ARG POSTGRES_JDBC_VERSION=42.7.4

ENV SPARK_HOME=/opt/spark \
    PYSPARK_PYTHON=python3 \
    PYTHONUNBUFFERED=1 \
    SEDONA_VERSION=${SEDONA_VERSION} \
    ICEBERG_VERSION=${ICEBERG_VERSION}

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3-pip curl ca-certificates tini \
    && rm -rf /var/lib/apt/lists/* \
    && python3 -m pip install --no-cache-dir "apache-sedona==${SEDONA_VERSION}" "pyspark==3.5.5" "pandas==2.0.3" "pyarrow==17.0.0" "numpy==1.24.4" "shapely==2.0.7" "pyproj==3.5.0" "rasterio==1.3.9" "psycopg2-binary==2.9.10" "boto3==1.35.99" "prometheus-client==0.21.1" \
    && curl --fail --location --retry 4 --retry-delay 2 \
      "https://repo.maven.apache.org/maven2/org/apache/sedona/sedona-spark-shaded-3.5_2.12/${SEDONA_VERSION}/sedona-spark-shaded-3.5_2.12-${SEDONA_VERSION}.jar" \
      --output "${SPARK_HOME}/jars/sedona-spark-shaded-3.5_2.12-${SEDONA_VERSION}.jar" \
    && curl --fail --location --retry 4 --retry-delay 2 \
      "https://repo.maven.apache.org/maven2/org/datasyslab/geotools-wrapper/${SEDONA_VERSION}-33.5/geotools-wrapper-${SEDONA_VERSION}-33.5.jar" \
      --output "${SPARK_HOME}/jars/geotools-wrapper-${SEDONA_VERSION}-33.5.jar" \
    && curl --fail --location --retry 4 --retry-delay 2 \
      "https://repo.maven.apache.org/maven2/org/apache/iceberg/iceberg-spark-runtime-3.5_2.12/${ICEBERG_VERSION}/iceberg-spark-runtime-3.5_2.12-${ICEBERG_VERSION}.jar" \
      --output "${SPARK_HOME}/jars/iceberg-spark-runtime-3.5_2.12-${ICEBERG_VERSION}.jar" \
    && curl --fail --location --retry 4 --retry-delay 2 \
      "https://repo.maven.apache.org/maven2/org/apache/hadoop/hadoop-aws/${HADOOP_AWS_VERSION}/hadoop-aws-${HADOOP_AWS_VERSION}.jar" \
      --output "${SPARK_HOME}/jars/hadoop-aws-${HADOOP_AWS_VERSION}.jar" \
    && curl --fail --location --retry 4 --retry-delay 2 \
      "https://repo.maven.apache.org/maven2/com/amazonaws/aws-java-sdk-bundle/${AWS_SDK_VERSION}/aws-java-sdk-bundle-${AWS_SDK_VERSION}.jar" \
      --output "${SPARK_HOME}/jars/aws-java-sdk-bundle-${AWS_SDK_VERSION}.jar" \
    && curl --fail --location --retry 4 --retry-delay 2 \
      "https://repo.maven.apache.org/maven2/org/postgresql/postgresql/${POSTGRES_JDBC_VERSION}/postgresql-${POSTGRES_JDBC_VERSION}.jar" \
      --output "${SPARK_HOME}/jars/postgresql-${POSTGRES_JDBC_VERSION}.jar"

COPY bin/entrypoint.sh /opt/idlr-sedona/bin/entrypoint.sh
COPY jobs /opt/idlr-sedona/jobs
COPY worker.py /opt/idlr-sedona/worker.py
RUN chmod 0555 /opt/idlr-sedona/bin/entrypoint.sh \
    && find /opt/idlr-sedona/jobs -type f -name '*.py' -exec chmod 0444 {} \; \
    && chmod 0444 /opt/idlr-sedona/worker.py \
    && install -d -o 185 -g 0 -m 0750 /var/run/idlr-sedona-jobs

USER 185
ENTRYPOINT ["/usr/bin/tini", "--", "/opt/idlr-sedona/bin/entrypoint.sh"]
CMD ["master"]
