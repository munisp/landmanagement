use enfipy_tigerbeetle as tb;
use serde::{Deserialize, Serialize};
use std::convert::Infallible;
use std::net::SocketAddr;
use std::sync::Arc;
use warp::{http::StatusCode, Filter, Reply};

#[derive(Serialize)]
struct HealthResponse {
    status: String,
    service: String,
}

#[derive(Deserialize)]
struct TransferRequest {
    /// Deterministic, client-generated u128 idempotency identifier.
    transfer_id: String,
    debit_account_id: String,
    credit_account_id: String,
    amount: u64,
    ledger_id: u32,
    code: u16,
}

#[derive(Serialize)]
struct TransferResponse {
    status: String,
    transfer_id: String,
}

#[derive(Serialize)]
struct ErrorResponse {
    error: String,
}

fn required_env(name: &str) -> String {
    std::env::var(name)
        .ok()
        .map(|value| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| panic!("{name} must be configured"))
}

fn parse_u128(value: &str, field: &str) -> Result<u128, String> {
    value
        .parse::<u128>()
        .map_err(|_| format!("{field} must be an unsigned 128-bit integer"))
}

fn with_client(
    client: Arc<tb::Client>,
) -> impl Filter<Extract = (Arc<tb::Client>,), Error = Infallible> + Clone {
    warp::any().map(move || Arc::clone(&client))
}

async fn submit_transfer(
    request: TransferRequest,
    client: Arc<tb::Client>,
) -> Result<impl Reply, Infallible> {
    let transfer_id = match parse_u128(&request.transfer_id, "transfer_id") {
        Ok(value) => value,
        Err(error) => {
            return Ok(warp::reply::with_status(
                warp::reply::json(&ErrorResponse { error }),
                StatusCode::BAD_REQUEST,
            ));
        }
    };
    let debit_account_id = match parse_u128(&request.debit_account_id, "debit_account_id") {
        Ok(value) => value,
        Err(error) => {
            return Ok(warp::reply::with_status(
                warp::reply::json(&ErrorResponse { error }),
                StatusCode::BAD_REQUEST,
            ));
        }
    };
    let credit_account_id = match parse_u128(&request.credit_account_id, "credit_account_id") {
        Ok(value) => value,
        Err(error) => {
            return Ok(warp::reply::with_status(
                warp::reply::json(&ErrorResponse { error }),
                StatusCode::BAD_REQUEST,
            ));
        }
    };

    if request.amount == 0 {
        return Ok(warp::reply::with_status(
            warp::reply::json(&ErrorResponse {
                error: "amount must be greater than zero".to_string(),
            }),
            StatusCode::BAD_REQUEST,
        ));
    }
    if debit_account_id == credit_account_id {
        return Ok(warp::reply::with_status(
            warp::reply::json(&ErrorResponse {
                error: "debit and credit accounts must differ".to_string(),
            }),
            StatusCode::BAD_REQUEST,
        ));
    }

    let transfer = tb::Transfer::new(transfer_id)
        .with_debit_account_id(debit_account_id)
        .with_credit_account_id(credit_account_id)
        .with_amount(request.amount as u128)
        .with_ledger(request.ledger_id)
        .with_code(request.code);

    match client.create_transfers(vec![transfer]).await {
        Ok(()) => Ok(warp::reply::with_status(
            warp::reply::json(&TransferResponse {
                status: "created".to_string(),
                transfer_id: request.transfer_id,
            }),
            StatusCode::CREATED,
        )),
        Err(error) => Ok(warp::reply::with_status(
            warp::reply::json(&ErrorResponse {
                error: format!("TigerBeetle create_transfers failed: {error}"),
            }),
            StatusCode::UNPROCESSABLE_ENTITY,
        )),
    }
}

#[tokio::main]
async fn main() {
    let address = required_env("TIGERBEETLE_ADDRESS");
    let cluster_id = required_env("TIGERBEETLE_CLUSTER_ID")
        .parse::<u128>()
        .unwrap_or_else(|_| panic!("TIGERBEETLE_CLUSTER_ID must be an unsigned 128-bit integer"));
    let port = required_env("PORT")
        .parse::<u16>()
        .unwrap_or_else(|_| panic!("PORT must be a valid TCP port"));

    let client = Arc::new(
        tb::Client::new(cluster_id, address.as_bytes())
            .unwrap_or_else(|error| panic!("failed to initialize TigerBeetle client: {error}")),
    );

    let health = warp::path!("health").map(|| {
        warp::reply::json(&HealthResponse {
            status: "up".to_string(),
            service: "tigerbeetle-bridge".to_string(),
        })
    });

    let transfer = warp::path!("transfer")
        .and(warp::post())
        .and(warp::body::json())
        .and(with_client(client))
        .and_then(submit_transfer);

    let routes = health.or(transfer);
    let addr: SocketAddr = format!("0.0.0.0:{port}")
        .parse()
        .expect("configured port must produce a valid socket address");
    println!("TigerBeetle bridge listening on {addr}");
    warp::serve(routes).run(addr).await;
}
