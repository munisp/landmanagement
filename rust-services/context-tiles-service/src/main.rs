use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{DateTime, Duration, Utc};
use hmac::{Hmac, Mac};
use postgres::{Client, NoTls};
use serde::Deserialize;
use serde_json::{json, Map, Value};
use sha2::Sha256;
use std::collections::{BTreeSet, HashMap};
use std::env;
use std::io::{BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration as StdDuration, SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;
const SERVICE_NAME: &str = "context-tiles-service";
const MAX_WINDOW_DAYS: i64 = 30;
const MAX_FEATURES: i64 = 2_000;

#[derive(Clone)]
struct Config { port: u16, database_url: String, secret: Vec<u8> }
#[derive(Default)]
struct Metrics { requests: AtomicU64, denied: AtomicU64, errors: AtomicU64, features: AtomicU64 }

#[derive(Deserialize)]
struct Capability { v: u32, aud: String, sub: i64, layers: Vec<String>, purpose: String, iat: i64, exp: i64, jti: String }
struct Request { method: String, path: String, query: HashMap<String, String>, authorization: Option<String>, request_id: String }

fn main() {
    let config = match load_config() { Ok(value) => Arc::new(value), Err(error) => { eprintln!("{SERVICE_NAME} configuration error: {error}"); std::process::exit(1); } };
    let metrics = Arc::new(Metrics::default());
    let listener = TcpListener::bind(("0.0.0.0", config.port)).expect("context tiles listener must bind");
    println!("{SERVICE_NAME} listening on {}", config.port);
    for incoming in listener.incoming() { match incoming { Ok(stream) => { let config = Arc::clone(&config); let metrics = Arc::clone(&metrics); thread::spawn(move || handle(stream, config, metrics)); }, Err(error) => eprintln!("{SERVICE_NAME} accept error: {error}"), } }
}

fn load_config() -> Result<Config, String> {
    let secret = required("CONTEXT_CAPABILITY_SECRET")?;
    if secret.len() < 32 { return Err("CONTEXT_CAPABILITY_SECRET must contain at least 32 characters".to_string()); }
    let database_url = env::var("CONTEXT_DATABASE_URL").ok().filter(|value| !value.trim().is_empty()).or_else(|| env::var("DATABASE_URL").ok().filter(|value| !value.trim().is_empty())).ok_or_else(|| "CONTEXT_DATABASE_URL or DATABASE_URL must be configured".to_string())?;
    let port = env::var("PORT").ok().and_then(|value| value.parse().ok()).unwrap_or(8092);
    Ok(Config { port, database_url, secret: secret.into_bytes() })
}
fn required(key: &str) -> Result<String, String> { env::var(key).map(|v| v.trim().to_string()).ok().filter(|v| !v.is_empty()).ok_or_else(|| format!("{key} must be configured")) }

fn handle(mut stream: TcpStream, config: Arc<Config>, metrics: Arc<Metrics>) {
    let _ = stream.set_read_timeout(Some(StdDuration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(StdDuration::from_secs(30)));
    let request = match parse_request(&stream) { Ok(value) => value, Err(_) => { metrics.denied.fetch_add(1, Ordering::Relaxed); let _ = send_json(&mut stream, 400, "Bad Request", json!({"error":"invalid request"}), "invalid-request"); return; } };
    metrics.requests.fetch_add(1, Ordering::Relaxed);
    let response = match request.path.as_str() {
        "/health" => send_json(&mut stream, 200, "OK", json!({"status":"healthy","service":SERVICE_NAME}), &request.request_id),
        "/ready" => match Client::connect(&config.database_url, NoTls).and_then(|mut client| client.simple_query("SELECT 1")) { Ok(_) => send_json(&mut stream, 200, "OK", json!({"status":"ready","service":SERVICE_NAME}), &request.request_id), Err(_) => send_json(&mut stream, 503, "Service Unavailable", json!({"status":"unready","service":SERVICE_NAME}), &request.request_id) },
        "/metrics" => send_metrics(&mut stream, &metrics),
        "/features.geojson" => serve_features(&mut stream, &request, &config, &metrics, "context_tiles"),
        "/summary" => serve_summary(&mut stream, &request, &config, &metrics),
        _ => send_json(&mut stream, 404, "Not Found", json!({"error":"not found"}), &request.request_id),
    };
    if let Err(error) = response { metrics.errors.fetch_add(1, Ordering::Relaxed); eprintln!("{SERVICE_NAME} request failed request_id={} error={}", request.request_id, error); }
}

fn parse_request(stream: &TcpStream) -> Result<Request, String> {
    let mut reader = BufReader::new(stream);
    let mut first = String::new(); reader.read_line(&mut first).map_err(|_| "request unavailable")?;
    if first.len() > 8192 { return Err("request too long".to_string()); }
    let parts: Vec<&str> = first.split_whitespace().collect(); if parts.len() != 3 { return Err("invalid request line".to_string()); }
    let (path, query) = split_target(parts[1])?;
    let mut authorization = None; let mut request_id = None;
    for _ in 0..100 { let mut line = String::new(); reader.read_line(&mut line).map_err(|_| "headers unavailable")?; if line.len() > 8192 { return Err("header too long".to_string()); } let line = line.trim_end(); if line.is_empty() { break; } let (key, value) = line.split_once(':').ok_or_else(|| "bad header".to_string())?; match key.trim().to_ascii_lowercase().as_str() { "authorization" => authorization = Some(value.trim().to_string()), "x-request-id" => request_id = Some(value.trim().to_string()), _ => {} } }
    Ok(Request { method: parts[0].to_string(), path, query, authorization, request_id: request_id.filter(|v| valid_request_id(v)).unwrap_or_else(new_request_id) })
}
fn split_target(target: &str) -> Result<(String, HashMap<String, String>), String> { let (path, raw) = target.split_once('?').unwrap_or((target, "")); if !path.starts_with('/') { return Err("bad path".to_string()); } let mut query = HashMap::new(); for pair in raw.split('&').filter(|v| !v.is_empty()) { let (key, value) = pair.split_once('=').ok_or_else(|| "bad query".to_string())?; if !matches!(key, "layers" | "start" | "end") { return Err("unsupported query".to_string()); } query.insert(key.to_string(), percent_decode(value)?); } Ok((path.to_string(), query)) }
fn percent_decode(raw: &str) -> Result<String, String> { let mut result = String::new(); let bytes = raw.as_bytes(); let mut i = 0; while i < bytes.len() { if bytes[i] == b'%' { if i + 2 >= bytes.len() { return Err("bad percent encoding".to_string()); } let hex = std::str::from_utf8(&bytes[i+1..i+3]).map_err(|_| "bad encoding")?; let value = u8::from_str_radix(hex, 16).map_err(|_| "bad encoding")?; result.push(value as char); i += 3; } else { result.push(bytes[i] as char); i += 1; } } Ok(result) }

fn serve_features(stream: &mut TcpStream, request: &Request, config: &Config, metrics: &Metrics, audience: &str) -> Result<(), String> {
    if request.method != "GET" { return send_json(stream, 405, "Method Not Allowed", json!({"error":"method not allowed"}), &request.request_id); }
    let capability = match verify_capability(request.authorization.as_deref(), &config.secret, audience) { Ok(value) => value, Err(_) => { metrics.denied.fetch_add(1, Ordering::Relaxed); return send_json(stream, 401, "Unauthorized", json!({"error":"authorization denied"}), &request.request_id); } };
    let layers = request_layers(request.query.get("layers"), &capability.layers)?; let (start, end) = request_window(&request.query)?;
    let mut client = Client::connect(&config.database_url, NoTls).map_err(|_| "database unavailable".to_string())?;
    let rows = client.query("SELECT e.id, l.layer_key, e.source_event_key, e.source_url, e.source_observed_at, e.source_updated_at, e.expires_at, e.severity, e.urgency, e.geometry, e.bbox, e.properties, e.quality_state, l.attribution, l.source_name FROM context_events e JOIN context_layers l ON l.id=e.layer_id WHERE e.event_status='active' AND l.enabled=true AND l.layer_key=ANY($1) AND e.source_observed_at >= $2 AND e.source_observed_at <= $3 ORDER BY e.source_observed_at DESC LIMIT $4", &[&layers, &start, &end, &MAX_FEATURES]).map_err(|_| "context query failed".to_string())?;
    let mut features = Vec::with_capacity(rows.len());
    for row in rows { let geometry: Value = row.get(9); if !valid_geometry(&geometry) { continue; } let mut properties = row.get::<usize, Value>(11).as_object().cloned().unwrap_or_else(Map::new); properties.insert("layerKey".to_string(), json!(row.get::<usize, String>(1))); properties.insert("sourceEventKey".to_string(), json!(row.get::<usize, String>(2))); properties.insert("sourceUrl".to_string(), json!(row.get::<usize, Option<String>>(3))); properties.insert("sourceObservedAt".to_string(), json!(row.get::<usize, DateTime<Utc>>(4).to_rfc3339())); properties.insert("sourceUpdatedAt".to_string(), json!(row.get::<usize, Option<DateTime<Utc>>>(5).map(|v| v.to_rfc3339()))); properties.insert("expiresAt".to_string(), json!(row.get::<usize, Option<DateTime<Utc>>>(6).map(|v| v.to_rfc3339()))); properties.insert("severity".to_string(), json!(row.get::<usize, Option<String>>(7))); properties.insert("urgency".to_string(), json!(row.get::<usize, Option<String>>(8))); properties.insert("qualityState".to_string(), json!(row.get::<usize, String>(12))); properties.insert("attribution".to_string(), json!(row.get::<usize, String>(13))); properties.insert("sourceName".to_string(), json!(row.get::<usize, String>(14))); features.push(json!({"type":"Feature","id":format!("{}:{}", row.get::<usize, String>(1), row.get::<usize, String>(2)),"geometry":geometry,"bbox":row.get::<usize, Option<Value>>(10),"properties":properties})); }
    metrics.features.fetch_add(features.len() as u64, Ordering::Relaxed);
    send_json(stream, 200, "OK", json!({"type":"FeatureCollection","features":features,"metadata":{"source":"IDLR Context Globe","layers":layers,"windowStart":start.to_rfc3339(),"windowEnd":end.to_rfc3339(),"subject":capability.sub}}), &request.request_id)
}

fn serve_summary(stream: &mut TcpStream, request: &Request, config: &Config, metrics: &Metrics) -> Result<(), String> {
    if request.method != "GET" { return send_json(stream, 405, "Method Not Allowed", json!({"error":"method not allowed"}), &request.request_id); }
    let capability = match verify_capability(request.authorization.as_deref(), &config.secret, "context_mobile") { Ok(value) => value, Err(_) => { metrics.denied.fetch_add(1, Ordering::Relaxed); return send_json(stream, 401, "Unauthorized", json!({"error":"authorization denied"}), &request.request_id); } };
    let layers = request_layers(request.query.get("layers"), &capability.layers)?; let (start, end) = request_window(&request.query)?;
    let mut client = Client::connect(&config.database_url, NoTls).map_err(|_| "database unavailable".to_string())?;
    let rows = client.query("SELECT l.layer_key, count(*) FROM context_events e JOIN context_layers l ON l.id=e.layer_id WHERE e.event_status='active' AND l.enabled=true AND l.layer_key=ANY($1) AND e.source_observed_at >= $2 AND e.source_observed_at <= $3 GROUP BY l.layer_key ORDER BY l.layer_key", &[&layers, &start, &end]).map_err(|_| "context summary query failed".to_string())?;
    let counts: Vec<Value> = rows.into_iter().map(|row| json!({"layerKey":row.get::<usize, String>(0),"activeEvents":row.get::<usize, i64>(1)})).collect();
    metrics.features.fetch_add(counts.len() as u64, Ordering::Relaxed);
    send_json(stream, 200, "OK", json!({"subject":capability.sub,"windowStart":start.to_rfc3339(),"windowEnd":end.to_rfc3339(),"layers":counts,"offlinePolicy":"Context events remain online-only; no public-event package is retained by this client."}), &request.request_id)
}

fn verify_capability(header: Option<&str>, secret: &[u8], audience: &str) -> Result<Capability, String> { let token = header.and_then(|value| value.strip_prefix("Bearer ")).ok_or_else(|| "missing bearer".to_string())?; let parts: Vec<&str> = token.split('.').collect(); if parts.len() != 2 { return Err("bad token".to_string()); } let payload_bytes = decode_canonical(parts[0])?; let supplied = decode_canonical(parts[1])?; let mut mac = HmacSha256::new_from_slice(secret).map_err(|_| "hmac unavailable")?; mac.update(parts[0].as_bytes()); mac.verify_slice(&supplied).map_err(|_| "signature invalid")?; let mut cap: Capability = serde_json::from_slice(&payload_bytes).map_err(|_| "payload invalid")?; if cap.v != 1 || cap.aud != audience || cap.sub < 1 || cap.exp <= cap.iat || cap.exp <= now_secs() || cap.iat > now_secs() + 60 || cap.purpose.trim().len() < 3 || cap.purpose.len() > 128 || cap.jti.trim().is_empty() { return Err("claims invalid".to_string()); } cap.layers = canonical_layers(cap.layers)?; Ok(cap) }
fn decode_canonical(raw: &str) -> Result<Vec<u8>, String> { let decoded = URL_SAFE_NO_PAD.decode(raw).map_err(|_| "base64 invalid")?; if URL_SAFE_NO_PAD.encode(&decoded) != raw { return Err("base64 noncanonical".to_string()); } Ok(decoded) }
fn canonical_layers(input: Vec<String>) -> Result<Vec<String>, String> { let mut layers = BTreeSet::new(); for value in input { let value = value.trim().to_ascii_lowercase(); if value.len() < 2 || value.len() > 64 || !value.bytes().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == b'-') { return Err("invalid layer".to_string()); } layers.insert(value); } if layers.is_empty() || layers.len() > 8 { return Err("invalid layer scope".to_string()); } Ok(layers.into_iter().collect()) }
fn request_layers(raw: Option<&String>, allowed: &[String]) -> Result<Vec<String>, String> { let requested = match raw { Some(value) if !value.trim().is_empty() => canonical_layers(value.split(',').map(|v| v.to_string()).collect())?, _ => allowed.to_vec() }; if requested.iter().any(|layer| !allowed.contains(layer)) { return Err("out of scope layer".to_string()); } Ok(requested) }
fn request_window(query: &HashMap<String, String>) -> Result<(DateTime<Utc>, DateTime<Utc>), String> { let now = Utc::now(); let start = query.get("start").map(|v| DateTime::parse_from_rfc3339(v).map(|v| v.with_timezone(&Utc)).map_err(|_| "invalid start".to_string())).transpose()?.unwrap_or(now - Duration::hours(24)); let end = query.get("end").map(|v| DateTime::parse_from_rfc3339(v).map(|v| v.with_timezone(&Utc)).map_err(|_| "invalid end".to_string())).transpose()?.unwrap_or(now); if start > end || end - start > Duration::days(MAX_WINDOW_DAYS) || end > now + Duration::minutes(5) { return Err("invalid time window".to_string()); } Ok((start, end)) }
fn valid_geometry(value: &Value) -> bool { value.as_object().and_then(|object| object.get("type")).and_then(Value::as_str).map(|kind| matches!(kind, "Point" | "LineString" | "Polygon" | "MultiPoint" | "MultiLineString" | "MultiPolygon")).unwrap_or(false) }
fn send_json(stream: &mut TcpStream, status: u16, text: &str, value: Value, request_id: &str) -> Result<(), String> { let body = serde_json::to_vec(&value).map_err(|_| "json encode".to_string())?; write!(stream, "HTTP/1.1 {status} {text}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nCache-Control: private, max-age=30, must-revalidate\r\nX-Request-Id: {request_id}\r\nConnection: close\r\n\r\n", body.len()).map_err(|_| "response write".to_string())?; stream.write_all(&body).map_err(|_| "response body".to_string())?; Ok(()) }
fn send_metrics(stream: &mut TcpStream, metrics: &Metrics) -> Result<(), String> { let body = format!("context_tiles_requests_total {}\ncontext_tiles_denied_total {}\ncontext_tiles_errors_total {}\ncontext_tiles_features_total {}\n", metrics.requests.load(Ordering::Relaxed), metrics.denied.load(Ordering::Relaxed), metrics.errors.load(Ordering::Relaxed), metrics.features.load(Ordering::Relaxed)); write!(stream, "HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body).map_err(|_| "metrics write".to_string())?; Ok(()) }
fn now_secs() -> i64 { SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64 }
fn valid_request_id(value: &str) -> bool { value.len() >= 8 && value.len() <= 128 && value.bytes().all(|c| c.is_ascii_alphanumeric() || matches!(c, b'_' | b'.' | b':' | b'-')) }
fn new_request_id() -> String { format!("context-{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos()) }


#[cfg(test)]
mod tests {
    use super::*;

    fn token(secret: &[u8], audience: &str, layers: Vec<&str>) -> String {
        let now = now_secs();
        let payload = json!({"v":1,"aud":audience,"sub":7,"layers":layers,"purpose":"context-globe.test","iat":now-1,"exp":now+60,"jti":"test-context"});
        let encoded = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        let mut mac = HmacSha256::new_from_slice(secret).unwrap();
        mac.update(encoded.as_bytes());
        format!("{}.{}", encoded, URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
    }

    #[test]
    fn verifies_scoped_context_capability() {
        let secret = b"01234567890123456789012345678901";
        let raw = token(secret, "context_tiles", vec!["weather-alerts", "seismic"]);
        let capability = verify_capability(Some(&format!("Bearer {raw}")), secret, "context_tiles").unwrap();
        assert_eq!(capability.sub, 7);
        assert_eq!(capability.layers, vec!["seismic", "weather-alerts"]);
        assert!(verify_capability(Some(&format!("Bearer {raw}")), secret, "context_mobile").is_err());
    }

    #[test]
    fn rejects_noncanonical_and_out_of_scope_requests() {
        let secret = b"01234567890123456789012345678901";
        let raw = token(secret, "context_tiles", vec!["seismic"]);
        assert!(verify_capability(Some(&format!("Bearer {raw}A")), secret, "context_tiles").is_err());
        assert!(request_layers(Some(&"weather-alerts".to_string()), &["seismic".to_string()]).is_err());
    }

    #[test]
    fn validates_geometry_and_windows() {
        assert!(valid_geometry(&json!({"type":"Point","coordinates":[0,0]})));
        assert!(!valid_geometry(&json!({"type":"GeometryCollection","geometries":[]})));
        let mut bad = HashMap::new();
        bad.insert("start".to_string(), "2026-01-01T00:00:00Z".to_string());
        bad.insert("end".to_string(), "2026-03-15T00:00:00Z".to_string());
        assert!(request_window(&bad).is_err());
    }
}
