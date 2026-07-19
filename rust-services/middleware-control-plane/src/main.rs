use std::env;
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::time::Duration;

fn main() {
    let port = env::var("PORT").unwrap_or_else(|_| "7010".to_string());
    let listener = TcpListener::bind(format!("0.0.0.0:{}", port)).expect("bind listener");

    for stream in listener.incoming() {
        if let Ok(stream) = stream {
            handle_stream(stream);
        }
    }
}

fn handle_stream(mut stream: TcpStream) {
    let mut buffer = [0_u8; 4096];
    let bytes_read = match stream.read(&mut buffer) {
        Ok(size) => size,
        Err(_) => return,
    };

    let request = String::from_utf8_lossy(&buffer[..bytes_read]);
    let path = request
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .unwrap_or("/");

    let (status_line, body) = if path == "/health" {
        (
            "HTTP/1.1 200 OK",
            format!(
                "{{\"status\":\"{}\",\"services\":[{}]}}",
                overall_status(),
                service_rows().join(",")
            ),
        )
    } else if path == "/readiness" {
        (
            "HTTP/1.1 200 OK",
            readiness_payload(),
        )
    } else if path.starts_with("/sync/risk") {
        (
            "HTTP/1.1 200 OK",
            sync_risk_payload(path),
        )
    } else if path.starts_with("/sync") {
        (
            "HTTP/1.1 200 OK",
            "{\"accepted\":true,\"message\":\"sync request received\"}".to_string(),
        )
    } else {
        (
            "HTTP/1.1 404 NOT FOUND",
            "{\"error\":\"not found\"}".to_string(),
        )
    };

    let response = format!(
        "{}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
        status_line,
        body.len(),
        body
    );

    let _ = stream.write_all(response.as_bytes());
    let _ = stream.flush();
}

fn overall_status() -> &'static str {
    if services().iter().any(|(_, configured, reachable, _)| *configured && !*reachable) {
        "degraded"
    } else {
        "healthy"
    }
}

fn readiness_payload() -> String {
    let identity = service_group(&["keycloak", "permify"]);
    let gateway = service_group(&["apisix", "openappsec"]);

    format!(
        "{{\"overall\":\"{}\",\"domains\":[{},{}]}}",
        if identity.1 < 80 || gateway.1 < 80 { "degraded" } else { "healthy" },
        domain_json("Identity & Policy", identity.0, identity.1),
        domain_json("Gateway & Security", gateway.0, gateway.1)
    )
}

fn sync_risk_payload(path: &str) -> String {
    let network_quality = query_value(path, "network").unwrap_or_else(|| "stable".to_string());
    let queue_depth = query_value(path, "queue")
        .and_then(|value| value.parse::<u32>().ok())
        .unwrap_or(0);
    let has_conflict = query_value(path, "conflict")
        .map(|value| value == "true" || value == "1")
        .unwrap_or(false);

    let mut score = 90_i32;
    if network_quality == "poor" {
        score -= 30;
    } else if network_quality == "intermittent" {
        score -= 15;
    }
    if queue_depth > 20 {
        score -= 25;
    } else if queue_depth > 5 {
        score -= 10;
    }
    if has_conflict {
        score -= 25;
    }

    let normalized = score.clamp(10, 100);
    let risk = if normalized >= 80 {
        "low"
    } else if normalized >= 55 {
        "moderate"
    } else {
        "high"
    };

    format!(
        "{{\"network\":\"{}\",\"queueDepth\":{},\"hasConflict\":{},\"score\":{},\"risk\":\"{}\"}}",
        escape_json(&network_quality),
        queue_depth,
        has_conflict,
        normalized,
        risk
    )
}

fn service_rows() -> Vec<String> {
    services()
        .into_iter()
        .map(|(name, configured, reachable, message)| {
            format!(
                "{{\"name\":\"{}\",\"configured\":{},\"reachable\":{},\"message\":\"{}\"}}",
                name,
                configured,
                reachable,
                escape_json(&message)
            )
        })
        .collect()
}

fn services() -> Vec<(&'static str, bool, bool, String)> {
    vec![
        probe_http("keycloak", env::var("KEYCLOAK_URL").ok(), "/realms/master"),
        probe_http("permify", env::var("PERMIFY_URL").ok(), "/healthz"),
        probe_http("apisix", env::var("APISIX_ADMIN_URL").ok(), "/apisix/admin/routes"),
        probe_http("openappsec", env::var("OPENAPPSEC_URL").ok(), "/healthz"),
    ]
}

fn service_group(names: &[&str]) -> (Vec<String>, i32) {
    let rows = services();
    let mut selected = Vec::new();
    let mut score_total = 0_i32;
    let mut count = 0_i32;

    for (name, configured, reachable, message) in rows {
        if names.contains(&name) {
            selected.push(format!(
                "{{\"name\":\"{}\",\"configured\":{},\"reachable\":{},\"message\":\"{}\"}}",
                name,
                configured,
                reachable,
                escape_json(&message)
            ));
            score_total += if !configured { 35 } else if reachable { 100 } else { 20 };
            count += 1;
        }
    }

    let score = if count == 0 { 40 } else { score_total / count };
    (selected, score)
}

fn domain_json(name: &str, rows: Vec<String>, score: i32) -> String {
    let status = if score >= 80 {
        "healthy"
    } else if score >= 50 {
        "degraded"
    } else {
        "unhealthy"
    };

    format!(
        "{{\"name\":\"{}\",\"status\":\"{}\",\"score\":{},\"services\":[{}]}}",
        escape_json(name),
        status,
        score,
        rows.join(",")
    )
}

fn query_value(path: &str, key: &str) -> Option<String> {
    let query = path.split('?').nth(1)?;
    for pair in query.split('&') {
        let mut parts = pair.splitn(2, '=');
        let candidate_key = parts.next()?;
        let candidate_value = parts.next().unwrap_or_default();
        if candidate_key == key {
            return Some(candidate_value.to_string());
        }
    }
    None
}

fn probe_http(
    name: &'static str,
    base_url: Option<String>,
    path: &'static str,
) -> (&'static str, bool, bool, String) {
    let Some(base_url) = base_url else {
        return (name, false, false, format!("{} not configured", name));
    };

    let host_port = normalize_host_port(&base_url);
    let reachable = TcpStream::connect_timeout(
        &host_port.parse().unwrap_or_else(|_| "127.0.0.1:9".parse().unwrap()),
        Duration::from_secs(2),
    )
    .is_ok();

    (
        name,
        true,
        reachable,
        if reachable {
            format!("reachable via {}{}", base_url, path)
        } else {
            format!("unreachable at {}{}", base_url, path)
        },
    )
}

fn normalize_host_port(url: &str) -> String {
    let trimmed = url
        .trim_start_matches("http://")
        .trim_start_matches("https://");
    trimmed.split('/').next().unwrap_or(trimmed).to_string()
}

fn escape_json(input: &str) -> String {
    input.replace('\\', "\\\\").replace('"', "\\\"")
}
