# Apache Iceberg Lakehouse Deployment Guide

**IDLR-PTS Platform - Data Lakehouse Architecture**

**Version:** 1.0  
**Last Updated:** February 24, 2026  
**Author:** Manus AI

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Architecture Overview](#architecture-overview)
3. [Prerequisites](#prerequisites)
4. [Infrastructure Setup](#infrastructure-setup)
5. [Iceberg Catalog Configuration](#iceberg-catalog-configuration)
6. [Table Schema Deployment](#table-schema-deployment)
7. [Kafka Connect Integration](#kafka-connect-integration)
8. [PostgreSQL CDC Pipeline](#postgresql-cdc-pipeline)
9. [Analytics Queries](#analytics-queries)
10. [ML Feature Engineering](#ml-feature-engineering)
11. [Monitoring and Operations](#monitoring-and-operations)
12. [Security Configuration](#security-configuration)
13. [Performance Optimization](#performance-optimization)
14. [Troubleshooting](#troubleshooting)

---

## Executive Summary

The IDLR-PTS lakehouse architecture provides a unified data platform for real-time analytics, machine learning, and regulatory reporting. Built on Apache Iceberg with PostgreSQL catalog backend and S3-compatible storage, the lakehouse integrates seamlessly with Kafka event streams, TigerBeetle ledger, Polygon blockchain, and Mojaloop payments.

**Key Capabilities:**

- **Real-time Event Ingestion:** Kafka Connect sinks stream payment, blockchain, ledger, and workflow events into Iceberg tables with sub-second latency
- **ACID Transactions:** Full ACID guarantees for all table operations with schema evolution and time travel
- **Geospatial Analytics:** PostGIS integration for property boundary analysis, spatial joins, and location-based insights
- **ML Feature Store:** Automated feature engineering pipeline for property valuation models and fraud detection
- **Regulatory Compliance:** Immutable audit trails with point-in-time snapshots for financial reporting

---

## Architecture Overview

### System Components

The lakehouse architecture consists of five layers:

**1. Ingestion Layer**
- Kafka Connect with Iceberg sink connectors
- Debezium CDC for PostgreSQL change streams
- Batch ETL jobs for historical data migration

**2. Storage Layer**
- Apache Iceberg tables with Parquet file format
- S3-compatible object storage (MinIO or AWS S3)
- PostgreSQL catalog for metadata management

**3. Processing Layer**
- Apache Spark for batch analytics and ML training
- Trino/Presto for interactive SQL queries
- Python/PyIceberg for data science workflows

**4. Serving Layer**
- Materialized views for dashboard queries
- Feature store for ML model serving
- REST API for external integrations

**5. Governance Layer**
- Schema registry for event validation
- Data quality checks with Great Expectations
- Access control with Apache Ranger

### Data Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     IDLR-PTS Application                     │
│  (Mojaloop + Blockchain + TigerBeetle + Temporal)           │
└──────────────┬──────────────────────────────┬───────────────┘
               │                               │
               ▼                               ▼
        ┌─────────────┐              ┌──────────────────┐
        │    Kafka    │              │   PostgreSQL     │
        │   Topics    │              │   (Operational)  │
        └──────┬──────┘              └────────┬─────────┘
               │                               │
               │ Kafka Connect                 │ Debezium CDC
               │ Iceberg Sink                  │
               ▼                               ▼
        ┌──────────────────────────────────────────────┐
        │          Apache Iceberg Lakehouse            │
        │  ┌────────────┐  ┌────────────┐  ┌────────┐ │
        │  │   Events   │  │ Snapshots  │  │ ML     │ │
        │  │  (Streams) │  │ (Daily)    │  │Features│ │
        │  └────────────┘  └────────────┘  └────────┘ │
        │                                              │
        │         Storage: S3/MinIO (Parquet)          │
        │         Catalog: PostgreSQL                  │
        └──────────────────┬───────────────────────────┘
                           │
                           ▼
                ┌──────────────────────┐
                │  Analytics & ML      │
                │  - Spark Jobs        │
                │  - Trino Queries     │
                │  - Python Notebooks  │
                └──────────────────────┘
```

---

## Prerequisites

### Software Requirements

| Component | Version | Purpose |
|-----------|---------|---------|
| Python | 3.11+ | PyIceberg and analytics scripts |
| PostgreSQL | 15+ | Iceberg catalog and operational DB |
| Apache Kafka | 3.6+ | Event streaming platform |
| Kafka Connect | 3.6+ | Iceberg sink connectors |
| MinIO / AWS S3 | Latest | Object storage for Parquet files |
| Apache Spark | 3.5+ | Batch processing and ML training |
| Trino | 435+ | Interactive SQL queries |
| Docker | 24+ | Container orchestration |
| Kubernetes | 1.28+ | Production deployment (optional) |

### Hardware Requirements

**Development Environment:**
- 16 GB RAM minimum
- 100 GB SSD storage
- 4 CPU cores

**Production Environment:**
- **Kafka Cluster:** 3 nodes, 32 GB RAM each, 500 GB SSD
- **PostgreSQL:** 1 primary + 2 replicas, 64 GB RAM, 1 TB SSD
- **MinIO/S3:** 3 nodes, 128 GB RAM each, 10 TB HDD
- **Spark Cluster:** 1 master + 4 workers, 64 GB RAM each
- **Trino Cluster:** 1 coordinator + 4 workers, 128 GB RAM each

### Network Requirements

- 10 Gbps internal network for data transfer
- TLS 1.3 for all external connections
- VPN or private network for cross-region replication

---

## Infrastructure Setup

### Option 1: Docker Compose (Development)

Create `docker-compose-lakehouse.yml`:

```yaml
version: '3.8'

services:
  # PostgreSQL for Iceberg catalog
  postgres-catalog:
    image: postgres:15-alpine
    container_name: iceberg-catalog
    environment:
      POSTGRES_DB: iceberg_catalog
      POSTGRES_USER: iceberg
      POSTGRES_PASSWORD: iceberg_password
    ports:
      - "5433:5432"
    volumes:
      - postgres-catalog-data:/var/lib/postgresql/data
    networks:
      - lakehouse

  # MinIO for object storage
  minio:
    image: minio/minio:latest
    container_name: minio
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: minioadmin
      MINIO_ROOT_PASSWORD: minioadmin
    ports:
      - "9000:9000"
      - "9001:9001"
    volumes:
      - minio-data:/data
    networks:
      - lakehouse

  # Create MinIO bucket
  minio-init:
    image: minio/mc:latest
    depends_on:
      - minio
    entrypoint: >
      /bin/sh -c "
      sleep 5;
      mc alias set myminio http://minio:9000 minioadmin minioadmin;
      mc mb myminio/idlr-lakehouse || true;
      mc policy set public myminio/idlr-lakehouse;
      "
    networks:
      - lakehouse

  # Apache Spark master
  spark-master:
    image: bitnami/spark:3.5
    container_name: spark-master
    environment:
      - SPARK_MODE=master
      - SPARK_RPC_AUTHENTICATION_ENABLED=no
      - SPARK_RPC_ENCRYPTION_ENABLED=no
    ports:
      - "8080:8080"
      - "7077:7077"
    networks:
      - lakehouse

  # Apache Spark worker
  spark-worker:
    image: bitnami/spark:3.5
    container_name: spark-worker
    environment:
      - SPARK_MODE=worker
      - SPARK_MASTER_URL=spark://spark-master:7077
      - SPARK_WORKER_MEMORY=4G
      - SPARK_WORKER_CORES=2
    depends_on:
      - spark-master
    networks:
      - lakehouse

  # Trino coordinator
  trino:
    image: trinodb/trino:435
    container_name: trino
    ports:
      - "8081:8080"
    volumes:
      - ./trino/catalog:/etc/trino/catalog
    networks:
      - lakehouse

volumes:
  postgres-catalog-data:
  minio-data:

networks:
  lakehouse:
    driver: bridge
```

Start the lakehouse infrastructure:

```bash
docker-compose -f docker-compose-lakehouse.yml up -d
```

### Option 2: Kubernetes (Production)

Create Kubernetes manifests for each component using Helm charts:

**PostgreSQL (Bitnami Helm Chart):**

```bash
helm repo add bitnami https://charts.bitnami.com/bitnami
helm install postgres-catalog bitnami/postgresql \
  --set auth.database=iceberg_catalog \
  --set auth.username=iceberg \
  --set auth.password=iceberg_password \
  --set primary.persistence.size=100Gi \
  --set readReplicas.replicaCount=2
```

**MinIO (MinIO Operator):**

```bash
kubectl apply -f https://github.com/minio/operator/releases/latest/download/minio-operator.yaml
kubectl apply -f - <<EOF
apiVersion: v1
kind: Secret
metadata:
  name: minio-creds-secret
type: Opaque
data:
  accesskey: $(echo -n 'minioadmin' | base64)
  secretkey: $(echo -n 'minioadmin' | base64)
---
apiVersion: minio.min.io/v2
kind: Tenant
metadata:
  name: idlr-lakehouse
spec:
  image: minio/minio:latest
  pools:
    - servers: 4
      volumesPerServer: 4
      volumeClaimTemplate:
        spec:
          accessModes:
            - ReadWriteOnce
          resources:
            requests:
              storage: 1Ti
  mountPath: /export
  credsSecret:
    name: minio-creds-secret
EOF
```

**Spark (Spark Operator):**

```bash
helm repo add spark-operator https://googlecloudplatform.github.io/spark-on-k8s-operator
helm install spark-operator spark-operator/spark-operator \
  --namespace spark-operator \
  --create-namespace
```

**Trino (Trino Helm Chart):**

```bash
helm repo add trino https://trinodb.github.io/charts
helm install trino trino/trino \
  --set server.workers=4 \
  --set server.coordinatorExtraConfig="query.max-memory-per-node=32GB"
```

---

## Iceberg Catalog Configuration

### Initialize Catalog

Install Python dependencies:

```bash
cd /home/ubuntu/idlr-pts-platform/lakehouse
pip3 install -r requirements.txt
```

Set environment variables:

```bash
export ICEBERG_CATALOG_URI="postgresql://iceberg:iceberg_password@localhost:5433/iceberg_catalog"
export ICEBERG_WAREHOUSE_PATH="s3://idlr-lakehouse/warehouse"
export S3_ENDPOINT="http://localhost:9000"
export S3_ACCESS_KEY="minioadmin"
export S3_SECRET_KEY="minioadmin"
```

Initialize catalog and namespaces:

```bash
python3 catalog/iceberg_catalog.py
```

Expected output:

```
✅ Iceberg catalog initialized successfully
✅ Created namespace: events
✅ Created namespace: snapshots
✅ Created namespace: analytics
✅ Created namespace: ml_features
✅ All lakehouse namespaces initialized

Available namespaces:
  - events
  - snapshots
  - analytics
  - ml_features
```

---

## Table Schema Deployment

### Create All Tables

Run the schema deployment script:

```bash
python3 schemas/table_schemas.py
```

This creates 10 Iceberg tables:

**Event Streams (events namespace):**
1. `payment_events` - Payment lifecycle events
2. `blockchain_events` - Smart contract transactions
3. `ledger_events` - TigerBeetle ledger operations
4. `workflow_events` - Temporal workflow state changes
5. `reconciliation_events` - Cross-system reconciliation

**Snapshots (snapshots namespace):**
6. `parcels` - Daily parcel data snapshots
7. `transactions` - Daily transaction snapshots

**Analytics (analytics namespace):**
8. `property_analytics` - Aggregated property metrics
9. `payment_analytics` - Payment system metrics

**ML Features (ml_features namespace):**
10. `property_features` - ML training features

### Verify Table Creation

```bash
python3 -c "
from catalog.iceberg_catalog import get_catalog_manager
manager = get_catalog_manager()
for ns in ['events', 'snapshots', 'analytics', 'ml_features']:
    print(f'\n{ns}:')
    for table in manager.list_tables(ns):
        print(f'  - {table}')
"
```

---

## Kafka Connect Integration

### Install Iceberg Sink Connector

Download and install the Iceberg sink connector:

```bash
cd /opt/kafka/plugins
wget https://github.com/tabular-io/iceberg-kafka-connect/releases/download/v0.6.15/iceberg-kafka-connect-runtime-0.6.15.jar
```

### Configure Connector for Payment Events

Create `connectors/payment-events-sink.json`:

```json
{
  "name": "payment-events-iceberg-sink",
  "config": {
    "connector.class": "io.tabular.iceberg.connect.IcebergSinkConnector",
    "tasks.max": "2",
    "topics": "payment-events",
    "iceberg.tables": "events.payment_events",
    "iceberg.catalog.type": "rest",
    "iceberg.catalog.uri": "http://iceberg-rest:8181",
    "iceberg.catalog.warehouse": "s3://idlr-lakehouse/warehouse",
    "iceberg.catalog.s3.endpoint": "http://minio:9000",
    "iceberg.catalog.s3.access-key-id": "minioadmin",
    "iceberg.catalog.s3.secret-access-key": "minioadmin",
    "iceberg.catalog.s3.path-style-access": "true",
    "iceberg.control.commit.interval-ms": "30000",
    "iceberg.control.commit.timeout-ms": "60000",
    "key.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter": "org.apache.kafka.connect.json.JsonConverter",
    "value.converter.schemas.enable": "false",
    "errors.tolerance": "all",
    "errors.log.enable": "true",
    "errors.log.include.messages": "true"
  }
}
```

Deploy the connector:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @connectors/payment-events-sink.json
```

### Configure Additional Connectors

Create similar configurations for:
- `blockchain-events-iceberg-sink.json`
- `ledger-events-iceberg-sink.json`
- `workflow-events-iceberg-sink.json`
- `reconciliation-events-iceberg-sink.json`

Deploy all connectors:

```bash
for config in connectors/*-sink.json; do
  curl -X POST http://localhost:8083/connectors \
    -H "Content-Type: application/json" \
    -d @$config
done
```

### Verify Connector Status

```bash
curl http://localhost:8083/connectors/payment-events-iceberg-sink/status | jq
```

Expected output:

```json
{
  "name": "payment-events-iceberg-sink",
  "connector": {
    "state": "RUNNING",
    "worker_id": "connect-1:8083"
  },
  "tasks": [
    {
      "id": 0,
      "state": "RUNNING",
      "worker_id": "connect-1:8083"
    }
  ]
}
```

---

## PostgreSQL CDC Pipeline

### Install Debezium PostgreSQL Connector

```bash
cd /opt/kafka/plugins
wget https://repo1.maven.org/maven2/io/debezium/debezium-connector-postgres/2.5.0.Final/debezium-connector-postgres-2.5.0.Final-plugin.tar.gz
tar -xzf debezium-connector-postgres-2.5.0.Final-plugin.tar.gz
```

### Enable Logical Replication

Edit PostgreSQL configuration (`postgresql.conf`):

```ini
wal_level = logical
max_replication_slots = 10
max_wal_senders = 10
```

Restart PostgreSQL:

```bash
docker-compose restart postgres
```

### Configure CDC for Parcels Table

Create `connectors/parcels-cdc.json`:

```json
{
  "name": "parcels-cdc-source",
  "config": {
    "connector.class": "io.debezium.connector.postgresql.PostgresConnector",
    "tasks.max": "1",
    "database.hostname": "postgres",
    "database.port": "5432",
    "database.user": "postgres",
    "database.password": "postgres",
    "database.dbname": "idlr_pts",
    "database.server.name": "idlr_pts_db",
    "table.include.list": "public.parcels",
    "plugin.name": "pgoutput",
    "publication.autocreate.mode": "filtered",
    "topic.prefix": "cdc",
    "snapshot.mode": "initial",
    "transforms": "route",
    "transforms.route.type": "org.apache.kafka.connect.transforms.RegexRouter",
    "transforms.route.regex": "cdc.public.parcels",
    "transforms.route.replacement": "parcels-snapshots"
  }
}
```

Deploy CDC connector:

```bash
curl -X POST http://localhost:8083/connectors \
  -H "Content-Type: application/json" \
  -d @connectors/parcels-cdc.json
```

### Create Snapshot Sink Connector

Create `connectors/parcels-snapshot-sink.json`:

```json
{
  "name": "parcels-snapshot-iceberg-sink",
  "config": {
    "connector.class": "io.tabular.iceberg.connect.IcebergSinkConnector",
    "tasks.max": "1",
    "topics": "parcels-snapshots",
    "iceberg.tables": "snapshots.parcels",
    "iceberg.catalog.type": "rest",
    "iceberg.catalog.uri": "http://iceberg-rest:8181",
    "iceberg.catalog.warehouse": "s3://idlr-lakehouse/warehouse",
    "iceberg.control.commit.interval-ms": "60000"
  }
}
```

---

## Analytics Queries

### Property Market Analytics

Create `analytics/property_market_queries.sql`:

```sql
-- Daily transaction volume by region
SELECT
  date_trunc('day', snapshot_time) AS date,
  state AS region,
  COUNT(DISTINCT transaction_id) AS total_transactions,
  SUM(sale_price) AS total_value,
  AVG(sale_price / NULLIF(size_sqm, 0)) AS avg_price_per_sqm,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS median_sale_price
FROM snapshots.transactions t
JOIN snapshots.parcels p ON t.parcel_id = p.parcel_id
WHERE snapshot_time >= CURRENT_DATE - INTERVAL '30' DAY
  AND transaction_type = 'sale'
  AND status = 'completed'
GROUP BY date_trunc('day', snapshot_time), state
ORDER BY date DESC, total_value DESC;

-- Property price trends (7-day moving average)
WITH daily_prices AS (
  SELECT
    date_trunc('day', snapshot_time) AS date,
    state,
    AVG(sale_price / NULLIF(size_sqm, 0)) AS avg_price_sqm
  FROM snapshots.transactions t
  JOIN snapshots.parcels p ON t.parcel_id = p.parcel_id
  WHERE transaction_type = 'sale'
    AND status = 'completed'
  GROUP BY date_trunc('day', snapshot_time), state
)
SELECT
  date,
  state,
  avg_price_sqm,
  AVG(avg_price_sqm) OVER (
    PARTITION BY state
    ORDER BY date
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) AS moving_avg_7d
FROM daily_prices
ORDER BY state, date;

-- Geospatial hotspot analysis
SELECT
  ST_AsText(ST_Centroid(ST_Collect(ST_GeomFromText(geometry_wkt)))) AS hotspot_center,
  COUNT(*) AS transaction_count,
  AVG(sale_price) AS avg_price,
  state,
  city
FROM snapshots.parcels p
JOIN snapshots.transactions t ON p.parcel_id = t.parcel_id
WHERE t.snapshot_time >= CURRENT_DATE - INTERVAL '90' DAY
  AND t.transaction_type = 'sale'
  AND t.status = 'completed'
GROUP BY state, city
HAVING COUNT(*) >= 10
ORDER BY transaction_count DESC
LIMIT 20;
```

### Payment System Analytics

Create `analytics/payment_analytics_queries.sql`:

```sql
-- Payment success rate by method
SELECT
  date_trunc('day', event_time) AS date,
  payment_method,
  COUNT(*) AS total_payments,
  SUM(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) AS successful_payments,
  SUM(CASE WHEN event_type = 'failed' THEN 1 ELSE 0 END) AS failed_payments,
  ROUND(100.0 * SUM(CASE WHEN event_type = 'completed' THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate_pct
FROM events.payment_events
WHERE event_time >= CURRENT_DATE - INTERVAL '7' DAY
GROUP BY date_trunc('day', event_time), payment_method
ORDER BY date DESC, total_payments DESC;

-- Average payment processing time
WITH payment_lifecycle AS (
  SELECT
    payment_id,
    MIN(CASE WHEN event_type = 'initiated' THEN event_time END) AS initiated_at,
    MIN(CASE WHEN event_type IN ('completed', 'failed') THEN event_time END) AS completed_at
  FROM events.payment_events
  WHERE event_time >= CURRENT_DATE - INTERVAL '30' DAY
  GROUP BY payment_id
  HAVING MIN(CASE WHEN event_type = 'initiated' THEN event_time END) IS NOT NULL
    AND MIN(CASE WHEN event_type IN ('completed', 'failed') THEN event_time END) IS NOT NULL
)
SELECT
  date_trunc('day', initiated_at) AS date,
  COUNT(*) AS payment_count,
  AVG(EXTRACT(EPOCH FROM (completed_at - initiated_at)) * 1000) AS avg_processing_time_ms,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - initiated_at)) * 1000) AS median_processing_time_ms,
  PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (completed_at - initiated_at)) * 1000) AS p95_processing_time_ms
FROM payment_lifecycle
GROUP BY date_trunc('day', initiated_at)
ORDER BY date DESC;
```

### Reconciliation Audit

Create `analytics/reconciliation_audit_queries.sql`:

```sql
-- Cross-system reconciliation status
SELECT
  date_trunc('hour', r.event_time) AS hour,
  COUNT(*) AS total_reconciliations,
  SUM(CASE WHEN r.reconciled = true THEN 1 ELSE 0 END) AS successful,
  SUM(CASE WHEN r.reconciled = false THEN 1 ELSE 0 END) AS failed,
  ROUND(100.0 * SUM(CASE WHEN r.reconciled = true THEN 1 ELSE 0 END) / COUNT(*), 2) AS success_rate_pct
FROM events.reconciliation_events r
WHERE r.event_time >= CURRENT_TIMESTAMP - INTERVAL '24' HOUR
GROUP BY date_trunc('hour', r.event_time)
ORDER BY hour DESC;

-- Identify discrepancies
SELECT
  r.payment_id,
  r.transaction_hash,
  r.transfer_id,
  r.property_id,
  r.discrepancies,
  p.amount AS payment_amount,
  b.amount AS blockchain_amount,
  l.amount AS ledger_amount
FROM events.reconciliation_events r
LEFT JOIN events.payment_events p ON r.payment_id = p.payment_id AND p.event_type = 'completed'
LEFT JOIN events.blockchain_events b ON r.transaction_hash = b.transaction_hash AND b.event_type = 'escrow_created'
LEFT JOIN events.ledger_events l ON r.transfer_id = l.transfer_id AND l.event_type = 'transfer_posted'
WHERE r.reconciled = false
  AND r.event_time >= CURRENT_DATE - INTERVAL '7' DAY
ORDER BY r.event_time DESC;
```

---

## ML Feature Engineering

### Property Valuation Features

Create `ml/property_valuation_features.py`:

```python
"""
Property Valuation ML Feature Engineering

Generates features for property price prediction models.
"""

import pandas as pd
from pyiceberg.catalog import load_catalog
from datetime import datetime, timedelta
from sklearn.preprocessing import LabelEncoder
import numpy as np

def extract_property_features(catalog, lookback_days=365):
    """
    Extract ML features for property valuation.
    
    Args:
        catalog: Iceberg catalog instance
        lookback_days: Number of days to look back for historical features
        
    Returns:
        DataFrame with property features
    """
    
    # Load parcels snapshot
    parcels_table = catalog.load_table("snapshots.parcels")
    parcels_df = parcels_table.scan().to_pandas()
    
    # Load transactions snapshot
    transactions_table = catalog.load_table("snapshots.transactions")
    transactions_df = transactions_table.scan(
        row_filter=f"snapshot_time >= '{datetime.now() - timedelta(days=lookback_days)}'"
    ).to_pandas()
    
    # Property characteristics
    features = parcels_df[[
        'parcel_id', 'size_sqm', 'land_use', 'zoning',
        'state', 'city', 'centroid_lat', 'centroid_lon'
    ]].copy()
    
    # Encode categorical features
    le_land_use = LabelEncoder()
    le_zoning = LabelEncoder()
    le_region = LabelEncoder()
    
    features['land_use_encoded'] = le_land_use.fit_transform(features['land_use'].fillna('unknown'))
    features['zoning_encoded'] = le_zoning.fit_transform(features['zoning'].fillna('unknown'))
    features['region_encoded'] = le_region.fit_transform(features['state'].fillna('unknown'))
    
    # Calculate distance to city center (simplified - use actual city centers in production)
    # Assuming Lagos center: 6.5244° N, 3.3792° E
    features['distance_to_city_center_km'] = np.sqrt(
        ((features['centroid_lat'] - 6.5244) * 111) ** 2 +
        ((features['centroid_lon'] - 3.3792) * 111 * np.cos(np.radians(6.5244))) ** 2
    )
    
    # Historical transaction features
    parcel_transactions = transactions_df[
        transactions_df['transaction_type'] == 'sale'
    ].groupby('parcel_id').agg({
        'transaction_date': ['count', 'max'],
        'sale_price': ['mean', 'std']
    }).reset_index()
    
    parcel_transactions.columns = [
        'parcel_id', 'transaction_count_1y', 'last_transaction_date',
        'avg_sale_price_1y', 'std_sale_price_1y'
    ]
    
    # Days since last transaction
    parcel_transactions['days_since_last_transaction'] = (
        datetime.now() - pd.to_datetime(parcel_transactions['last_transaction_date'])
    ).dt.days
    
    # Merge transaction features
    features = features.merge(parcel_transactions, on='parcel_id', how='left')
    features['transaction_count_1y'] = features['transaction_count_1y'].fillna(0)
    features['days_since_last_transaction'] = features['days_since_last_transaction'].fillna(9999)
    
    # Regional market features
    regional_stats = transactions_df.merge(
        parcels_df[['parcel_id', 'state', 'size_sqm']], on='parcel_id'
    ).groupby('state').agg({
        'sale_price': 'mean',
        'transaction_id': 'count'
    }).reset_index()
    
    regional_stats.columns = ['state', 'regional_avg_price', 'regional_transaction_volume_1m']
    regional_stats['regional_avg_price_sqm'] = regional_stats['regional_avg_price'] / parcels_df.groupby('state')['size_sqm'].mean().values
    
    features = features.merge(regional_stats[['state', 'regional_avg_price_sqm', 'regional_transaction_volume_1m']], on='state', how='left')
    
    # Target variable (most recent sale price)
    latest_prices = transactions_df.sort_values('transaction_date').groupby('parcel_id').last()[['sale_price']]
    features = features.merge(latest_prices, left_on='parcel_id', right_index=True, how='left')
    features.rename(columns={'sale_price': 'target_price'}, inplace=True)
    
    # Add feature timestamp
    features['feature_time'] = datetime.now()
    
    # Select final feature columns
    feature_columns = [
        'feature_time', 'parcel_id', 'size_sqm', 'land_use_encoded', 'zoning_encoded',
        'region_encoded', 'distance_to_city_center_km', 'days_since_last_transaction',
        'transaction_count_1y', 'avg_sale_price_1y', 'regional_avg_price_sqm',
        'regional_transaction_volume_1m', 'target_price'
    ]
    
    return features[feature_columns]


def write_features_to_iceberg(features_df, catalog):
    """Write features to Iceberg ML feature store."""
    table = catalog.load_table("ml_features.property_features")
    table.append(features_df)
    print(f"✅ Wrote {len(features_df)} feature rows to ml_features.property_features")


if __name__ == "__main__":
    from catalog.iceberg_catalog import get_catalog_manager
    
    manager = get_catalog_manager()
    catalog = manager.get_catalog()
    
    # Extract features
    print("Extracting property valuation features...")
    features = extract_property_features(catalog)
    
    # Write to feature store
    write_features_to_iceberg(features, catalog)
    
    print(f"\nFeature summary:")
    print(features.describe())
```

### Fraud Detection Features

Create `ml/fraud_detection_features.py`:

```python
"""
Fraud Detection ML Feature Engineering

Generates features for transaction fraud detection models.
"""

import pandas as pd
from datetime import datetime, timedelta

def extract_fraud_features(catalog, lookback_hours=24):
    """
    Extract features for fraud detection.
    
    Features include:
    - Transaction velocity (count per user per hour)
    - Amount anomalies (deviation from user's historical average)
    - Time-based patterns (unusual transaction times)
    - Cross-system consistency (payment-blockchain-ledger alignment)
    """
    
    # Load recent payment events
    payment_events = catalog.load_table("events.payment_events")
    payments_df = payment_events.scan(
        row_filter=f"event_time >= '{datetime.now() - timedelta(hours=lookback_hours)}'"
    ).to_pandas()
    
    # Transaction velocity
    velocity = payments_df.groupby(['payer_id', pd.Grouper(key='event_time', freq='1H')]).agg({
        'payment_id': 'count',
        'amount': 'sum'
    }).reset_index()
    velocity.columns = ['payer_id', 'hour', 'tx_count_1h', 'tx_amount_1h']
    
    # Amount anomalies
    user_stats = payments_df.groupby('payer_id')['amount'].agg(['mean', 'std']).reset_index()
    payments_with_stats = payments_df.merge(user_stats, on='payer_id')
    payments_with_stats['amount_z_score'] = (
        (payments_with_stats['amount'] - payments_with_stats['mean']) / payments_with_stats['std']
    )
    
    # Time-based features
    payments_df['hour_of_day'] = pd.to_datetime(payments_df['event_time']).dt.hour
    payments_df['is_night_transaction'] = payments_df['hour_of_day'].between(0, 5).astype(int)
    
    # Cross-system reconciliation check
    reconciliation = catalog.load_table("events.reconciliation_events")
    recon_df = reconciliation.scan(
        row_filter=f"event_time >= '{datetime.now() - timedelta(hours=lookback_hours)}'"
    ).to_pandas()
    
    payments_with_recon = payments_df.merge(
        recon_df[['payment_id', 'reconciled', 'discrepancies']],
        on='payment_id',
        how='left'
    )
    payments_with_recon['has_discrepancy'] = (~payments_with_recon['reconciled']).astype(int)
    
    return payments_with_recon


if __name__ == "__main__":
    from catalog.iceberg_catalog import get_catalog_manager
    
    manager = get_catalog_manager()
    catalog = manager.get_catalog()
    
    print("Extracting fraud detection features...")
    features = extract_fraud_features(catalog)
    
    print(f"\nHigh-risk transactions (z-score > 3):")
    print(features[features['amount_z_score'] > 3][['payment_id', 'payer_id', 'amount', 'amount_z_score']])
```

---

## Monitoring and Operations

### Prometheus Metrics

Expose Iceberg table metrics:

```python
# monitoring/iceberg_metrics.py
from prometheus_client import Gauge, start_http_server
from catalog.iceberg_catalog import get_catalog_manager
import time

# Define metrics
table_row_count = Gauge('iceberg_table_row_count', 'Number of rows in table', ['namespace', 'table'])
table_size_bytes = Gauge('iceberg_table_size_bytes', 'Table size in bytes', ['namespace', 'table'])
table_file_count = Gauge('iceberg_table_file_count', 'Number of data files', ['namespace', 'table'])

def collect_metrics():
    """Collect metrics from all Iceberg tables."""
    manager = get_catalog_manager()
    
    for namespace in ['events', 'snapshots', 'analytics', 'ml_features']:
        for table_name in manager.list_tables(namespace):
            table = manager.get_table(namespace, table_name)
            snapshot = table.current_snapshot()
            
            if snapshot:
                # Row count (approximate from manifest)
                row_count = sum(f.record_count for f in snapshot.manifests)
                table_row_count.labels(namespace=namespace, table=table_name).set(row_count)
                
                # Table size
                table_size = sum(f.file_size_in_bytes for f in snapshot.manifests)
                table_size_bytes.labels(namespace=namespace, table=table_name).set(table_size)
                
                # File count
                file_count = len(snapshot.manifests)
                table_file_count.labels(namespace=namespace, table=table_name).set(file_count)

if __name__ == "__main__":
    start_http_server(8000)
    print("Prometheus metrics server started on port 8000")
    
    while True:
        collect_metrics()
        time.sleep(60)  # Collect every minute
```

### Grafana Dashboard

Import the following dashboard JSON for Iceberg lakehouse monitoring:

```json
{
  "dashboard": {
    "title": "IDLR-PTS Lakehouse Monitoring",
    "panels": [
      {
        "title": "Event Ingestion Rate",
        "targets": [
          {
            "expr": "rate(iceberg_table_row_count{namespace=\"events\"}[5m])"
          }
        ]
      },
      {
        "title": "Table Size Growth",
        "targets": [
          {
            "expr": "iceberg_table_size_bytes"
          }
        ]
      },
      {
        "title": "Kafka Connect Lag",
        "targets": [
          {
            "expr": "kafka_connect_sink_record_lag_max"
          }
        ]
      }
    ]
  }
}
```

---

## Security Configuration

### Access Control

Configure Apache Ranger for table-level access control:

```xml
<!-- ranger-iceberg-security.xml -->
<ranger-policy>
  <name>analytics-read-only</name>
  <resources>
    <database>analytics</database>
    <table>*</table>
  </resources>
  <accesses>
    <access>
      <type>select</type>
      <isAllowed>true</isAllowed>
    </access>
  </accesses>
  <users>
    <user>analyst_team</user>
  </users>
</ranger-policy>
```

### Encryption

Enable encryption at rest for S3/MinIO:

```bash
# MinIO server-side encryption
mc encrypt set sse-s3 myminio/idlr-lakehouse
```

Enable TLS for PostgreSQL catalog:

```ini
# postgresql.conf
ssl = on
ssl_cert_file = '/etc/ssl/certs/server.crt'
ssl_key_file = '/etc/ssl/private/server.key'
```

---

## Performance Optimization

### Table Maintenance

Schedule regular table maintenance jobs:

```python
# maintenance/optimize_tables.py
from catalog.iceberg_catalog import get_catalog_manager

def optimize_table(namespace, table_name):
    """Run table optimization (compaction and expiration)."""
    manager = get_catalog_manager()
    table = manager.get_table(namespace, table_name)
    
    # Compact small files
    table.rewrite_data_files(
        target_file_size_bytes=512 * 1024 * 1024,  # 512 MB
        min_file_size_bytes=100 * 1024 * 1024      # 100 MB
    )
    
    # Expire old snapshots (keep last 7 days)
    table.expire_snapshots(
        older_than=datetime.now() - timedelta(days=7),
        retain_last=10
    )
    
    print(f"✅ Optimized {namespace}.{table_name}")

# Run weekly
for namespace in ['events', 'snapshots']:
    for table in manager.list_tables(namespace):
        optimize_table(namespace, table)
```

### Query Optimization

Use partition pruning and column projection:

```sql
-- Bad: Full table scan
SELECT * FROM events.payment_events;

-- Good: Partition pruning + column projection
SELECT payment_id, amount, status
FROM events.payment_events
WHERE event_time >= CURRENT_DATE - INTERVAL '1' DAY
  AND event_type = 'completed';
```

---

## Troubleshooting

### Common Issues

**Issue: Kafka Connect sink connector fails with S3 access denied**

Solution:
```bash
# Verify S3 credentials
aws s3 ls s3://idlr-lakehouse/ --endpoint-url http://localhost:9000

# Check connector logs
docker logs kafka-connect | grep ERROR
```

**Issue: PyIceberg cannot connect to catalog**

Solution:
```python
# Test catalog connection
from pyiceberg.catalog import load_catalog

catalog = load_catalog(
    "test",
    type="sql",
    uri="postgresql://iceberg:password@localhost:5433/iceberg_catalog"
)

# List namespaces
print(catalog.list_namespaces())
```

**Issue: Slow query performance**

Solution:
- Check partition pruning: `EXPLAIN SELECT ... FROM events.payment_events WHERE event_time >= ...`
- Verify table statistics are up to date
- Consider adding secondary indexes or materialized views

---

## Conclusion

The Apache Iceberg lakehouse provides a scalable, ACID-compliant data platform for the IDLR-PTS system. With real-time event ingestion via Kafka Connect, CDC from PostgreSQL, and integrated analytics/ML capabilities, the lakehouse enables comprehensive insights into property transactions, payment flows, and system health.

**Next Steps:**

1. Deploy infrastructure using Docker Compose or Kubernetes
2. Initialize Iceberg catalog and create tables
3. Configure Kafka Connect sink connectors
4. Set up CDC pipelines for operational databases
5. Deploy analytics queries and ML feature pipelines
6. Configure monitoring and alerting
7. Implement security policies and access controls

For additional support, refer to the official documentation:
- [Apache Iceberg](https://iceberg.apache.org/)
- [PyIceberg](https://py.iceberg.apache.org/)
- [Kafka Connect](https://docs.confluent.io/platform/current/connect/)
- [Debezium](https://debezium.io/)

---

**Document Version:** 1.0  
**Last Updated:** February 24, 2026  
**Maintained By:** Manus AI
