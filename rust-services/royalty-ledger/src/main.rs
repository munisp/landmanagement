use std::env;

#[tokio::main]
async fn main() {
    let port = env::var("PORT").unwrap_or_else(|_| "8087".to_string());
    println!("Royalty ledger service starting on port {}", port);
    
    // In a real implementation, this would connect to Kafka to consume production events
    // and route them to TigerBeetle for high-throughput ledger recording.
    // For now, this is a placeholder to demonstrate the architecture.
    
    loop {
        tokio::time::sleep(tokio::time::Duration::from_secs(60)).await;
    }
}
