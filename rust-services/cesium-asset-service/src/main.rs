use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use hmac::{Hmac, Mac};
use postgres::{Client, NoTls};
use serde::Deserialize;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::env;
use std::fmt::Write as FmtWrite;
use std::fs::{self, File};
use std::io::{self, BufRead, BufReader, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

type HmacSha256 = Hmac<Sha256>;

const SERVICE_NAME: &str = "cesium-asset-service";
const CAPABILITY_ISSUER: &str = "idlr-geospatial-platform";
const CAPABILITY_VERSION: u32 = 1;
const MAX_CAPABILITY_TTL: i64 = 600;
const MAX_MANIFEST_BYTES: u64 = 16 * 1024 * 1024;

#[derive(Clone)]
struct Config {
    port: u16,
    database_url: String,
    capability_secret: Vec<u8>,
    asset_root: PathBuf,
}

#[derive(Default)]
struct Metrics {
    requests: AtomicU64,
    denied: AtomicU64,
    errors: AtomicU64,
    bytes_sent: AtomicU64,
}

#[derive(Deserialize, Debug)]
struct Capability {
    #[serde(rename = "iss")]
    issuer: String,
    #[serde(rename = "ver")]
    version: u32,
    #[serde(rename = "aud")]
    audience: String,
    #[serde(rename = "sub")]
    subject: String,
    #[serde(rename = "jti")]
    id: String,
    #[serde(rename = "iat")]
    issued_at: i64,
    #[serde(rename = "exp")]
    expires_at: i64,
    parcels: Vec<i32>,
    purpose: String,
    #[serde(rename = "assetKey")]
    asset_key: Option<String>,
}

struct AssetRecord {
    parcel_id: i32,
    content_root_relative: String,
    tileset_relative_path: Option<String>,
    terrain_relative_path: Option<String>,
    manifest_checksum_sha256: String,
    active: bool,
}

struct HttpRequest {
    method: String,
    path: String,
    authorization: Option<String>,
    request_id: String,
}

fn main() {
    let config = match load_config() {
        Ok(value) => Arc::new(value),
        Err(error) => {
            eprintln!("{SERVICE_NAME} configuration error: {error}");
            std::process::exit(1);
        }
    };
    let metrics = Arc::new(Metrics::default());
    let listener = match TcpListener::bind(("0.0.0.0", config.port)) {
        Ok(listener) => listener,
        Err(error) => {
            eprintln!("{SERVICE_NAME} failed to bind: {error}");
            std::process::exit(1);
        }
    };
    println!("{SERVICE_NAME} listening on {}", config.port);
    for incoming in listener.incoming() {
        match incoming {
            Ok(stream) => {
                let config = Arc::clone(&config);
                let metrics = Arc::clone(&metrics);
                thread::spawn(move || handle_connection(stream, config, metrics));
            }
            Err(error) => eprintln!("{SERVICE_NAME} accept error: {error}"),
        }
    }
}

fn load_config() -> Result<Config, String> {
    let secret = required_env("GEO_DELIVERY_CAPABILITY_SECRET")?;
    if secret.len() < 32 {
        return Err("GEO_DELIVERY_CAPABILITY_SECRET must contain at least 32 characters".to_string());
    }
    let database_url = env::var("GEO_CESIUM_DATABASE_URL")
        .ok()
        .filter(|value| !value.trim().is_empty())
        .or_else(|| env::var("DATABASE_URL").ok().filter(|value| !value.trim().is_empty()))
        .ok_or_else(|| "GEO_CESIUM_DATABASE_URL or DATABASE_URL must be configured".to_string())?;
    let raw_root = required_env("GEO_3D_ASSET_ROOT")?;
    let asset_root = fs::canonicalize(&raw_root)
        .map_err(|_| "GEO_3D_ASSET_ROOT must point to an existing readable directory".to_string())?;
    if !asset_root.is_dir() {
        return Err("GEO_3D_ASSET_ROOT must be a directory".to_string());
    }
    let port = env::var("PORT")
        .ok()
        .and_then(|value| value.parse::<u16>().ok())
        .unwrap_or(7022);
    Ok(Config {
        port,
        database_url,
        capability_secret: secret.into_bytes(),
        asset_root,
    })
}

fn required_env(name: &str) -> Result<String, String> {
    env::var(name)
        .map(|value| value.trim().to_string())
        .ok()
        .filter(|value| !value.is_empty())
        .ok_or_else(|| format!("{name} must be configured"))
}

fn handle_connection(mut stream: TcpStream, config: Arc<Config>, metrics: Arc<Metrics>) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(10)));
    let _ = stream.set_write_timeout(Some(Duration::from_secs(30)));
    let request = match parse_request(&stream) {
        Ok(value) => value,
        Err(_) => {
            metrics.denied.fetch_add(1, Ordering::Relaxed);
            let _ = send_json(&mut stream, 400, "Bad Request", "invalid request", "invalid-request");
            return;
        }
    };
    metrics.requests.fetch_add(1, Ordering::Relaxed);
    let result = match request.path.as_str() {
        "/health" => send_json(&mut stream, 200, "OK", "{\"status\":\"healthy\",\"service\":\"cesium-asset-service\"}", &request.request_id),
        "/ready" => match Client::connect(&config.database_url, NoTls).and_then(|mut client| client.simple_query("SELECT 1")) {
            Ok(_) => send_json(&mut stream, 200, "OK", "{\"status\":\"ready\",\"service\":\"cesium-asset-service\"}", &request.request_id),
            Err(_) => send_json(&mut stream, 503, "Service Unavailable", "{\"status\":\"unready\",\"service\":\"cesium-asset-service\"}", &request.request_id),
        },
        "/metrics" => send_metrics(&mut stream, &metrics),
        _ => serve_asset(&mut stream, &request, &config, &metrics),
    };
    if let Err(error) = result {
        metrics.errors.fetch_add(1, Ordering::Relaxed);
        eprintln!("{SERVICE_NAME} request failed request_id={} error={}", request.request_id, error);
    }
}

fn parse_request(stream: &TcpStream) -> Result<HttpRequest, String> {
    let mut reader = BufReader::new(stream);
    let mut first_line = String::new();
    reader.read_line(&mut first_line).map_err(|_| "request line unavailable")?;
    if first_line.len() > 8192 {
        return Err("request line too long".to_string());
    }
    let components: Vec<&str> = first_line.split_whitespace().collect();
    if components.len() != 3 {
        return Err("invalid request line".to_string());
    }
    let method = components[0].to_string();
    let path = components[1].split('?').next().unwrap_or_default().to_string();
    let mut authorization = None;
    let mut request_id = None;
    let mut line_count = 0usize;
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).map_err(|_| "header unavailable")?;
        line_count += 1;
        if line_count > 100 || line.len() > 8192 {
            return Err("headers exceeded limits".to_string());
        }
        let trimmed = line.trim_end();
        if trimmed.is_empty() {
            break;
        }
        let (key, value) = trimmed.split_once(':').ok_or_else(|| "malformed header".to_string())?;
        match key.trim().to_ascii_lowercase().as_str() {
            "authorization" => authorization = Some(value.trim().to_string()),
            "x-request-id" => request_id = Some(value.trim().to_string()),
            _ => {}
        }
    }
    Ok(HttpRequest {
        method,
        path,
        authorization,
        request_id: sanitize_request_id(request_id.as_deref()),
    })
}

fn serve_asset(stream: &mut TcpStream, request: &HttpRequest, config: &Config, metrics: &Metrics) -> Result<(), String> {
    if request.method != "GET" {
        send_json(stream, 405, "Method Not Allowed", "method not allowed", &request.request_id)?;
        return Ok(());
    }
    let (asset_key, relative_path) = parse_asset_path(&request.path)?;
    let capability = match verify_capability(request.authorization.as_deref(), &config.capability_secret) {
        Ok(value) => value,
        Err(_) => {
            metrics.denied.fetch_add(1, Ordering::Relaxed);
            send_json(stream, 401, "Unauthorized", "authorization denied", &request.request_id)?;
            return Ok(());
        }
    };
    if capability.asset_key.as_deref() != Some(asset_key.as_str()) {
        metrics.denied.fetch_add(1, Ordering::Relaxed);
        send_json(stream, 403, "Forbidden", "authorization denied", &request.request_id)?;
        return Ok(());
    }
    let asset = match lookup_asset(&config.database_url, &asset_key) {
        Ok(Some(value)) => value,
        Ok(None) => {
            send_json(stream, 404, "Not Found", "asset not found", &request.request_id)?;
            return Ok(());
        }
        Err(error) => return Err(error),
    };
    if !asset.active || !capability.parcels.contains(&asset.parcel_id) {
        metrics.denied.fetch_add(1, Ordering::Relaxed);
        send_json(stream, 403, "Forbidden", "authorization denied", &request.request_id)?;
        return Ok(());
    }
    let asset_root = safe_asset_path(&config.asset_root, &asset.content_root_relative)?;
    let requested_file = safe_asset_path(&asset_root, &relative_path)?;
    if !requested_file.is_file() {
        send_json(stream, 404, "Not Found", "asset content not found", &request.request_id)?;
        return Ok(());
    }
    let manifest_path = asset
        .tileset_relative_path
        .as_deref()
        .ok_or_else(|| "asset has no registered tileset manifest".to_string())?;
    let manifest_file = safe_asset_path(&asset_root, manifest_path)?;
    let manifest = read_limited(&manifest_file, MAX_MANIFEST_BYTES)?;
    let checksum = hex_digest(&manifest);
    if !constant_time_equals(checksum.as_bytes(), asset.manifest_checksum_sha256.to_ascii_lowercase().as_bytes()) {
        return Err("registered Cesium manifest checksum does not match stored content".to_string());
    }
    let referenced = validate_tileset_manifest(&manifest)?;
    let normalized_request = normalize_relative(&relative_path)?;
    let normalized_manifest = normalize_relative(manifest_path)?;
    let terrain_allowed = asset
        .terrain_relative_path
        .as_deref()
        .map(normalize_relative)
        .transpose()?;
    if normalized_request != normalized_manifest
        && terrain_allowed.as_deref() != Some(normalized_request.as_str())
        && !referenced.contains(&normalized_request)
    {
        metrics.denied.fetch_add(1, Ordering::Relaxed);
        send_json(stream, 404, "Not Found", "asset content not registered by manifest", &request.request_id)?;
        return Ok(());
    }
    stream_file(stream, &requested_file, &request.request_id, metrics)
}

fn lookup_asset(database_url: &str, asset_key: &str) -> Result<Option<AssetRecord>, String> {
    let mut client = Client::connect(database_url, NoTls).map_err(|_| "asset catalog is unavailable".to_string())?;
    let row = client
        .query_opt(
            "SELECT asset_key, parcel_id, content_root_relative, tileset_relative_path, terrain_relative_path, manifest_checksum_sha256, active FROM geo_3d_assets WHERE asset_key = $1 LIMIT 1",
            &[&asset_key],
        )
        .map_err(|_| "asset catalog query failed".to_string())?;
    Ok(row.map(|value| AssetRecord {
        parcel_id: value.get(1),
        content_root_relative: value.get(2),
        tileset_relative_path: value.get(3),
        terrain_relative_path: value.get(4),
        manifest_checksum_sha256: value.get(5),
        active: value.get(6),
    }))
}

fn verify_capability(header: Option<&str>, secret: &[u8]) -> Result<Capability, String> {
    let token = header
        .and_then(|value| value.strip_prefix("Bearer "))
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| "missing bearer capability".to_string())?;
    let mut components = token.split('.');
    let payload_encoded = components.next().ok_or_else(|| "capability payload is missing".to_string())?;
    let signature_encoded = components.next().ok_or_else(|| "capability signature is missing".to_string())?;
    if components.next().is_some() {
        return Err("capability format is invalid".to_string());
    }
    let signature = URL_SAFE_NO_PAD.decode(signature_encoded).map_err(|_| "signature encoding invalid".to_string())?;
    let mut mac = HmacSha256::new_from_slice(secret).map_err(|_| "secret invalid".to_string())?;
    mac.update(payload_encoded.as_bytes());
    let expected = mac.finalize().into_bytes();
    if !constant_time_equals(&signature, &expected) {
        return Err("capability signature invalid".to_string());
    }
    let bytes = URL_SAFE_NO_PAD.decode(payload_encoded).map_err(|_| "payload encoding invalid".to_string())?;
    let capability: Capability = serde_json::from_slice(&bytes).map_err(|_| "payload JSON invalid".to_string())?;
    let now = unix_time();
    if capability.issuer != CAPABILITY_ISSUER
        || capability.version != CAPABILITY_VERSION
        || capability.audience != "cesium_assets"
        || capability.subject.is_empty()
        || !capability.subject.chars().all(|value| value.is_ascii_digit())
        || capability.id.is_empty()
        || capability.purpose.is_empty()
        || capability.asset_key.as_deref().map(is_safe_key) != Some(true)
        || capability.parcels.is_empty()
        || capability.parcels.len() > 512
        || capability.issued_at > now + 60
        || capability.expires_at <= now
        || capability.expires_at - capability.issued_at > MAX_CAPABILITY_TTL
    {
        return Err("capability fields invalid".to_string());
    }
    let mut last = 0_i32;
    for (index, parcel) in capability.parcels.iter().enumerate() {
        if *parcel <= 0 || (index > 0 && *parcel <= last) {
            return Err("capability parcel scope invalid".to_string());
        }
        last = *parcel;
    }
    Ok(capability)
}

fn parse_asset_path(path: &str) -> Result<(String, String), String> {
    let prefix = "/assets/";
    let remainder = path.strip_prefix(prefix).ok_or_else(|| "invalid asset route".to_string())?;
    let mut segments = remainder.split('/');
    let asset_key = segments.next().ok_or_else(|| "asset key missing".to_string())?.to_string();
    if !is_safe_key(&asset_key) {
        return Err("asset key invalid".to_string());
    }
    let content: Vec<&str> = segments.collect();
    if content.is_empty() {
        return Err("asset content path missing".to_string());
    }
    let relative_path = content.join("/");
    let normalized = normalize_relative(&relative_path)?;
    Ok((asset_key, normalized))
}

fn is_safe_key(value: &str) -> bool {
    let length = value.len();
    (2..=128).contains(&length) && value.chars().enumerate().all(|(index, char)| {
        char.is_ascii_alphanumeric() || (index > 0 && matches!(char, '.' | '_' | ':' | '-'))
    })
}

fn normalize_relative(value: &str) -> Result<String, String> {
    if value.is_empty() || value.len() > 1024 || value.contains('\0') || value.starts_with('/') || value.contains('\\') {
        return Err("asset path invalid".to_string());
    }
    let path = Path::new(value);
    let mut segments = Vec::new();
    for component in path.components() {
        match component {
            Component::Normal(segment) => {
                let part = segment.to_string_lossy();
                if part.is_empty() || part.len() > 255 || !part.chars().all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '_' | '-')) {
                    return Err("asset path segment invalid".to_string());
                }
                segments.push(part.to_string());
            }
            _ => return Err("asset path contains traversal".to_string()),
        }
    }
    if segments.is_empty() {
        return Err("asset path empty".to_string());
    }
    Ok(segments.join("/"))
}

fn safe_asset_path(root: &Path, relative: &str) -> Result<PathBuf, String> {
    let normalized = normalize_relative(relative)?;
    let candidate = root.join(normalized);
    let canonical = fs::canonicalize(&candidate).map_err(|_| "asset content missing".to_string())?;
    let canonical_root = fs::canonicalize(root).map_err(|_| "asset root missing".to_string())?;
    if !canonical.starts_with(&canonical_root) {
        return Err("asset path escapes root".to_string());
    }
    Ok(canonical)
}

fn read_limited(path: &Path, maximum: u64) -> Result<Vec<u8>, String> {
    let metadata = fs::metadata(path).map_err(|_| "asset metadata unavailable".to_string())?;
    if metadata.len() > maximum {
        return Err("asset manifest exceeds maximum size".to_string());
    }
    fs::read(path).map_err(|_| "asset content unavailable".to_string())
}

fn validate_tileset_manifest(bytes: &[u8]) -> Result<HashSet<String>, String> {
    let document: Value = serde_json::from_slice(bytes).map_err(|_| "tileset manifest is invalid JSON".to_string())?;
    let root = document.as_object().ok_or_else(|| "tileset manifest root must be an object".to_string())?;
    let version = root.get("asset").and_then(Value::as_object).and_then(|asset| asset.get("version")).and_then(Value::as_str);
    if version.map(|value| !value.starts_with('1')).unwrap_or(true) {
        return Err("tileset manifest requires a 3D Tiles 1.x asset version".to_string());
    }
    let root_node = root.get("root").ok_or_else(|| "tileset manifest root node missing".to_string())?;
    let mut references = HashSet::new();
    validate_tileset_node(root_node, &mut references)?;
    Ok(references)
}

fn validate_tileset_node(node: &Value, references: &mut HashSet<String>) -> Result<(), String> {
    let object = node.as_object().ok_or_else(|| "tileset node must be an object".to_string())?;
    let bounding = object.get("boundingVolume").and_then(Value::as_object).ok_or_else(|| "tileset node bounding volume missing".to_string())?;
    let valid_bounding = bounding.get("box").and_then(Value::as_array).map(|items| items.len() == 12 && items.iter().all(Value::is_number)).unwrap_or(false)
        || bounding.get("sphere").and_then(Value::as_array).map(|items| items.len() == 4 && items.iter().all(Value::is_number)).unwrap_or(false)
        || bounding.get("region").and_then(Value::as_array).map(|items| items.len() == 6 && items.iter().all(Value::is_number)).unwrap_or(false);
    if !valid_bounding {
        return Err("tileset node contains an invalid bounding volume".to_string());
    }
    if let Some(content) = object.get("content") {
        collect_content_uri(content, references)?;
    }
    if let Some(contents) = object.get("contents").and_then(Value::as_array) {
        for content in contents {
            collect_content_uri(content, references)?;
        }
    }
    if let Some(children) = object.get("children").and_then(Value::as_array) {
        for child in children {
            validate_tileset_node(child, references)?;
        }
    }
    Ok(())
}

fn collect_content_uri(content: &Value, references: &mut HashSet<String>) -> Result<(), String> {
    let object = content.as_object().ok_or_else(|| "tileset content must be an object".to_string())?;
    let uri = object.get("uri").or_else(|| object.get("url")).and_then(Value::as_str).ok_or_else(|| "tileset content URI missing".to_string())?;
    let normalized = normalize_relative(uri)?;
    references.insert(normalized);
    Ok(())
}

fn stream_file(stream: &mut TcpStream, path: &Path, request_id: &str, metrics: &Metrics) -> Result<(), String> {
    let metadata = fs::metadata(path).map_err(|_| "asset metadata unavailable".to_string())?;
    let content_type = content_type(path);
    let headers = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: {content_type}\r\nContent-Length: {}\r\nCache-Control: private, max-age=60, must-revalidate\r\nVary: Authorization\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nX-Request-Id: {request_id}\r\nConnection: close\r\n\r\n",
        metadata.len()
    );
    stream.write_all(headers.as_bytes()).map_err(|_| "response write failed".to_string())?;
    let mut source = File::open(path).map_err(|_| "asset content unavailable".to_string())?;
    let copied = io::copy(&mut source, stream).map_err(|_| "asset stream failed".to_string())?;
    metrics.bytes_sent.fetch_add(copied, Ordering::Relaxed);
    Ok(())
}

fn content_type(path: &Path) -> &'static str {
    match path.extension().and_then(|value| value.to_str()).unwrap_or_default().to_ascii_lowercase().as_str() {
        "json" => "application/json; charset=utf-8",
        "b3dm" => "application/octet-stream",
        "i3dm" => "application/octet-stream",
        "pnts" => "application/octet-stream",
        "cmpt" => "application/octet-stream",
        "glb" => "model/gltf-binary",
        "terrain" => "application/vnd.quantized-mesh",
        "ktx2" => "image/ktx2",
        _ => "application/octet-stream",
    }
}

fn send_json(stream: &mut TcpStream, status: u16, reason: &str, body: &str, request_id: &str) -> Result<(), String> {
    let payload = if body.starts_with('{') { body.to_string() } else { format!("{{\"error\":\"{}\",\"requestId\":\"{}\"}}", escape_json(body), escape_json(request_id)) };
    let response = format!(
        "HTTP/1.1 {status} {reason}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nReferrer-Policy: no-referrer\r\nX-Request-Id: {request_id}\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    );
    stream.write_all(response.as_bytes()).map_err(|_| "response write failed".to_string())
}

fn send_metrics(stream: &mut TcpStream, metrics: &Metrics) -> Result<(), String> {
    let payload = format!(
        "# TYPE geospatial_cesium_asset_requests_total counter\ngeospatial_cesium_asset_requests_total {}\n# TYPE geospatial_cesium_asset_denied_total counter\ngeospatial_cesium_asset_denied_total {}\n# TYPE geospatial_cesium_asset_errors_total counter\ngeospatial_cesium_asset_errors_total {}\n# TYPE geospatial_cesium_asset_bytes_total counter\ngeospatial_cesium_asset_bytes_total {}\n",
        metrics.requests.load(Ordering::Relaxed),
        metrics.denied.load(Ordering::Relaxed),
        metrics.errors.load(Ordering::Relaxed),
        metrics.bytes_sent.load(Ordering::Relaxed),
    );
    let response = format!(
        "HTTP/1.1 200 OK\r\nContent-Type: text/plain; version=0.0.4; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n{payload}",
        payload.len()
    );
    stream.write_all(response.as_bytes()).map_err(|_| "metrics response failed".to_string())
}

fn sanitize_request_id(candidate: Option<&str>) -> String {
    candidate
        .filter(|value| value.len() >= 8 && value.len() <= 128)
        .filter(|value| value.chars().all(|char| char.is_ascii_alphanumeric() || matches!(char, '.' | '_' | ':' | '-')))
        .map(str::to_string)
        .unwrap_or_else(|| format!("{:x}", unix_time()))
}

fn unix_time() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_secs() as i64
}

fn hex_digest(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    let mut encoded = String::with_capacity(digest.len() * 2);
    for byte in digest {
        FmtWrite::write_fmt(&mut encoded, format_args!("{byte:02x}")).expect("writing to String cannot fail");
    }
    encoded
}

fn constant_time_equals(left: &[u8], right: &[u8]) -> bool {
    if left.len() != right.len() {
        return false;
    }
    let mut difference = 0u8;
    for (a, b) in left.iter().zip(right.iter()) {
        difference |= a ^ b;
    }
    difference == 0
}

fn escape_json(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"").replace('\n', "\\n").replace('\r', "\\r")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn signed_capability(secret: &[u8], audience: &str, asset_key: &str) -> String {
        let payload = json!({
            "iss": CAPABILITY_ISSUER,
            "ver": CAPABILITY_VERSION,
            "aud": audience,
            "sub": "42",
            "jti": "f44dc52a-5a14-45b1-bd9b-f9d0b2a79b53",
            "iat": unix_time() - 1,
            "exp": unix_time() + 300,
            "parcels": [4, 8],
            "purpose": "cesium.3d-review",
            "assetKey": asset_key,
        });
        let encoded = URL_SAFE_NO_PAD.encode(serde_json::to_vec(&payload).unwrap());
        let mut mac = HmacSha256::new_from_slice(secret).unwrap();
        mac.update(encoded.as_bytes());
        format!("{encoded}.{}", URL_SAFE_NO_PAD.encode(mac.finalize().into_bytes()))
    }

    #[test]
    fn validates_scoped_cesium_capability() {
        let secret = b"0123456789abcdef0123456789abcdef";
        let token = signed_capability(secret, "cesium_assets", "asset-001");
        let actual = verify_capability(Some(&format!("Bearer {token}")), secret).unwrap();
        assert_eq!(actual.asset_key.as_deref(), Some("asset-001"));
        assert_eq!(actual.parcels, vec![4, 8]);
    }

    #[test]
    fn rejects_wrong_audience_and_traversal_paths() {
        let secret = b"0123456789abcdef0123456789abcdef";
        let token = signed_capability(secret, "vector_tiles", "asset-001");
        assert!(verify_capability(Some(&format!("Bearer {token}")), secret).is_err());
        for path in ["../tileset.json", "/tileset.json", "content/../../secret.b3dm", "content\\secret.b3dm"] {
            assert!(normalize_relative(path).is_err(), "{path} should be rejected");
        }
    }

    #[test]
    fn validates_manifest_and_collects_only_safe_content() {
        let valid = br#"{
          "asset": {"version": "1.1"},
          "root": {
            "boundingVolume": {"box": [0,0,0,1,0,0,0,1,0,0,0,1]},
            "geometricError": 0,
            "content": {"uri": "tiles/0.b3dm"}
          }
        }"#;
        let references = validate_tileset_manifest(valid).unwrap();
        assert!(references.contains("tiles/0.b3dm"));

        let unsafe_uri = br#"{
          "asset": {"version": "1.1"},
          "root": {
            "boundingVolume": {"sphere": [0,0,0,1]},
            "content": {"uri": "../outside.b3dm"}
          }
        }"#;
        assert!(validate_tileset_manifest(unsafe_uri).is_err());
    }

    #[test]
    fn parses_only_the_expected_asset_route() {
        assert_eq!(parse_asset_path("/assets/asset-001/tileset.json").unwrap(), ("asset-001".to_string(), "tileset.json".to_string()));
        assert!(parse_asset_path("/assets/asset-001").is_err());
        assert!(parse_asset_path("/wrong/asset-001/tileset.json").is_err());
    }
}
