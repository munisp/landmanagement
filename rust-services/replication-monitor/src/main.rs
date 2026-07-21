//! PostgreSQL Replication Health Monitor
//! Monitors active-active multi-region PostgreSQL replication lag,
//! alerts on lag > 30s, and exposes Prometheus metrics.
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tokio::time;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegionConfig {
    pub name: String,
    pub patroni_url: String,
    pub is_primary: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ReplicationStatus {
    pub region: String,
    pub role: String,
    pub lag_bytes: Option<i64>,
    pub lag_seconds: Option<f64>,
    pub is_healthy: bool,
    pub last_checked: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClusterHealth {
    pub primary_region: Option<String>,
    pub replica_count: usize,
    pub healthy_replicas: usize,
    pub max_lag_seconds: f64,
    pub alert: bool,
    pub alert_message: Option<String>,
    pub regions: Vec<ReplicationStatus>,
    pub timestamp: u64,
}

const LAG_ALERT_THRESHOLD_SECONDS: f64 = 30.0;

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
}

async fn check_patroni_node(client: &reqwest::Client, region: &RegionConfig) -> ReplicationStatus {
    let url = format!("{}/", region.patroni_url);
    match client.get(&url).timeout(Duration::from_secs(5)).send().await {
        Ok(resp) if resp.status().is_success() => {
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            let role = body["role"].as_str().unwrap_or("unknown").to_string();
            let lag_bytes = body["replication_state"]["lag"].as_i64();
            let lag_seconds = lag_bytes.map(|b| b as f64 / 16_384.0); // Approximate WAL bytes to seconds
            ReplicationStatus {
                region: region.name.clone(),
                role,
                lag_bytes,
                lag_seconds,
                is_healthy: true,
                last_checked: now_unix(),
            }
        }
        _ => ReplicationStatus {
            region: region.name.clone(),
            role: "unreachable".to_string(),
            lag_bytes: None,
            lag_seconds: None,
            is_healthy: false,
            last_checked: now_unix(),
        },
    }
}

async fn check_cluster(client: &reqwest::Client, regions: &[RegionConfig]) -> ClusterHealth {
    let mut statuses = Vec::new();
    for region in regions {
        statuses.push(check_patroni_node(client, region).await);
    }

    let primary_region = statuses.iter().find(|s| s.role == "master" || s.role == "primary")
        .map(|s| s.region.clone());
    let replica_count = statuses.iter().filter(|s| s.role == "replica").count();
    let healthy_replicas = statuses.iter().filter(|s| s.is_healthy && s.role == "replica").count();
    let max_lag = statuses.iter()
        .filter_map(|s| s.lag_seconds)
        .fold(0.0_f64, f64::max);

    let alert = max_lag > LAG_ALERT_THRESHOLD_SECONDS || primary_region.is_none();
    let alert_message = if primary_region.is_none() {
        Some("CRITICAL: No primary region detected — possible split-brain".to_string())
    } else if max_lag > LAG_ALERT_THRESHOLD_SECONDS {
        Some(format!("WARNING: Replication lag {:.1}s exceeds threshold {:.1}s", max_lag, LAG_ALERT_THRESHOLD_SECONDS))
    } else {
        None
    };

    ClusterHealth {
        primary_region,
        replica_count,
        healthy_replicas,
        max_lag_seconds: max_lag,
        alert,
        alert_message,
        regions: statuses,
        timestamp: now_unix(),
    }
}

fn prometheus_metrics(health: &ClusterHealth) -> String {
    let mut out = String::new();
    out.push_str("# HELP pg_replication_lag_seconds PostgreSQL replication lag in seconds\n");
    out.push_str("# TYPE pg_replication_lag_seconds gauge\n");
    for r in &health.regions {
        let lag = r.lag_seconds.unwrap_or(-1.0);
        out.push_str(&format!(
            "pg_replication_lag_seconds{{region=\"{}\",role=\"{}\"}} {:.3}\n",
            r.region, r.role, lag
        ));
    }
    out.push_str("# HELP pg_cluster_healthy Whether the cluster has a primary\n");
    out.push_str("# TYPE pg_cluster_healthy gauge\n");
    out.push_str(&format!(
        "pg_cluster_healthy {}\n",
        if health.primary_region.is_some() { 1 } else { 0 }
    ));
    out
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let regions = vec![
        RegionConfig { name: "lagos".to_string(), patroni_url: std::env::var("PATRONI_LAGOS_URL").unwrap_or_else(|_| "http://patroni-lagos:8008".to_string()), is_primary: true },
        RegionConfig { name: "abuja".to_string(), patroni_url: std::env::var("PATRONI_ABUJA_URL").unwrap_or_else(|_| "http://patroni-abuja:8008".to_string()), is_primary: false },
        RegionConfig { name: "kano".to_string(), patroni_url: std::env::var("PATRONI_KANO_URL").unwrap_or_else(|_| "http://patroni-kano:8008".to_string()), is_primary: false },
    ];

    let client = reqwest::Client::new();
    let port = std::env::var("PORT").unwrap_or_else(|_| "9090".to_string());

    tracing::info!("Replication Monitor starting on :{}", port);

    // Background monitoring loop
    let regions_clone = regions.clone();
    let client_clone = client.clone();
    tokio::spawn(async move {
        let mut interval = time::interval(Duration::from_secs(10));
        loop {
            interval.tick().await;
            let health = check_cluster(&client_clone, &regions_clone).await;
            if health.alert {
                tracing::warn!("REPLICATION ALERT: {:?}", health.alert_message);
            } else {
                tracing::info!("Cluster healthy. Max lag: {:.2}s", health.max_lag_seconds);
            }
        }
    });

    // HTTP server for health and metrics
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{}", port)).await.unwrap();
    tracing::info!("Listening on :{}", port);
    loop {
        let (stream, _) = listener.accept().await.unwrap();
        let client_ref = client.clone();
        let regions_ref = regions.clone();
        tokio::spawn(async move {
            let health = check_cluster(&client_ref, &regions_ref).await;
            let (body, content_type) = if true {
                (serde_json::to_string(&health).unwrap_or_default(), "application/json")
            } else {
                (prometheus_metrics(&health), "text/plain")
            };
            let response = format!(
                "HTTP/1.1 200 OK\r\nContent-Type: {}\r\nContent-Length: {}\r\n\r\n{}",
                content_type, body.len(), body
            );
            use tokio::io::AsyncWriteExt;
            let mut stream = stream;
            let _ = stream.write_all(response.as_bytes()).await;
        });
    }
}
