use warp::Filter;
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;

#[derive(Deserialize, Serialize)]
struct HealthResponse {
    status: String,
    service: String,
}

#[derive(Deserialize, Serialize)]
struct TransferRequest {
    debit_account_id: String,
    credit_account_id: String,
    amount: u64,
    ledger_id: u32,
    code: u16,
}

#[derive(Deserialize, Serialize)]
struct TransferResponse {
    status: String,
    transfer_id: String,
}

#[tokio::main]
async fn main() {
    // Health check endpoint
    let health = warp::path!("health").map(|| {
        warp::reply::json(&HealthResponse {
            status: "up".to_string(),
            service: "tigerbeetle-bridge".to_string(),
        })
    });

    // Transfer endpoint
    let transfer = warp::path!("transfer")
        .and(warp::post())
        .and(warp::body::json())
        .map(|req: TransferRequest| {
            // Mock TigerBeetle transfer logic
            println!("Processing transfer: {} -> {} (Amount: {})", 
                req.debit_account_id, req.credit_account_id, req.amount);
                
            warp::reply::json(&TransferResponse {
                status: "success".to_string(),
                transfer_id: "mock-tb-transfer-123".to_string(),
            })
        });

    let routes = health.or(transfer);

    let port = std::env::var("PORT").unwrap_or_else(|_| "7020".to_string());
    let addr: SocketAddr = format!("0.0.0.0:{}", port).parse().unwrap();

    println!("Starting TigerBeetle Bridge on {}", addr);
    warp::serve(routes).run(addr).await;
}
