FROM rust:1.79-slim AS builder
WORKDIR /app
COPY rust-services/middleware-control-plane/Cargo.toml ./Cargo.toml
COPY rust-services/middleware-control-plane/src ./src
RUN cargo build --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=builder /app/target/release/middleware-control-plane /usr/local/bin/middleware-control-plane
ENV PORT=7010
CMD ["middleware-control-plane"]
