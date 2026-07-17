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
